const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

// ──────────────────────────────────────────────────────────────────
// Helpers de envio de push
// ──────────────────────────────────────────────────────────────────

// Envia push (data-only, para o SW exibir) para uma lista de alvos
// [{ id, token }]. Limpa tokens invalidos do Firestore. Suporta >500.
async function sendToTokens(db, targets, bodyText) {
  if (!targets.length) { console.log("Nenhum token alvo, nada a enviar"); return; }
  const messaging = getMessaging();
  const base = {
    data: { title: "🔔 OVER LABS", body: bodyText },
    android: { priority: "high" },
    webpush: { headers: { Urgency: "high" } },
  };

  let ok = 0, fail = 0;
  const cleanup = [];
  for (let i = 0; i < targets.length; i += 450) {
    const chunk = targets.slice(i, i + 450);
    const resp = await messaging.sendEachForMulticast({
      ...base,
      tokens: chunk.map((t) => t.token),
    });
    ok += resp.successCount;
    fail += resp.failureCount;
    resp.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = (r.error && r.error.code) || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        cleanup.push(
          db.collection("users").doc(chunk[idx].id)
            .update({ fcmToken: "" }).catch(() => {})
        );
      }
    });
  }
  await Promise.all(cleanup);
  console.log(`Push: ${ok} ok, ${fail} falha(s); ${cleanup.length} token(s) invalido(s) limpo(s)`);
}

// Arenas-alvo de um item de feed (null = todos). Espelha o app do aluno.
function targetArenasOf(feed) {
  if (Array.isArray(feed.targetArenas) && feed.targetArenas.length > 0) return feed.targetArenas;
  if (feed.targetArena) return [feed.targetArena];
  return null;
}
function userMatchesArenas(userArena, arenas) {
  if (!arenas) return true;
  const ua = userArena || "";
  if (ua === "both") return true;
  return arenas.indexOf(ua) >= 0 || arenas.indexOf("both") >= 0;
}

// Coleta alvos (com token valido) entre todos os usuarios, filtrando por arena
async function collectBroadcastTargets(db, arenas) {
  const usersSnap = await db.collection("users").get();
  const targets = [];
  usersSnap.forEach((d) => {
    const u = d.data();
    const t = u.fcmToken;
    if (!t || typeof t !== "string" || t.length < 20) return;
    if (!userMatchesArenas(u.arena, arenas)) return;
    targets.push({ id: d.id, token: t });
  });
  return targets;
}

// ──────────────────────────────────────────────────────────────────
// Push em todo item de feed: pessoal (targetUserId) OU broadcast
// ──────────────────────────────────────────────────────────────────
exports.sendPushNotification = onDocumentCreated(
  "feed/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) { console.log("Sem data no evento"); return; }

    const feed = snap.data();
    if (feed.hidden === true) { console.log("Feed item oculto, sem push"); return; }

    const db = getFirestore();
    const bodyText = (feed.detail
      ? `${feed.icon || ""} ${feed.text || ""}: ${feed.detail}`
      : `${feed.icon || ""} ${feed.text || "Nova atualização"}`).trim();

    // 1) Notificacao PESSOAL
    if (feed.targetUserId) {
      const userDoc = await db.collection("users").doc(feed.targetUserId).get();
      if (!userDoc.exists) { console.log(`User ${feed.targetUserId} nao existe`); return; }
      const token = userDoc.data().fcmToken;
      if (!token) { console.log(`User ${feed.targetUserId} sem fcmToken`); return; }
      await sendToTokens(db, [{ id: feed.targetUserId, token }], bodyText);
      return;
    }

    // 2) BROADCAST para todos os alunos (respeitando arena do item)
    const arenas = targetArenasOf(feed);
    const targets = await collectBroadcastTargets(db, arenas);
    console.log(`Broadcast "${feed.type || "?"}" -> ${targets.length} aluno(s) com token (arenas: ${arenas ? arenas.join(",") : "todas"})`);
    await sendToTokens(db, targets, bodyText);
  }
);

