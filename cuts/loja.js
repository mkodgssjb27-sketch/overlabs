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
let chunkCache = {};       // { itemId: fullBase64Url }

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

// ── Listener tempo real dos itens da loja (cuts_items) ──
function loadItems() {
  if (!firebaseOk) return;
  db.collection("cuts_items").orderBy("criadoEm", "desc").onSnapshot(snap => {
    allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log("[Loja] Itens atualizados:", allItems.length);
    renderItems();
    if (myInventory.length) renderInventory();
    // Carregar chunks de itens grandes em background
    loadChunkedUrls();
  }, err => {
    console.error("[Loja] Erro ao ouvir itens:", err);
    document.getElementById("items-grid").innerHTML =
      '<div class="empty"><div class="icon">⚠️</div><p>Erro ao carregar itens</p></div>';
  });
}

// ── Carrega URLs completas de itens com chunks ──
async function loadChunkedUrls() {
  const chunked = allItems.filter(i => i.chunked && !chunkCache[i.id]);
  if (!chunked.length) return;
  for (const item of chunked) {
    try {
      const snap = await db.collection("cuts_items").doc(item.id)
        .collection("chunks").get();
      if (snap.empty) continue;
      const sorted = snap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      chunkCache[item.id] = sorted.map(d => d.data().data).join("");
      console.log("[Loja] Chunks carregados para:", item.nome);
      // Atualizar imagens sem re-renderizar toda a grid (preserva animação GIF)
      document.querySelectorAll('img[data-item-id="' + item.id + '"]').forEach(img => {
        img.src = chunkCache[item.id];
      });
    } catch(e) {
      console.error("[Loja] Erro chunks:", item.id, e);
    }
  }
}

// ── Carrega chunks de itens do inventário (para itens removidos da loja) ──
async function loadInventoryChunks() {
  const need = myInventory.filter(inv => inv.chunked && !chunkCache[inv.itemId]);
  if (!need.length) return;
  for (const inv of need) {
    try {
      const snap = await db.collection("cuts_inventory").doc(inv.docId)
        .collection("chunks").get();
      if (snap.empty) continue;
      const sorted = snap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      chunkCache[inv.itemId] = sorted.map(d => d.data().data).join("");
      console.log("[Loja] Chunks inventário carregados:", inv.nome);
      document.querySelectorAll('img[data-item-id="' + inv.itemId + '"]').forEach(img => {
        img.src = chunkCache[inv.itemId];
      });
    } catch(e) {
      console.error("[Loja] Erro chunks inventário:", inv.docId, e);
    }
  }
}

