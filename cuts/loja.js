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
let itemsReady = false;    // flag: itens já chegaram do Firestore?
let inventoryReady = false; // flag: inventário já chegou?
let sellMode = false;       // modo venda ativo no inventário?

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
  if (!firebaseOk) return Promise.resolve();
  return new Promise(function(resolve) {
    var first = true;
    db.collection("cuts_items").orderBy("criadoEm", "desc").onSnapshot(snap => {
      allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      itemsReady = true;
      console.log("[Loja] Itens atualizados:", allItems.length);
      // Salvar cache local — somente metadados (sem url base64 que é gigante)
      try {
        var toCache = allItems.map(function(it) {
          var c = { id: it.id, nome: it.nome, tipo: it.tipo, preco: it.preco, raridade: it.raridade || '', hidden: it.hidden || false, chunked: it.chunked || false, valorVenda: it.valorVenda || 0 };
          if (it.expiraEm) c.expiraEm = (it.expiraEm.toDate ? it.expiraEm.toDate() : new Date(it.expiraEm)).toISOString();
          // Só salvar url se for URL http (pequena), não base64 (gigante)
          if (it.url && it.url.length < 500) c.url = it.url;
          else c.url = '';
          return c;
        });
        localStorage.setItem("loja_items_cache", JSON.stringify(toCache));
      } catch(e) {}
      renderItems();
      if (inventoryReady) renderInventory();
      loadChunkedUrls();
      if (first) { first = false; resolve(); }
    }, err => {
      console.error("[Loja] Erro ao ouvir itens:", err);
      document.getElementById("items-grid").innerHTML =
        '<div class="empty"><div class="icon">⚠️</div><p>Erro ao carregar itens</p></div>';
      if (first) { first = false; resolve(); }
    });
  });
}

// ── Carrega URLs completas de itens com chunks (progressivo, um por vez) ──
var _loadingChunks = false;
async function loadChunkedUrls() {
  if (_loadingChunks) return;
  _loadingChunks = true;
  const chunked = allItems.filter(i => i.chunked && !chunkCache[i.id]);
  for (var idx = 0; idx < chunked.length; idx++) {
    var item = chunked[idx];
    if (chunkCache[item.id]) continue;
    try {
      var snap = await db.collection("cuts_items").doc(item.id)
        .collection("chunks").get();
      if (snap.empty) continue;
      var sorted = snap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      chunkCache[item.id] = sorted.map(d => d.data().data).join("");
      document.querySelectorAll('img[data-item-id="' + item.id + '"]').forEach(img => {
        img.src = chunkCache[item.id];
      });
    } catch(e) {
      console.error("[Loja] Erro chunks:", item.id, e);
    }
  }
  _loadingChunks = false;
}

// ── Carrega chunks de itens do inventário (progressivo, um por vez) ──
var _loadingInvChunks = false;
async function loadInventoryChunks() {
  if (_loadingInvChunks) return;
  _loadingInvChunks = true;
  const need = myInventory.filter(inv => inv.chunked && !chunkCache[inv.itemId]);
  for (var idx = 0; idx < need.length; idx++) {
    var inv = need[idx];
    if (chunkCache[inv.itemId]) continue;
    try {
      var snap = await db.collection("cuts_inventory").doc(inv.docId)
        .collection("chunks").get();
      if (snap.empty) continue;
      var sorted = snap.docs.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      chunkCache[inv.itemId] = sorted.map(d => d.data().data).join("");
      document.querySelectorAll('img[data-item-id="' + inv.itemId + '"]').forEach(img => {
        img.src = chunkCache[inv.itemId];
      });
    } catch(e) {
      console.error("[Loja] Erro chunks inventário:", inv.docId, e);
    }
  }
  _loadingInvChunks = false;
}

