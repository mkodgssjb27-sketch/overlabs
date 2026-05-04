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
let selectedRarity = null;
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

  // Vídeo? abre editor de vídeo→GIF
  if (file.type && file.type.startsWith("video/")) {
    if (file.size > 200 * 1024 * 1024) {
      showToast("❌ Vídeo muito grande (máx. 200MB)");
      input.value = "";
      return;
    }
    openVideoEditor(file);
    return;
  }

  // Validar tipo (imagens)
  const allowed = ["image/png", "image/gif", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    showToast("❌ Formato não suportado. Use imagem ou vídeo.");
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

/* ═══════════════════════════════════════════
   EDITOR DE VÍDEO → GIF
   ═══════════════════════════════════════════ */
const VID_GIF_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const VID_GIF_MAX_DURATION = 10;            // 10s recorte
let vidEditorState = {
  file: null,
  url: null,
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  speed: 1,
  dragging: null // 'start' | 'end' | null
};

function openVideoEditor(file) {
  // limpa state anterior
  if (vidEditorState.url) { try { URL.revokeObjectURL(vidEditorState.url); } catch(_){} }
  vidEditorState = { file, url: URL.createObjectURL(file), duration: 0, trimStart: 0, trimEnd: 0, speed: 1, dragging: null };

  const modal = document.getElementById("vid-modal");
  const video = document.getElementById("vid-preview");
  const info = document.getElementById("vid-info");
  const speed = document.getElementById("vid-speed");
  const speedVal = document.getElementById("vid-speed-val");
  const progress = document.getElementById("vid-progress-wrap");

  modal.style.display = "flex";
  progress.style.display = "none";
  document.getElementById("vid-progress-fill").style.width = "0%";
  speed.value = 1;
  speedVal.textContent = "1.0x";
  info.textContent = "Carregando vídeo...";

  video.src = vidEditorState.url;
  video.loop = false;
  video.muted = true;

  video.addEventListener("loadedmetadata", function onMeta() {
    video.removeEventListener("loadedmetadata", onMeta);
    let dur = video.duration;
    if (!isFinite(dur) || dur <= 0) {
      // fallback: tenta seek pra obter duration
      video.currentTime = 1e6;
      video.addEventListener("seeked", function onSk() {
        video.removeEventListener("seeked", onSk);
        dur = video.duration;
        _vidInitTimeline(dur);
      }, { once:true });
    } else {
      _vidInitTimeline(dur);
    }
  }, { once:true });

  video.addEventListener("error", () => {
    showToast("❌ Não foi possível ler o vídeo. Tente outro formato (MP4/WebM).");
    closeVideoEditor(true);
  }, { once:true });

  // speed
  speed.oninput = function() {
    vidEditorState.speed = parseFloat(speed.value) || 1;
    speedVal.textContent = vidEditorState.speed.toFixed(1) + "x";
    video.playbackRate = vidEditorState.speed;
  };

  _vidBindTimeline();
  _vidStartLoopPreview();
}

function _vidInitTimeline(dur) {
  const video = document.getElementById("vid-preview");
  vidEditorState.duration = dur;
  vidEditorState.trimStart = 0;
  vidEditorState.trimEnd = Math.min(dur, VID_GIF_MAX_DURATION);
  document.getElementById("vid-info").textContent =
    `Duração: ${dur.toFixed(1)}s · O GIF terá no máximo ${VID_GIF_MAX_DURATION}s`;
  try { video.currentTime = 0; video.play().catch(()=>{}); } catch(_) {}
  _vidUpdateTimelineUI();
}

function _vidUpdateTimelineUI() {
  const dur = vidEditorState.duration || 1;
  const pctS = (vidEditorState.trimStart / dur) * 100;
  const pctE = (vidEditorState.trimEnd / dur) * 100;
  document.getElementById("vid-handle-start").style.left = pctS + "%";
  document.getElementById("vid-handle-end").style.left = pctE + "%";
  const sel = document.getElementById("vid-timeline-selected");
  sel.style.left = pctS + "%";
  sel.style.width = (pctE - pctS) + "%";
  document.getElementById("vid-trim-start").textContent = vidEditorState.trimStart.toFixed(1) + "s";
  document.getElementById("vid-trim-end").textContent = vidEditorState.trimEnd.toFixed(1) + "s";
  document.getElementById("vid-trim-duration").textContent =
    (vidEditorState.trimEnd - vidEditorState.trimStart).toFixed(1) + "s";
}

function _vidBindTimeline() {
  const tl = document.getElementById("vid-timeline");
  const hs = document.getElementById("vid-handle-start");
  const he = document.getElementById("vid-handle-end");

  const startDrag = (which) => (e) => {
    e.preventDefault();
    vidEditorState.dragging = which;
  };
  hs.onpointerdown = startDrag("start");
  he.onpointerdown = startDrag("end");

  tl.onpointermove = (e) => {
    if (!vidEditorState.dragging) return;
    const rect = tl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, (e.clientX - rect.left)));
    const pct = x / rect.width;
    const t = pct * vidEditorState.duration;
    if (vidEditorState.dragging === "start") {
      vidEditorState.trimStart = Math.min(t, vidEditorState.trimEnd - 0.1);
      // limite máximo 10s do trim
      if (vidEditorState.trimEnd - vidEditorState.trimStart > VID_GIF_MAX_DURATION) {
        vidEditorState.trimEnd = vidEditorState.trimStart + VID_GIF_MAX_DURATION;
      }
    } else {
      vidEditorState.trimEnd = Math.max(t, vidEditorState.trimStart + 0.1);
      if (vidEditorState.trimEnd - vidEditorState.trimStart > VID_GIF_MAX_DURATION) {
        vidEditorState.trimStart = vidEditorState.trimEnd - VID_GIF_MAX_DURATION;
      }
    }
    _vidUpdateTimelineUI();
  };
  const endDrag = () => { vidEditorState.dragging = null; };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
}