// ── Listener tempo real do inventário do usuário ──
function loadInventory() {
  if (!firebaseOk || !currentUser) return;
  db.collection("cuts_inventory")
    .where("userId", "==", currentUser.id)
    .onSnapshot(snap => {
      myInventory = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      console.log("[Loja] Inventário atualizado:", myInventory.length, "itens");
      renderInventory();
      renderItems(); // Atualizar badges de "owned"
      loadInventoryChunks(); // Carregar GIFs de itens removidos da loja
    }, err => {
      console.error("[Loja] Erro ao ouvir inventário:", err);
    });
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
    const imgUrl = chunkCache[item.id] || item.url;
    return `
      <div class="loja-item ${owned ? 'owned' : ''}" onclick="openBuyModal('${item.id}')">
        <img class="item-img" data-item-id="${item.id}" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.nome)}">
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

  // Agrupar por tipo (usa dados salvos no inventário, fallback para allItems para compras antigas)
  const groups = {};
  myInventory.forEach(inv => {
    const fromShop = allItems.find(i => i.id === inv.itemId);
    const nome = inv.nome || (fromShop && fromShop.nome) || "Item";
    const url = chunkCache[inv.itemId] || inv.url || (fromShop && fromShop.url) || "";
    const tipo = inv.tipo || (fromShop && fromShop.tipo) || "outro";
    if (!url) return;
    if (!groups[tipo]) groups[tipo] = [];
    groups[tipo].push({ id: inv.itemId, nome, url, tipo, docId: inv.docId, equipado: inv.equipado });
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
          <img data-item-id="${item.id}" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}">
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

  document.getElementById("modal-img").src = chunkCache[item.id] || item.url;
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
      return;
    }

    // 3. Batch: descontar saldo + adicionar ao inventário + registrar transação
    const batch = db.batch();

    // Descontar CUTS
    const userRef = db.collection("users").doc(currentUser.id);
    batch.update(userRef, {
      cuts: firebase.firestore.FieldValue.increment(-selectedItem.preco)
    });

    // Adicionar ao inventário (salvar dados completos do item para persistir mesmo se removido da loja)
    const invRef = db.collection("cuts_inventory").doc();
    // Para itens com chunks, salvar thumbnail (url do doc principal) no inventário
    const invUrl = selectedItem.chunked ? selectedItem.url : (chunkCache[selectedItem.id] || selectedItem.url);
    const invData = {
      userId: currentUser.id,
      itemId: selectedItem.id,
      nome: selectedItem.nome,
      url: invUrl,
      tipo: selectedItem.tipo,
      equipado: false,
      compradoEm: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (selectedItem.chunked) invData.chunked = true;
    batch.set(invRef, invData);

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
    const purchasedItemId = selectedItem.id;
    const purchasedChunked = selectedItem.chunked;
    showToast(`✅ ${selectedItem.nome} adquirido!`);
    closeBuyModal();

    // Copiar chunks para o inventário em background (preserva GIF mesmo se removido da loja)
    if (purchasedChunked) {
      (async function() {
        try {
          const chunksSnap = await db.collection("cuts_items").doc(purchasedItemId)
            .collection("chunks").get();
          if (!chunksSnap.empty) {
            for (const chunkDoc of chunksSnap.docs) {
              await db.collection("cuts_inventory").doc(invRef.id)
                .collection("chunks").doc(chunkDoc.id).set(chunkDoc.data());
            }
            console.log("[Loja] Chunks copiados para inventário:", chunksSnap.size);
          }
        } catch(e) {
          console.error("[Loja] Erro copiando chunks para inventário:", e);
        }
      })();
    }
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

    // Se é chunked e não está no cache, carregar agora antes de tudo
    let isChunked = inv.chunked || (allItems.find(a => a.id === itemId) || {}).chunked;
    if (isChunked && !chunkCache[itemId]) {
      // Tentar da loja primeiro
      let loaded = false;
      try {
        const shopSnap = await db.collection("cuts_items").doc(itemId).collection("chunks").get();
        if (!shopSnap.empty) {
          const sorted = shopSnap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
          chunkCache[itemId] = sorted.map(d => d.data().data).join("");
          loaded = true;
        }
      } catch(e) {}
      // Fallback: chunks do inventário
      if (!loaded) {
        try {
          const invSnap = await db.collection("cuts_inventory").doc(inv.docId).collection("chunks").get();
          if (!invSnap.empty) {
            const sorted = invSnap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            chunkCache[itemId] = sorted.map(d => d.data().data).join("");
          }
        } catch(e) {}
      }
    }

    // Dados do item: preferir chunkCache (URL completa), depois allItems, fallback para inventário
    const fromShop = allItems.find(a => a.id === itemId);
    const itemUrl = chunkCache[itemId] || (fromShop && fromShop.url) || inv.url || "";
    // Atualizar flag após possível carregamento de chunks
    if (chunkCache[itemId]) isChunked = true;

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
        const t = i.tipo || (allItems.find(a => a.id === i.itemId) || {}).tipo;
        return t === tipo && i.equipado;
      });

      const batch = db.batch();
      sameType.forEach(i => {
        batch.update(db.collection("cuts_inventory").doc(i.docId), { equipado: false });
      });

      // Equipar este
      batch.update(db.collection("cuts_inventory").doc(inv.docId), { equipado: true });

      // Se for avatar, trocar foto de perfil
      if (tipo === "avatar" && itemUrl) {
        const userDoc = await db.collection("users").doc(currentUser.id).get();
        const userData = userDoc.data();
        // Detectar se é chunked: chunkCache tem a URL completa, ou o item da loja/inventário tem flag chunked
        // Para chunked: salvar thumbnail (do doc principal) no Firestore; para normal: salvar url direto
        let photoForFirestore;
        if (isChunked) {
          // Thumbnail: pegar do fromShop.url (que é o thumbnail), ou do inv.url
          photoForFirestore = (fromShop && fromShop.url) || inv.url || "";
        } else {
          photoForFirestore = itemUrl;
        }
        // Segurança: se photoURL ainda é muito grande (>800KB), não salvar no Firestore
        if (photoForFirestore.length > 800000) {
          photoForFirestore = "";
        }
        // Salvar foto pessoal original (nunca sobrescrever com URL de avatar)
        const updateData = { photoURL: photoForFirestore, equippedAvatarItemId: itemId };
        if (!userData.originalPhotoURL || !userData.equippedAvatarItemId) {
          // Salvar foto atual como original só se não tem avatar equipado
          if (userData.photoURL) updateData.originalPhotoURL = userData.photoURL;
        }
        batch.update(db.collection("users").doc(currentUser.id), updateData);
        // No localStorage, salvar GIF completo para exibição animada
        localStorage.setItem("carolampra_photo", itemUrl);
      }

      await batch.commit();

      console.log("[Loja] Equipado:", itemId, "(tipo:", tipo, ")");
      if (tipo === "avatar") {
        showToast("✅ Avatar equipado como foto de perfil!");
      } else {
        showToast("✅ Item equipado!");
      }
    }

  } catch (e) {
    console.error("[Loja] Erro ao equipar:", e);
    showToast("❌ Erro: " + (e.message || e));
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