// ──────────────────────────────────────────────────────────────────
// Push quando um novo item entra na loja (cuts_items)
// ──────────────────────────────────────────────────────────────────
exports.notifyNewShopItem = onDocumentCreated(
  "cuts_items/{itemId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const item = snap.data();
    if (item.hidden === true) { console.log("Item da loja oculto, sem push"); return; }

    const db = getFirestore();
    const nome = item.nome || "Novo item";
    const bodyText = `🛒 Novidade na loja: ${nome}! Garanta o seu com seus CUTS.`;
    const targets = await collectBroadcastTargets(db, null);
    console.log(`Novo item na loja "${nome}" -> ${targets.length} aluno(s)`);
    await sendToTokens(db, targets, bodyText);
  }
);

// ══════════════════════════════════════════════════════════════════
// ═══ Auto-promoção da lista de espera em Reservas ═════════════════
// ══════════════════════════════════════════════════════════════════
// Sempre que um doc em "rides" for escrito e houver vagas livres
// + pessoas na fila de espera, promove automaticamente.
// Funciona como rede de segurança server-side.

exports.autoPromoteWaitlist = onDocumentWritten(
  "rides/{rideId}",
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return; // doc deletado

    const after = afterSnap.data();
    const booked = after.booked || [];
    const waitlist = after.waitlist || [];
    const seats = after.seats || 0;

    // Nada a fazer se não há vagas livres ou fila vazia
    if (booked.length >= seats || waitlist.length === 0) return;

    const db = getFirestore();
    const rideRef = db.collection("rides").doc(event.params.rideId);

    let promotedUsers = [];

    await db.runTransaction(async (tx) => {
      const doc = await tx.get(rideRef);
      if (!doc.exists) return;
      const data = doc.data();
      const curBooked = data.booked || [];
      const curWl = data.waitlist || [];
      const curSeats = data.seats || 0;

      const freeSpots = curSeats - curBooked.length;
      if (freeSpots <= 0 || curWl.length === 0) return;

      const qty = Math.min(freeSpots, curWl.length);
      promotedUsers = curWl.slice(0, qty);

      tx.update(rideRef, {
        booked: [...curBooked, ...promotedUsers],
        waitlist: curWl.slice(qty)
      });
    });

    // Notificar cada promovido
    const rideTitle = after.title || "";
    for (const pu of promotedUsers) {
      if (!pu.userId) continue;
      try {
        await db.collection("feed").add({
          type: "waitlist_promotion",
          icon: "🎉",
          text: "Vaga confirmada!",
          detail: `Uma vaga abriu na Reserva "${rideTitle}" e você foi confirmado automaticamente!`,
          targetUserId: pu.userId,
          createdAt: FieldValue.serverTimestamp()
        });
        await db.collection("notifications").doc(pu.userId).collection("items").add({
          msg: `🎉 Uma vaga abriu na Reserva "${rideTitle}" e você foi confirmado automaticamente!`,
          read: false,
          at: FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error(`[AutoPromote] Erro ao notificar ${pu.userId}:`, e.message);
      }
    }

    if (promotedUsers.length > 0) {
      console.log(`[AutoPromote] ${promotedUsers.length} aluno(s) promovido(s) na Reserva "${rideTitle}" (ride ${event.params.rideId})`);
    }
  }
);

// ══════════════════════════════════════════════════════════════════
// ═══ Login Diário — Reset semanal automático ═════════════════════
// ══════════════════════════════════════════════════════════════════
// Toda segunda-feira 11:58 (horário de Brasília), apaga todas as
// confirmações de login para que o ciclo da nova semana (que começa
// segunda 12:00) comece zerado para todos os alunos.

exports.resetDailyLoginsWeekly = onSchedule(
  {
    schedule: "58 11 * * 1",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = getFirestore();
    console.log("[ResetDailyLogins] Iniciando reset semanal...");
    try {
      let total = 0;
      // Apagar em lotes para escalar com volume grande
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const snap = await db.collection("dailyLogins").limit(450).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        total += snap.size;
        if (snap.size < 450) break;
      }
      console.log(`[ResetDailyLogins] ${total} confirmação(ões) apagada(s).`);
    } catch (err) {
      console.error("[ResetDailyLogins] Erro:", err);
      throw err;
    }
  }
);