let _vidLoopTimer = null;
function _vidStartLoopPreview() {
  const video = document.getElementById("vid-preview");
  if (_vidLoopTimer) clearInterval(_vidLoopTimer);
  _vidLoopTimer = setInterval(() => {
    if (!document.getElementById("vid-modal") || document.getElementById("vid-modal").style.display === "none") {
      clearInterval(_vidLoopTimer); _vidLoopTimer = null; return;
    }
    if (!video.duration) return;
    // playhead
    const dur = vidEditorState.duration || video.duration;
    const pct = (video.currentTime / dur) * 100;
    const ph = document.getElementById("vid-timeline-playhead");
    if (ph) ph.style.left = pct + "%";
    // loop dentro do trim
    if (video.currentTime >= vidEditorState.trimEnd || video.currentTime < vidEditorState.trimStart) {
      try { video.currentTime = vidEditorState.trimStart; video.play().catch(()=>{}); } catch(_) {}
    }
  }, 100);
}

function closeVideoEditor(reset) {
  document.getElementById("vid-modal").style.display = "none";
  const video = document.getElementById("vid-preview");
  try { video.pause(); video.removeAttribute("src"); video.load(); } catch(_) {}
  if (_vidLoopTimer) { clearInterval(_vidLoopTimer); _vidLoopTimer = null; }
  if (reset) {
    if (vidEditorState.url) { try { URL.revokeObjectURL(vidEditorState.url); } catch(_){} }
    vidEditorState = { file:null, url:null, duration:0, trimStart:0, trimEnd:0, speed:1, dragging:null };
    document.getElementById("file-input").value = "";
  }
}

