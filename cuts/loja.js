/* ═══════════════════════════════════════════
   LOJA CUTS — Lógica
   Módulo independente — não altera JS existente
   ═══════════════════════════════════════════ */

// ── Estado ──
let db = null;
let firebaseOk = false;
let currentUser = null;
let userCuts = 0;
let allItems = [];
let myInventory = [];     // [{itemId, equipado}]
let currentTab = "todos";
let selectedItem = null;

// ── Init Firebase ──
function initFirebase() {
  try {
    const firebaseConfig = {
      apiKey:            "AIzaSyAc9Ews7WVz6GSBp9vzXF4sFI1SMwzklX0",
      authDomain:        "carolampra.firebaseapp.com",
      projectId:         "carolampra",
      storageBucket:     "carolampra.firebasestorage.app",
      messagingSenderId: "821388549140",
      appId:             "1:821388549140:web:3f60aa294f6f67949adb01"
    };
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    firebaseOk = true;
    console.log("[Loja] Firebase OK");
  } catch (e) {
    console.error("[Loja] Firebase error:", e);
  }
}

// ── Auth — reutiliza sessão do aluno.html ──
function loadUser() {
  const raw = localStorage.getItem("carolampra_user");
  if (!raw) {
    console.warn("[Loja] Usuário não logado, redirecionando...");
    window.location.href = "../aluno.html";
    return false;
  }
  currentUser = JSON.parse(raw);
  console.log("[Loja] Usuário:", currentUser.firstName, "(", currentUser.id, ")");
  return true;
}

// ── Saldo CUTS — listener em tempo real ──
function listenCuts() {
  if (!firebaseOk || !currentUser) return;

  // Cache local para exibir imediatamente
  const cached = localStorage.getItem("carolampra_cuts");
  if (cached) {
    userCuts = parseInt(cached, 10) || 0;
    updateSaldoUI();
  }

  db.collection("users").doc(currentUser.id).onSnapshot(doc => {
    if (doc.exists) {
      userCuts = doc.data().cuts || 0;
      localStorage.setItem("carolampra_cuts", userCuts);
      updateSaldoUI();
      console.log("[Loja] Saldo atualizado:", userCuts);
    }
  }, err => {
    console.error("[Loja] Erro ao ouvir saldo:", err);
  });
}

function updateSaldoUI() {
  const el = document.getElementById("saldo-valor");
  if (el) el.textContent = userCuts;
}

// ── Carregar itens da loja (cuts_items) ──
async function loadItems() {
  if (!firebaseOk) return;
  try {
    const snap = await db.collection("cuts_items").orderBy("criadoEm", "desc").get();
    allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log("[Loja] Itens carregados:", allItems.length);
    renderItems();
  } catch (e) {
    console.error("[Loja] Erro ao carregar itens:", e);
    document.getElementById("items-grid").innerHTML =
      '<div class="empty"><div class="icon">⚠️</div><p>Erro ao carregar itens</p></div>';
  }
}

// ── Carregar inventário do usuário ──
async function loadInventory() {
  if (!firebaseOk || !currentUser) return;
  try {
    const snap = await db.collection("cuts_inventory")
      .where("userId", "==", currentUser.id)
      .get();
    myInventory = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    console.log("[Loja] Inventário:", myInventory.length, "itens");
  } catch (e) {
    console.error("[Loja] Erro ao carregar inventário:", e);
  }
}