// ── Listener tempo real do inventário do usuário ──
function loadInventory() {
  if (!firebaseOk || !currentUser) return Promise.resolve();
  return new Promise(function(resolve) {
    var first = true;
    db.collection("cuts_inventory")
      .where("userId", "==", currentUser.id)
      .onSnapshot(snap => {
        myInventory = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        inventoryReady = true;
        console.log("[Loja] Inventário atualizado:", myInventory.length, "itens");
        // Salvar cache local — somente metadados leves
        try {
          var invCache = myInventory.map(function(it) {
            var c = { docId: it.docId, itemId: it.itemId, nome: it.nome, tipo: it.tipo, equipado: it.equipado, chunked: it.chunked || false, raridade: it.raridade || '' };
            if (it.url && it.url.length < 500) c.url = it.url;
            else c.url = '';
            return c;
          });
          localStorage.setItem("loja_inv_cache_" + currentUser.id, JSON.stringify(invCache));
        } catch(e) {}
        renderInventory();
        if (itemsReady) renderItems();
        loadInventoryChunks();
        if (first) { first = false; resolve(); }
      }, err => {
        console.error("[Loja] Erro ao ouvir inventário:", err);
        if (first) { first = false; resolve(); }
      });
  });
}

// ── Render itens na grid ──
function renderItems() {
  const grid = document.getElementById("items-grid");
  const loading = document.getElementById("loja-loading");

  // Se itens ainda não chegaram do Firestore, manter loading visível
  if (!itemsReady) {
    if (loading) loading.style.display = "";
    if (allItems.length === 0) return;
  } else {
    if (loading) loading.style.display = "none";
  }

  let filtered = allItems.filter(i => !i.hidden);

  // Filtrar itens expirados
  const now = new Date();
  filtered = filtered.filter(i => {
    if (!i.expiraEm) return true;
    const expDate = i.expiraEm.toDate ? i.expiraEm.toDate() : new Date(i.expiraEm);
    return expDate > now;
  });

  if (currentTab !== "todos") {
    filtered = filtered.filter(i => i.tipo === currentTab);
  }

  if (filtered.length === 0) {
    if (!itemsReady) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = '<div class="empty"><div class="icon">🛒</div><p>Nenhum item disponível</p><small>Novos itens em breve!</small></div>';
    return;
  }

  const ownedIds = new Set(myInventory.map(i => i.itemId));

  grid.innerHTML = filtered.map(item => {
    const owned = ownedIds.has(item.id);
    const imgUrl = chunkCache[item.id] || item.url;

    // Contador regressivo
    let countdownHtml = '';
    if (item.expiraEm) {
      const expDate = item.expiraEm.toDate ? item.expiraEm.toDate() : new Date(item.expiraEm);
      const diff = expDate - now;
      if (diff > 0) {
        const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (dias > 0) {
          countdownHtml = '<div class="item-countdown">\u23f0 ' + dias + 'd ' + horas + 'h</div>';
        } else {
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          countdownHtml = '<div class="item-countdown urgente">\u23f0 ' + horas + 'h ' + mins + 'm</div>';
        }
      }
    }

    // Raridade
    const rar = item.raridade || '';
    const rarClass = rar ? ' rarity-' + rar : '';
    const rarLabels = { comum: 'Comum', raro: 'Raro', super_raro: 'Super Raro', lendaria: 'Lendária' };
    let rarBadge = '';
    if (rar) {
      rarBadge = '<span class="item-rarity ir-' + rar + '">' + (rarLabels[rar] || '') + '</span>';
    }

    return `
      <div class="loja-item ${owned ? 'owned' : ''}${rarClass}" onclick="openBuyModal('${item.id}')">
        ${countdownHtml}
        <img class="item-img" data-item-id="${item.id}" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(item.nome)}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.nome)}</div>
          <div class="item-type">${escapeHtml(item.tipo)}</div>
          <div class="item-price"><span class="coin">🪙</span> ${item.preco}${rarBadge}</div>
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
  const rarityCounts = { comum: 0, raro: 0, super_raro: 0, lendaria: 0 };
  myInventory.forEach(inv => {
    const fromShop = allItems.find(i => i.id === inv.itemId);
    const nome = inv.nome || (fromShop && fromShop.nome) || "Item";
    const url = chunkCache[inv.itemId] || inv.url || (fromShop && fromShop.url) || "";
    const tipo = inv.tipo || (fromShop && fromShop.tipo) || "outro";
    const raridade = inv.raridade || (fromShop && fromShop.raridade) || '';
    if (raridade && rarityCounts.hasOwnProperty(raridade)) rarityCounts[raridade]++;
    if (!url) return;
    if (!groups[tipo]) groups[tipo] = [];
    groups[tipo].push({ id: inv.itemId, nome, url, tipo, raridade, docId: inv.docId, equipado: inv.equipado });
  });

  const tipoLabels = { avatar: "🖼️ Avatares", moldura: "🖼️ Molduras", banner: "🌄 Banners", emblema: "🏅 Emblemas" };

  // Mini display de raridades
  let rarDisplay = '<div class="inv-rarity-display">';
  rarDisplay += '<span class="ird-item ird-comum">C ' + rarityCounts.comum + '</span>';
  rarDisplay += '<span class="ird-item ird-raro">R ' + rarityCounts.raro + '</span>';
  rarDisplay += '<span class="ird-item ird-super_raro">SR ' + rarityCounts.super_raro + '</span>';
  rarDisplay += '<span class="ird-item ird-lendaria">S+ ' + rarityCounts.lendaria + '</span>';
  rarDisplay += '</div>';

  // Botão toggle de modo venda
  let sellToggle = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">';
  sellToggle += '<button onclick="toggleSellMode()" id="btn-sell-mode" style="flex:1;padding:10px 16px;border-radius:12px;font-weight:800;font-size:13px;border:none;cursor:pointer;transition:.2s;' + (sellMode ? 'background:rgba(34,197,94,.2);color:#22c55e;border:1px solid rgba(34,197,94,.4)' : 'background:rgba(255,255,255,.06);color:#64748b;border:1px solid rgba(255,255,255,.08)') + '">' + (sellMode ? '💱 Modo Venda ATIVO' : '💱 Vender Itens') + '</button>';
  sellToggle += '</div>';

  let html = sellToggle + rarDisplay;
  for (const [tipo, items] of Object.entries(groups)) {
    html += `<div class="inv-section">`;
    html += `<div class="inv-title">${tipoLabels[tipo] || tipo}</div>`;
    html += `<div class="inv-grid">`;
    items.forEach(item => {
      const rarClass = item.raridade ? ' inv-r-' + item.raridade : '';
      const shopItem = allItems.find(i => i.id === item.id);
      const sellPrice = shopItem && shopItem.valorVenda ? shopItem.valorVenda : 0;
      const canSell = sellMode && sellPrice > 0;
      const isEquipped = item.equipado;

      if (sellMode) {
        // Modo venda: clicar no preço abre confirmação de venda
        const sellDisabled = isEquipped || sellPrice <= 0;
        let priceTag;
        if (sellPrice <= 0) {
          priceTag = '<div style="margin-top:6px;padding:4px 8px;border-radius:8px;font-weight:900;font-size:11px;background:rgba(100,116,139,.12);color:#475569">🚫 Sem valor</div>';
        } else if (isEquipped) {
          priceTag = '<div style="margin-top:6px;padding:4px 8px;border-radius:8px;font-weight:900;font-size:11px;background:rgba(245,158,11,.12);color:#f59e0b">⚠️ Equipado</div>';
        } else {
          priceTag = '<div class="sell-price-btn" data-docid="' + item.docId + '" style="margin-top:6px;padding:6px 10px;border-radius:10px;font-weight:900;font-size:12px;background:rgba(34,197,94,.18);color:#22c55e;border:1.5px solid rgba(34,197,94,.4);cursor:pointer;-webkit-tap-highlight-color:rgba(34,197,94,.2)">💱 ' + sellPrice + ' CUTS</div>';
        }
        html += `
        <div class="inv-item sell-mode${rarClass}" style="aspect-ratio:auto;padding:8px;${sellDisabled ? 'opacity:.5' : ''}">
          <img data-item-id="${item.id}" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}" style="max-height:55%">
          <div class="inv-name">${escapeHtml(item.nome)}</div>
          ${priceTag}
        </div>
        `;
      } else {
        // Modo normal: equipar
        html += `
        <div class="inv-item ${isEquipped ? 'equipped' : ''}${rarClass}" onclick="toggleEquip('${item.id}', '${tipo}')">
          <img data-item-id="${item.id}" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}">
          <div class="inv-name">${escapeHtml(item.nome)}</div>
        </div>
        `;
      }
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
    sellMode = false; // resetar modo venda ao voltar pra loja
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
    if (selectedItem.raridade) invData.raridade = selectedItem.raridade;
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
    // Log de atividade
    db.collection('activity_log').add({
      userId: currentUser.id,
      userName: currentUser.firstName || '',
      action: 'compra_loja',
      detail: 'Comprou: ' + selectedItem.nome + ' por ' + selectedItem.preco + ' CUTS',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      extra: { itemId: selectedItem.id, itemNome: selectedItem.nome, preco: selectedItem.preco }
    }).catch(function(e) { console.warn('[Log]', e); });
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
  if (!firebaseOk || !currentUser) { console.warn("[Loja] toggleEquip: firebase ou user indisponível"); return; }
  console.log("[Loja] toggleEquip:", itemId, tipo);
  try {
    const inv = myInventory.find(i => i.itemId === itemId);
    if (!inv) { showToast("⚠️ Item não encontrado no inventário"); console.warn("[Loja] Item não encontrado:", itemId); return; }

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
        const updates = { equippedAvatarItemId: "" };
        if (userData.originalPhotoURL) {
          updates.photoURL = userData.originalPhotoURL;
        }
        await db.collection("users").doc(currentUser.id).update(updates);
        if (updates.photoURL) {
          try { localStorage.setItem("carolampra_photo", updates.photoURL); } catch(lsErr) {}
        }
        showToast("Foto de perfil restaurada");
      } else {
        showToast("Item desequipado");
      }
    } else {
      // Desequipar outros do mesmo tipo primeiro (exceto emblema — permite até 5)
      const sameType = myInventory.filter(i => {
        const t = i.tipo || (allItems.find(a => a.id === i.itemId) || {}).tipo;
        return t === tipo && i.equipado;
      });

      // Para emblemas, verificar limite de 5
      if (tipo === "emblema" && sameType.length >= 5) {
        showToast("⚠️ Máximo de 5 emblemas equipados");
        return;
      }

      // PASSO 1: Atualizar inventário (marcar equipado) — batch separado
      const invBatch = db.batch();
      // Para emblema, não desequipa os outros; para demais tipos, desequipa
      if (tipo !== "emblema") {
        sameType.forEach(i => {
          invBatch.update(db.collection("cuts_inventory").doc(i.docId), { equipado: false });
        });
      }
      invBatch.update(db.collection("cuts_inventory").doc(inv.docId), { equipado: true });
      await invBatch.commit();
      console.log("[Loja] Inventário atualizado — equipado:", itemId);

      // PASSO 2: Se for avatar, trocar foto de perfil (operação separada para não bloquear inventário)
      if (tipo === "avatar" && itemUrl) {
        try {
          const userDoc = await db.collection("users").doc(currentUser.id).get();
          const userData = userDoc.data();
          let photoForFirestore;
          if (isChunked) {
            photoForFirestore = (fromShop && fromShop.url) || inv.url || "";
          } else {
            photoForFirestore = itemUrl;
          }
          // Segurança: não salvar base64 muito grande no Firestore
          if (photoForFirestore.length > 500000) {
            photoForFirestore = "";
          }
          const updateData = { photoURL: photoForFirestore, equippedAvatarItemId: itemId };
          // Salvar foto pessoal original apenas se ainda não temos uma salva
          if (!userData.originalPhotoURL) {
            if (userData.photoURL) updateData.originalPhotoURL = userData.photoURL;
          }
          await db.collection("users").doc(currentUser.id).update(updateData);
          // Salvar GIF no localStorage (pode falhar por quota — ok, aluno.html recarrega dos chunks)
          try { localStorage.removeItem("carolampra_photo"); localStorage.setItem("carolampra_photo", itemUrl); } catch(lsErr) { console.warn("[Loja] localStorage cheio para GIF, aluno.html carregará dos chunks"); }
          console.log("[Loja] Foto de perfil atualizada para avatar:", itemId);
        } catch(photoErr) {
          console.error("[Loja] Erro ao atualizar foto (item já equipado):", photoErr);
          try { localStorage.removeItem("carolampra_photo"); localStorage.setItem("carolampra_photo", itemUrl); } catch(lsErr) {}
        }
      }

      if (tipo === "avatar") {
        showToast("✅ Avatar equipado como foto de perfil!");
      } else {
        showToast("✅ Item equipado!");
      }
    }

  } catch (e) {
    console.error("[Loja] Erro ao equipar:", e);
    showToast("❌ Erro ao equipar: " + (e.message || e));
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

// ── Venda (Câmbio) ──
function toggleSellMode() {
  sellMode = !sellMode;
  renderInventory();
}

let pendingSellDocId = null;

function openSellModal(invDocId) {
  const invItem = myInventory.find(i => i.docId === invDocId);
  if (!invItem) return;
  const shopItem = allItems.find(i => i.id === invItem.itemId);
  const sellPrice = shopItem && shopItem.valorVenda ? shopItem.valorVenda : 0;
  if (sellPrice <= 0) { showToast("🚫 Este item não pode ser vendido"); return; }

  if (invItem.equipado) {
    showToast("⚠️ Desequipe o item antes de vender");
    return;
  }

  pendingSellDocId = invDocId;
  const url = chunkCache[invItem.itemId] || invItem.url || (shopItem && shopItem.url) || '';
  document.getElementById("sell-modal-img").src = url;
  document.getElementById("sell-modal-name").textContent = invItem.nome || (shopItem && shopItem.nome) || 'Item';
  document.getElementById("sell-modal-type").textContent = (invItem.tipo || '').toUpperCase();
  document.getElementById("sell-modal-price").textContent = sellPrice;
  document.getElementById("sell-modal-balance").textContent = "Saldo atual: 🪙 " + userCuts + " → " + (userCuts + sellPrice) + " CUTS";
  document.getElementById("sell-modal").classList.add("active");
}

function closeSellModal() {
  document.getElementById("sell-modal").classList.remove("active");
  pendingSellDocId = null;
}

async function confirmSell() {
  if (!pendingSellDocId) return;
  const invItem = myInventory.find(i => i.docId === pendingSellDocId);
  if (!invItem) { closeSellModal(); return; }
  const shopItem = allItems.find(i => i.id === invItem.itemId);
  const sellPrice = shopItem && shopItem.valorVenda ? shopItem.valorVenda : 0;
  if (sellPrice <= 0) { showToast("🚫 Venda indisponível"); closeSellModal(); return; }

  if (invItem.equipado) { showToast("⚠️ Desequipe o item antes de vender"); closeSellModal(); return; }

  const btn = document.getElementById("btn-confirm-sell");
  btn.disabled = true;
  btn.textContent = "⏳ Vendendo...";

  try {
    const batch = db.batch();

    // 1. Remover do inventário
    const invDocRef = db.collection("cuts_inventory").doc(pendingSellDocId);
    batch.delete(invDocRef);

    // 2. Devolver CUTS ao aluno
    const userRef = db.collection("users").doc(currentUser.id);
    batch.update(userRef, {
      cuts: firebase.firestore.FieldValue.increment(sellPrice)
    });

    // 3. Registrar transação
    const txRef = db.collection("cuts_transactions").doc();
    batch.set(txRef, {
      userId: currentUser.id,
      valor: sellPrice,
      tipo: "venda",
      itemId: invItem.itemId,
      itemNome: invItem.nome,
      data: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    showToast("💱 Vendido! +" + sellPrice + " CUTS");
    closeSellModal();
  } catch(e) {
    console.error("[Loja] Erro ao vender:", e);
    showToast("❌ Erro ao vender item");
    btn.disabled = false;
    btn.textContent = "Sim, Vender!";
  }
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

  // Mostrar dados do cache local imediatamente enquanto Firestore carrega
  try {
    var cachedItems = localStorage.getItem("loja_items_cache");
    if (cachedItems) {
      allItems = JSON.parse(cachedItems);
      renderItems();
    }
    var cachedInv = localStorage.getItem("loja_inv_cache_" + currentUser.id);
    if (cachedInv) {
      myInventory = JSON.parse(cachedInv);
      renderInventory();
    }
  } catch(e) {}

  listenCuts();

  // Event delegation global para botões de venda (funciona em mobile)
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.sell-price-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      var docId = btn.getAttribute('data-docid');
      if (docId) openSellModal(docId);
    }
  });

  // Carregar itens e inventário em paralelo (não sequencial)
  await Promise.all([loadItems(), loadInventory()]);

  // Atualizar contadores regressivos a cada minuto
  setInterval(function() { renderItems(); }, 60000);

  // Se acessou via #inventario, abrir direto no inventário
  if (window.location.hash === "#inventario") {
    showView("inventario");
  }
}

document.addEventListener("DOMContentLoaded", initLoja);