async function convertVideoToGif() {
  if (typeof GIF === "undefined") { showToast("❌ Biblioteca GIF não carregada"); return; }
  const video = document.getElementById("vid-preview");
  const btn = document.getElementById("vid-btn-convert");
  const progressWrap = document.getElementById("vid-progress-wrap");
  const progressFill = document.getElementById("vid-progress-fill");
  const progressLabel = document.getElementById("vid-progress-label");

  const trimDur = Math.min(VID_GIF_MAX_DURATION, vidEditorState.trimEnd - vidEditorState.trimStart);
  if (trimDur <= 0.1) { showToast("⚠️ Recorte muito curto"); return; }

  btn.disabled = true;
  progressWrap.style.display = "block";
  progressFill.style.width = "0%";

  // Tentativas adaptativas para ficar <= 5MB
  const attempts = [
    { width: 360, fps: 14 },
    { width: 320, fps: 12 },
    { width: 280, fps: 10 },
    { width: 240, fps: 10 },
    { width: 200, fps: 8 }
  ];

  let blob = null;
  for (let i = 0; i < attempts.length; i++) {
    const cfg = attempts[i];
    progressLabel.textContent = `Convertendo (tentativa ${i+1}/${attempts.length}) — ${cfg.width}px @ ${cfg.fps}fps · 0%`;
    try {
      blob = await _vidEncodeGif(video, cfg.width, cfg.fps, trimDur, (p) => {
        progressFill.style.width = (p * 100).toFixed(1) + "%";
        progressLabel.textContent = `Convertendo (tentativa ${i+1}/${attempts.length}) — ${cfg.width}px @ ${cfg.fps}fps · ${(p*100).toFixed(0)}%`;
      });
    } catch (e) {
      console.error("[VidGif] erro:", e);
      showToast("❌ Falha ao gerar GIF");
      btn.disabled = false;
      progressWrap.style.display = "none";
      return;
    }
    if (blob.size <= VID_GIF_MAX_BYTES) break;
    progressLabel.textContent = `GIF ficou ${(blob.size/1024/1024).toFixed(2)}MB — reduzindo...`;
  }

  if (!blob) {
    showToast("❌ Não foi possível gerar GIF");
    btn.disabled = false;
    progressWrap.style.display = "none";
    return;
  }
  if (blob.size > VID_GIF_MAX_BYTES) {
    showToast(`⚠️ GIF resultou em ${(blob.size/1024/1024).toFixed(2)}MB (acima de 5MB). Tente recorte menor.`);
    btn.disabled = false;
    progressWrap.style.display = "none";
    return;
  }

  // Substitui o file por um File GIF
  const gifFile = new File([blob], `video_${Date.now()}.gif`, { type: "image/gif" });
  selectedFile = gifFile;
  selectedFileUrl = URL.createObjectURL(blob);

  showToast(`✅ GIF gerado (${(blob.size/1024/1024).toFixed(2)}MB)`);
  closeVideoEditor(false);
  updateUploadUI();
  updatePreview();
}

function _vidEncodeGif(video, targetWidth, fps, trimDur, onProgress) {
  return new Promise((resolve, reject) => {
    const speed = vidEditorState.speed || 1;
    const startT = vidEditorState.trimStart;
    const endT = startT + trimDur;
    // duração resultante é trimDur/speed; manter cap em 10s
    const outDur = Math.min(VID_GIF_MAX_DURATION, trimDur / speed);
    const totalFrames = Math.max(2, Math.round(outDur * fps));
    const frameDelay = Math.round(1000 / fps); // ms entre frames no GIF

    // Dimensões mantendo aspect ratio
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 360;
    const w = Math.min(targetWidth, vw);
    const h = Math.round((w / vw) * vh);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: w,
      height: h,
      workerScript: "https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js"
    });

    gif.on("progress", p => { try { onProgress && onProgress(0.5 + p * 0.5); } catch(_){} });
    gif.on("finished", blob => resolve(blob));

    let i = 0;
    const wasLooping = video.loop;
    const wasMuted = video.muted;
    video.loop = false;
    video.muted = true;
    video.pause();

    function captureNext() {
      if (i >= totalFrames) {
        try { onProgress && onProgress(0.5); } catch(_){}
        gif.render();
        video.loop = wasLooping;
        video.muted = wasMuted;
        return;
      }
      const t = startT + (i / (totalFrames - 1)) * trimDur;
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        try { ctx.drawImage(video, 0, 0, w, h); } catch (e) { reject(e); return; }
        gif.addFrame(ctx, { copy: true, delay: frameDelay });
        i++;
        try { onProgress && onProgress((i / totalFrames) * 0.5); } catch(_){}
        captureNext();
      };
      video.addEventListener("seeked", onSeeked);
      try { video.currentTime = Math.min(endT, Math.max(startT, t)); }
      catch(e) { reject(e); }
    }
    captureNext();
  });
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