// ── Render itens na grid ──
function renderItems() {
  const grid = document.getElementById("items-grid");
  const loading = document.getElementById("loja-loading");
  if (loading) loading.style.display = "none";

  let filtered = allItems;
  if (currentTab !== "todos") {
    filtered = allItems.filter(i => i.tipo === currentTab);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="icon">🛒</div><p>Nenhum item disponível</p><small>Novos itens em breve!</small></div>';
    return;
  }

  const ownedIds = new Set(myInventory.map(i => i.itemId));

  grid.innerHTML = filtered.map(item => {
    const owned = ownedIds.has(item.id);
    return `
      <div class="loja-item ${owned ? 'owned' : ''}" onclick="openBuyModal('${item.id}')">
        <img class="item-img" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}" loading="lazy">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.nome)}</div>
          <div class="item-type">${escapeHtml(item.tipo)}</div>
          <div class="item-price"><span class="coin">🪙</span> ${item.preco}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ── Render inventário ──
function renderInventory() {
  const container = document.getElementById("inventory-content");
  if (!container) return;

  if (myInventory.length === 0) {
    container.innerHTML = '<div class="empty"><div class="icon">🎒</div><p>Inventário vazio</p><small>Compre itens na loja!</small></div>';
    return;
  }

  // Agrupar por tipo
  const groups = {};
  myInventory.forEach(inv => {
    const item = allItems.find(i => i.id === inv.itemId);
    if (!item) return;
    if (!groups[item.tipo]) groups[item.tipo] = [];
    groups[item.tipo].push({ ...item, docId: inv.docId, equipado: inv.equipado });
  });

  const tipoLabels = { avatar: "🖼️ Avatares", moldura: "🖼️ Molduras", banner: "🌄 Banners", emblema: "🏅 Emblemas" };

  let html = "";
  for (const [tipo, items] of Object.entries(groups)) {
    html += `<div class="inv-section">`;
    html += `<div class="inv-title">${tipoLabels[tipo] || tipo}</div>`;
    html += `<div class="inv-grid">`;
    items.forEach(item => {
      html += `
        <div class="inv-item ${item.equipado ? 'equipped' : ''}" onclick="toggleEquip('${item.id}', '${tipo}')">
          <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}" loading="lazy">
          <div class="inv-name">${escapeHtml(item.nome)}</div>
        </div>
      `;
    });
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

// ── Tabs ──
function switchLojaTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".loja-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  renderItems();
}

// ── Alternar entre Loja e Inventário ──
function showView(view) {
  const lojaView = document.getElementById("view-loja");
  const invView = document.getElementById("view-inventario");
  const btnLoja = document.getElementById("btn-view-loja");
  const btnInv = document.getElementById("btn-view-inv");

  if (view === "loja") {
    lojaView.style.display = "block";
    invView.style.display = "none";
    btnLoja.classList.add("active");
    btnInv.classList.remove("active");
  } else {
    lojaView.style.display = "none";
    invView.style.display = "block";
    btnLoja.classList.remove("active");
    btnInv.classList.add("active");
    renderInventory();
  }
}

// ── Modal de compra ──
function openBuyModal(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  selectedItem = item;
  const owned = myInventory.some(i => i.itemId === itemId);

  document.getElementById("modal-img").src = item.url;
  document.getElementById("modal-name").textContent = item.nome;
  document.getElementById("modal-type").textContent = item.tipo;
  document.getElementById("modal-price-val").textContent = item.preco;

  const after = userCuts - item.preco;
  const balanceEl = document.getElementById("modal-balance");
  const btnBuy = document.getElementById("btn-confirm-buy");

  if (owned) {
    balanceEl.innerHTML = '<span style="color:#22c55e;font-weight:700">✓ Você já possui este item</span>';
    btnBuy.disabled = true;
    btnBuy.textContent = "Já adquirido";
  } else if (after < 0) {
    balanceEl.innerHTML = `Seu saldo: <strong>${userCuts}</strong> CUTS — Restaria: <span class="negative">${after}</span> CUTS`;
    btnBuy.disabled = true;
    btnBuy.textContent = "Saldo insuficiente 😢";
  } else {
    balanceEl.innerHTML = `Seu saldo: <strong>${userCuts}</strong> CUTS → Restará: <span class="after">${after}</span> CUTS`;
    btnBuy.disabled = false;
    btnBuy.textContent = "🪙 Confirmar Compra";
  }

  document.getElementById("buy-modal").classList.add("show");
}

function closeBuyModal() {
  document.getElementById("buy-modal").classList.remove("show");
  selectedItem = null;
}

// ── Comprar item ──
async function confirmPurchase() {
  if (!selectedItem || !firebaseOk || !currentUser) return;

  const btn = document.getElementById("btn-confirm-buy");
  btn.disabled = true;
  btn.textContent = "Processando...";

  try {
    // 1. Buscar saldo atualizado (evitar race condition)
    const userDoc = await db.collection("users").doc(currentUser.id).get();
    const freshCuts = userDoc.data().cuts || 0;

    if (freshCuts < selectedItem.preco) {
      showToast("❌ Saldo insuficiente!");
      closeBuyModal();
      return;
    }

    // 2. Verificar se já possui
    const existCheck = await db.collection("cuts_inventory")
      .where("userId", "==", currentUser.id)
      .where("itemId", "==", selectedItem.id)
      .get();

    if (!existCheck.empty) {
      showToast("⚠️ Você já possui este item!");
      closeBuyModal();
      await loadInventory();
      renderItems();
      return;
    }

    // 3. Batch: descontar saldo + adicionar ao inventário + registrar transação
    const batch = db.batch();

    // Descontar CUTS
    const userRef = db.collection("users").doc(currentUser.id);
    batch.update(userRef, {
      cuts: firebase.firestore.FieldValue.increment(-selectedItem.preco)
    });

    // Adicionar ao inventário
    const invRef = db.collection("cuts_inventory").doc();
    batch.set(invRef, {
      userId: currentUser.id,
      itemId: selectedItem.id,
      equipado: false,
      compradoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Registrar transação
    const txRef = db.collection("cuts_transactions").doc();
    batch.set(txRef, {
      userId: currentUser.id,
      valor: selectedItem.preco,
      tipo: "compra",
      itemId: selectedItem.id,
      itemNome: selectedItem.nome,
      data: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    console.log("[Loja] Compra OK:", selectedItem.nome, "por", selectedItem.preco, "CUTS");
    showToast(`✅ ${selectedItem.nome} adquirido!`);
    closeBuyModal();

    // Atualizar dados locais
    await loadInventory();
    renderItems();
  } catch (e) {
    console.error("[Loja] Erro na compra:", e);
    showToast("❌ Erro ao comprar. Tente novamente.");
  } finally {
    btn.disabled = false;
    btn.textContent = "🪙 Confirmar Compra";
  }
}

// ── Equipar / Desequipar ──
async function toggleEquip(itemId, tipo) {
  if (!firebaseOk || !currentUser) return;
  try {
    const inv = myInventory.find(i => i.itemId === itemId);
    if (!inv) return;

    const item = allItems.find(a => a.id === itemId);

    if (inv.equipado) {
      // Desequipar
      await db.collection("cuts_inventory").doc(inv.docId).update({ equipado: false });
      console.log("[Loja] Desequipado:", itemId);

      // Se for avatar, restaurar foto original
      if (tipo === "avatar") {
        const userDoc = await db.collection("users").doc(currentUser.id).get();
        const userData = userDoc.data();
        // Usar originalPhotoURL se existir, senão manter photoURL atual (sem avatar)
        const originalPhoto = userData.originalPhotoURL || userData.photoURL || "";
        const updates = { equippedAvatarItemId: "" };
        if (userData.originalPhotoURL) {
          updates.photoURL = userData.originalPhotoURL;
        }
        await db.collection("users").doc(currentUser.id).update(updates);
        if (updates.photoURL) {
          localStorage.setItem("carolampra_photo", updates.photoURL);
        }
        showToast("Foto de perfil restaurada");
      } else {
        showToast("Item desequipado");
      }
    } else {
      // Desequipar outros do mesmo tipo primeiro
      const sameType = myInventory.filter(i => {
        const it = allItems.find(a => a.id === i.itemId);
        return it && it.tipo === tipo && i.equipado;
      });

      const batch = db.batch();
      sameType.forEach(i => {
        batch.update(db.collection("cuts_inventory").doc(i.docId), { equipado: false });
      });

      // Equipar este
      batch.update(db.collection("cuts_inventory").doc(inv.docId), { equipado: true });

      // Se for avatar, trocar foto de perfil
      if (tipo === "avatar" && item && item.url) {
        const userDoc = await db.collection("users").doc(currentUser.id).get();
        const userData = userDoc.data();
        // Salvar foto pessoal original (nunca sobrescrever com URL de avatar)
        const updateData = { photoURL: item.url, equippedAvatarItemId: itemId };
        if (!userData.originalPhotoURL || !userData.equippedAvatarItemId) {
          // Salvar foto atual como original só se não tem avatar equipado
          if (userData.photoURL) updateData.originalPhotoURL = userData.photoURL;
        }
        batch.update(db.collection("users").doc(currentUser.id), updateData);
        localStorage.setItem("carolampra_photo", item.url);
      }

      await batch.commit();

      console.log("[Loja] Equipado:", itemId, "(tipo:", tipo, ")");
      if (tipo === "avatar") {
        showToast("✅ Avatar equipado como foto de perfil!");
      } else {
        showToast("✅ Item equipado!");
      }
    }

    await loadInventory();
    renderInventory();
  } catch (e) {
    console.error("[Loja] Erro ao equipar:", e);
    showToast("❌ Erro ao equipar");
  }
}

// ── Helpers ──
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ── Bootstrap ──
async function initLoja() {
  initFirebase();
  if (!loadUser()) return;
  if (!firebaseOk) {
    document.getElementById("items-grid").innerHTML =
      '<div class="empty"><div class="icon">⚠️</div><p>Firebase não disponível</p></div>';
    return;
  }
  listenCuts();
  await loadInventory();
  await loadItems();

  // Se acessou via #inventario, abrir direto no inventário
  if (window.location.hash === "#inventario") {
    showView("inventario");
  }
}

document.addEventListener("DOMContentLoaded", initLoja);
