/* ── STATE ─────────────────────────────────────── */
let apiKey = '';
let originalFile = null;
let originalDataURL = '';

/* ── API CONNECTION ────────────────────────────── */
function connectAPI() {
  const input = document.getElementById('apiKeyInput').value.trim();

  if (!input) {
    showToast('Ingresa tu API Key primero', 'error');
    return;
  }

  if (!input.startsWith('r8_')) {
    showToast('La key debe comenzar con r8_', 'error');
    return;
  }

  apiKey = input;
  document.getElementById('apiSection').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  showToast('¡Conectado correctamente!', 'success');
}

function disconnect() {
  apiKey = '';
  resetApp();
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('apiSection').classList.remove('hidden');
  document.getElementById('apiKeyInput').value = '';
  showToast('Desconectado');
}

/* ── FILE HANDLING ─────────────────────────────── */
function handleFile(event) {
  const file = event.target.files[0];
  if (file) loadFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  document.getElementById('uploadZone').classList.add('drag-over');
}

function handleDragLeave() {
  document.getElementById('uploadZone').classList.remove('drag-over');
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    loadFile(file);
  } else {
    showToast('Solo se aceptan imágenes', 'error');
  }
}

function loadFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast('La imagen supera los 10MB', 'error');
    return;
  }

  originalFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    originalDataURL = e.target.result;
    document.getElementById('originalImg').src = originalDataURL;
    document.getElementById('optionsSection').style.display = 'block';
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('downloadArea').style.display = 'none';
    document.getElementById('enhancedImg').style.display = 'none';
    document.getElementById('processingOverlay').style.display = 'flex';
    document.getElementById('enhancedImg').src = '';

    // Smooth scroll to options
    document.getElementById('optionsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  reader.readAsDataURL(file);
}

/* ── ENHANCE IMAGE ─────────────────────────────── */
async function enhanceImage() {
  if (!originalFile) {
    showToast('Selecciona una imagen primero', 'error');
    return;
  }

  const scale = parseInt(document.querySelector('input[name="scale"]:checked').value);
  const btn = document.getElementById('btnEnhance');

  btn.disabled = true;
  btn.textContent = '⟳ Procesando…';

  // Show preview section with loader
  document.getElementById('previewSection').style.display = 'block';
  document.getElementById('downloadArea').style.display = 'none';
  document.getElementById('enhancedImg').style.display = 'none';
  document.getElementById('processingOverlay').style.display = 'flex';
  setProcessingText('Enviando imagen…');

  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    // Convert image to base64 data URI
    const base64 = await fileToBase64(originalFile);

    setProcessingText('Iniciando mejora con IA…');

    // Start prediction on Replicate
    const prediction = await startPrediction(base64, scale);

    setProcessingText('Procesando con Real-ESRGAN…');

    // Poll until done
    const resultUrl = await pollPrediction(prediction.id);

    setProcessingText('¡Listo! Cargando resultado…');

    // Show result
    document.getElementById('enhancedImg').src = resultUrl;
    document.getElementById('enhancedImg').style.display = 'block';
    document.getElementById('processingOverlay').style.display = 'none';

    // Set download link
    document.getElementById('downloadBtn').href = resultUrl;
    document.getElementById('downloadArea').style.display = 'flex';

    showToast('¡Imagen mejorada!', 'success');

  } catch (err) {
    console.error(err);
    document.getElementById('processingOverlay').style.display = 'none';
    showToast(err.message || 'Error al procesar', 'error');
  }

  btn.disabled = false;
  btn.textContent = '✦ Mejorar imagen';
}

/* ── REPLICATE API CALLS ───────────────────────── */
async function startPrediction(base64DataURI, scale) {
  const response = await fetch('https://holy-water-aac4.efrenxdmx.workers.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: apiKey,
      payload: {
        version: '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
        input: {
          image: base64DataURI,
          scale: scale,
          face_enhance: false,
        }
      }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    if (response.status === 401) throw new Error('API Key inválida o sin permisos');
    if (response.status === 402) throw new Error('Sin créditos en tu cuenta de Replicate');
    throw new Error(err.detail || 'Error al iniciar predicción');
  }

  return response.json();
}

async function pollPrediction(id) {
  const maxAttempts = 60; // 2 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    await sleep(2000);
    attempts++;

    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Token ${apiKey}` }
    });

    if (!response.ok) throw new Error('Error consultando el estado');

    const data = await response.json();

    if (data.status === 'succeeded') {
      const output = data.output;
      if (!output) throw new Error('No se recibió resultado');
      return Array.isArray(output) ? output[0] : output;
    }

    if (data.status === 'failed') {
      throw new Error('La predicción falló: ' + (data.error || 'error desconocido'));
    }

    if (data.status === 'canceled') {
      throw new Error('La predicción fue cancelada');
    }

    // Update status text with dots animation
    const dots = '.'.repeat((attempts % 3) + 1);
    setProcessingText(`Procesando con IA${dots} (${attempts * 2}s)`);
  }

  throw new Error('Tiempo de espera agotado. Intenta con una imagen más pequeña.');
}

/* ── HELPERS ───────────────────────────────────── */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setProcessingText(text) {
  document.getElementById('processingText').textContent = text;
}

function resetApp() {
  originalFile = null;
  originalDataURL = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('optionsSection').style.display = 'none';
  document.getElementById('previewSection').style.display = 'none';
  document.getElementById('originalImg').src = '';
  document.getElementById('enhancedImg').src = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── TOAST NOTIFICATIONS ───────────────────────── */
let toastTimer = null;

function showToast(message, type = '') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type}`;

  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ── ENTER KEY ON API INPUT ────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('apiKeyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connectAPI();
  });
});