// ── Seleção de raridade ──
function selectRarity(rarity) {
  selectedRarity = rarity;
  document.querySelectorAll(".rarity-option").forEach(el => {
    el.classList.toggle("selected", el.dataset.rarity === rarity);
  });
  console.log("[Editor] Raridade selecionada:", rarity);
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

    // Tempo disponível (dias)
    const dias = parseInt(document.getElementById("item-dias").value, 10);
    if (!isNaN(dias) && dias > 0) {
      const expiraEm = new Date();
      expiraEm.setDate(expiraEm.getDate() + dias);
      docData.expiraEm = firebase.firestore.Timestamp.fromDate(expiraEm);
    }

    // Raridade
    if (selectedRarity) {
      docData.raridade = selectedRarity;
    }

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
  document.getElementById("item-dias").value = "";
  selectedRarity = null;
  document.querySelectorAll(".rarity-option").forEach(el => el.classList.remove("selected"));
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

    // Marcar expirados como hidden automaticamente no Firestore
    const now = new Date();
    for (const item of publishedItems) {
      if (item.expiraEm && !item.hidden) {
        const expDate = item.expiraEm.toDate ? item.expiraEm.toDate() : new Date(item.expiraEm);
        if (expDate <= now) {
          try {
            await db.collection("cuts_items").doc(item.id).update({ hidden: true });
            item.hidden = true;
            console.log("[Editor] Item expirado marcado como oculto:", item.nome);
          } catch (e) {
            console.error("[Editor] Erro ao ocultar item expirado:", item.id, e);
          }
        }
      }
    }

    const tipoLabels = { avatar: "Avatar", moldura: "Moldura", banner: "Banner", emblema: "Emblema" };
    const raridadeLabels = { comum: "Comum", raro: "Raro", super_raro: "Super Raro", lendaria: "Lendária" };

    container.innerHTML = publishedItems.map(item => {
      let expBadge = '';
      if (item.hidden && item.expiraEm) {
        expBadge = '<div class="pub-exp expired">⏰ Expirado — Oculto</div>';
      } else if (item.hidden) {
        expBadge = '<div class="pub-exp expired">🚫 Oculto</div>';
      } else if (item.expiraEm) {
        const expDate = item.expiraEm.toDate ? item.expiraEm.toDate() : new Date(item.expiraEm);
        const diff = expDate - now;
        if (diff > 0) {
          const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));
          expBadge = '<div class="pub-exp active">⏰ ' + dias + 'd restante' + (dias !== 1 ? 's' : '') + '</div>';
        }
      }

      // Raridade badge
      const rar = item.raridade || '';
      let rarBadge = '';
      if (rar) {
        rarBadge = '<div class="pub-rarity r-' + rar + '">' + (raridadeLabels[rar] || rar) + '</div>';
      }

      // Raridade edit buttons
      let rarEdit = '<div class="pub-rarity-edit">';
      ['comum','raro','super_raro','lendaria'].forEach(function(r) {
        var active = (rar === r) ? ' active' : '';
        rarEdit += '<button class="re-btn rc-' + r + active + '" onclick="setItemRarity(\'' + item.id + '\',\'' + r + '\')">' + (raridadeLabels[r]) + '</button>';
      });
      rarEdit += '</div>';

      const opacidade = item.hidden ? ' style="opacity:.5"' : '';
      return `
      <div class="pub-item"${opacidade}>
        <button class="pub-delete" onclick="deleteItem('${item.id}')" title="Excluir">✕</button>
        ${expBadge}
        ${rarBadge}
        <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.nome)}" loading="lazy">
        <div class="pub-info">
          <div class="pub-name">${escapeHtml(item.nome)}</div>
          <div class="pub-meta">${tipoLabels[item.tipo] || item.tipo} — 🪙 ${item.preco}</div>
          ${rarEdit}
        </div>
      </div>
    `;
    }).join("");

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

// ── Alterar raridade de item publicado ──
async function setItemRarity(itemId, rarity) {
  try {
    await db.collection("cuts_items").doc(itemId).update({ raridade: rarity });
    // Atualizar local
    const item = publishedItems.find(i => i.id === itemId);
    if (item) item.raridade = rarity;
    showToast("✨ Raridade atualizada!");
    await loadPublished();
  } catch (e) {
    console.error("[Editor] Erro ao alterar raridade:", e);
    showToast("❌ Erro ao alterar raridade");
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
