const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.sendPushNotification = onDocumentCreated(
  "feed/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) { console.log("Sem data no evento"); return; }

    const feedData = snap.data();
    const targetUserId = feedData.targetUserId;
    if (!targetUserId) { console.log("Feed item sem targetUserId, ignorando push"); return; }

    console.log(`Feed item criado para userId: ${targetUserId}, type: ${feedData.type}, text: ${feedData.text || "sem text"}`);

    // Buscar o token FCM do usuário
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(targetUserId).get();
    if (!userDoc.exists) { console.log(`User ${targetUserId} não existe`); return; }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;
    if (!fcmToken) { console.log(`User ${targetUserId} (${userData.firstName}) sem fcmToken`); return; }
    console.log(`Token encontrado para ${userData.firstName}, enviando push...`);

    // Montar body a partir do feed item
    const bodyText = feedData.detail
      ? `${feedData.icon || ""} ${feedData.text}: ${feedData.detail}`
      : `${feedData.icon || ""} ${feedData.text || "Nova atualização"}`;

    // Enviar apenas como data message (evita notificação duplicada pelo browser)
    const message = {
      token: fcmToken,
      data: {
        title: "🔔 OVER LABS",
        body: bodyText,
      },
      android: {
        priority: "high",
      },
      webpush: {
        headers: { Urgency: "high" },
      },
    };

    try {
      await getMessaging().send(message);
      console.log(`Push enviado para ${targetUserId}`);
    } catch (err) {
      console.error(`Erro ao enviar push para ${targetUserId}:`, err.message);
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await db.collection("users").doc(targetUserId).update({ fcmToken: "" });
      }
    }
  }
);

// ══════════════════════════════════════════════════════════════════
// ═══ Auto-promoção da lista de espera em caronas ═════════════════
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
          detail: `Uma vaga abriu na carona "${rideTitle}" e você foi confirmado automaticamente!`,
          targetUserId: pu.userId,
          createdAt: FieldValue.serverTimestamp()
        });
        await db.collection("notifications").doc(pu.userId).collection("items").add({
          msg: `🎉 Uma vaga abriu na carona "${rideTitle}" e você foi confirmado automaticamente!`,
          read: false,
          at: FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error(`[AutoPromote] Erro ao notificar ${pu.userId}:`, e.message);
      }
    }

    if (promotedUsers.length > 0) {
      console.log(`[AutoPromote] ${promotedUsers.length} aluno(s) promovido(s) na carona "${rideTitle}" (ride ${event.params.rideId})`);
    }
  }
);
