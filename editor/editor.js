/* ═══════════════════════════════════════════
   EDITOR DE ARTES — Lógica
   Módulo independente — não altera JS existente
   ═══════════════════════════════════════════ */

// ── Estado ──
let db = null;
let storage = null;
let firebaseOk = false;
let selectedFile = null;
let selectedFileUrl = null; // preview local
let selectedType = null;
let publishedItems = [];

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
    storage = firebase.storage();
    firebaseOk = true;
    console.log("[Editor] Firebase OK");
  } catch (e) {
    console.error("[Editor] Firebase error:", e);
  }
}

// ── Upload file handler ──
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  // Validar tipo
  const allowed = ["image/png", "image/gif", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    showToast("❌ Formato não suportado. Use PNG, GIF, JPG ou WebP.");
    input.value = "";
    return;
  }

  // Validar tamanho (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast("❌ Arquivo muito grande (máx. 10MB)");
    input.value = "";
    return;
  }

  selectedFile = file;

  // Preview local
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedFileUrl = e.target.result;
    updateUploadUI();
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function updateUploadUI() {
  const zone = document.getElementById("upload-zone");
  const preview = document.getElementById("upload-preview");
  const previewImg = document.getElementById("upload-preview-img");

  if (selectedFile) {
    zone.classList.add("has-file");
    zone.querySelector(".uz-text").textContent = selectedFile.name;
    zone.querySelector(".uz-hint").textContent = `${(selectedFile.size / 1024).toFixed(1)} KB — ${selectedFile.type}`;
    preview.classList.add("show");
    previewImg.src = selectedFileUrl;
  } else {
    zone.classList.remove("has-file");
    zone.querySelector(".uz-text").textContent = "Clique para enviar imagem ou GIF";
    zone.querySelector(".uz-hint").textContent = "PNG, GIF, JPG, WebP (máx. 5MB)";
    preview.classList.remove("show");
    previewImg.src = "";
  }
}

// ── Seleção de tipo ──
function selectType(tipo) {
  selectedType = tipo;
  document.querySelectorAll(".type-option").forEach(el => {
    el.classList.toggle("selected", el.dataset.type === tipo);
  });
  updatePreview();
  console.log("[Editor] Tipo selecionado:", tipo);
}

// ── Preview do perfil simulado ──
function updatePreview() {
  if (!selectedFileUrl || !selectedType) return;

  const simAvatar = document.getElementById("sim-avatar");
  const simFrame = document.getElementById("sim-frame");
  const simBanner = document.getElementById("sim-banner");
  const simEmblems = document.getElementById("sim-emblems");

  // Reset
  simFrame.style.display = "none";
  simBanner.style.backgroundImage = "";
  simEmblems.innerHTML = "";

  switch (selectedType) {
    case "avatar":
      simAvatar.innerHTML = `<img src="${selectedFileUrl}" alt="avatar">`;
      break;
    case "moldura":
      simFrame.src = selectedFileUrl;
      simFrame.style.display = "block";
      break;
    case "banner":
      simBanner.style.backgroundImage = `url(${selectedFileUrl})`;
      break;
    case "emblema":
      simEmblems.innerHTML = `<img src="${selectedFileUrl}" alt="emblema">`;
      break;
  }
}

// ── Publicar item ──
async function publishItem() {
  if (!firebaseOk) { showToast("❌ Firebase não disponível"); return; }
  if (!selectedFile) { showToast("⚠️ Envie uma imagem primeiro"); return; }
  if (!selectedType) { showToast("⚠️ Selecione o tipo do item"); return; }

  const nome = document.getElementById("item-nome").value.trim();
  const preco = parseInt(document.getElementById("item-preco").value, 10);

  if (!nome) { showToast("⚠️ Informe o nome do item"); return; }
  if (isNaN(preco) || preco < 0) { showToast("⚠️ Informe um preço válido"); return; }

  const btn = document.getElementById("btn-publish");
  btn.disabled = true;
  btn.textContent = "Enviando imagem...";

  try {
    // 1. Upload para Firebase Storage
    const ext = selectedFile.name.split(".").pop();
    const fileName = `cuts_${selectedType}_${Date.now()}.${ext}`;
    const ref = storage.ref(`cuts_items/${fileName}`);

    const uploadTask = await ref.put(selectedFile);
    const url = await uploadTask.ref.getDownloadURL();
    console.log("[Editor] Upload OK:", url);

    btn.textContent = "Salvando no Firestore...";

    // 2. Salvar no Firestore
    const docData = {
      nome: nome,
      tipo: selectedType,
      preco: preco,
      url: url,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("cuts_items").add(docData);
    console.log("[Editor] Item publicado:", nome, selectedType, preco, "CUTS");
    showToast(`✅ "${nome}" publicado na loja!`);

    // Reset form
    resetForm();

    // Recarregar lista
    await loadPublished();
  } catch (e) {
    console.error("[Editor] Erro ao publicar:", e);
    showToast("❌ Erro ao publicar: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🚀 Publicar na Loja";
  }
}

function resetForm() {
  selectedFile = null;
  selectedFileUrl = null;
  selectedType = null;
  document.getElementById("file-input").value = "";
  document.getElementById("item-nome").value = "";
  document.getElementById("item-preco").value = "";
  document.querySelectorAll(".type-option").forEach(el => el.classList.remove("selected"));
  updateUploadUI();

  // Reset preview
  document.getElementById("sim-avatar").innerHTML = '<span style="font-size:28px">M</span>';
  document.getElementById("sim-frame").style.display = "none";
  document.getElementById("sim-banner").style.backgroundImage = "";
  document.getElementById("sim-emblems").innerHTML = "";
}

// ── Listar itens publicados ──
async function loadPublished() {
  if (!firebaseOk) return;
  const container = document.getElementById("published-grid");

  try {
    const snap = await db.collection("cuts_items").orderBy("criadoEm", "desc").get();
    publishedItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (publishedItems.length === 0) {
      container.innerHTML = '<div class="empty"><div class="icon">📦</div><p>Nenhum item publicado</p></div>';
      return;
    }

    const tipoLabels = { avatar: "Avatar", moldura: "Moldura", banner: "Banner", emblema: "Emblema" };

    container.innerHTML = publishedItems.map(item => `
      <div class="pub-item">
        <button class="pub-delete" onclick="deleteItem('${item.id}')" title="Excluir">✕</button>
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}" loading="lazy">
        <div class="pub-info">
          <div class="pub-name">${escapeHtml(item.nome)}</div>
          <div class="pub-meta">${tipoLabels[item.tipo] || item.tipo} — 🪙 ${item.preco}</div>
        </div>
      </div>
    `).join("");

    console.log("[Editor] Itens publicados:", publishedItems.length);
  } catch (e) {
    console.error("[Editor] Erro ao carregar itens:", e);
    container.innerHTML = '<div class="empty"><div class="icon">⚠️</div><p>Erro ao carregar</p></div>';
  }
}

// ── Excluir item ──
async function deleteItem(itemId) {
  if (!confirm("Excluir este item da loja?")) return;
  try {
    await db.collection("cuts_items").doc(itemId).delete();
    showToast("🗑️ Item excluído");
    await loadPublished();
  } catch (e) {
    console.error("[Editor] Erro ao excluir:", e);
    showToast("❌ Erro ao excluir");
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
async function initEditor() {
  initFirebase();
  if (!firebaseOk) {
    showToast("❌ Firebase não disponível");
    return;
  }
  await loadPublished();
}

document.addEventListener("DOMContentLoaded", initEditor);
