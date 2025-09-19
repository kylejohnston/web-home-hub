// ---------------------------
// Step 2a: Image input + preview with downscale
// - Drag & drop, click, or paste an image
// - Downscale huge images to a web-friendly size (keeps aspect ratio)
// - Apply the image to ALL .placeholder elements (cover fit)
// ---------------------------

const MAX_DIMENSION = 1600; // longest side after resize
const JPEG_QUALITY  = 0.86; // export quality when we use canvas

const dropzone    = document.getElementById('dropzone');
const fileInput   = document.getElementById('fileInput');
// Any element meant to display an image should have class="placeholder"
const placeholders = Array.from(document.querySelectorAll('.placeholder'));

// ---------- helpers ----------

// Read a File -> HTMLImageElement
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Downscale to MAX_DIMENSION (keeps aspect ratio). Returns dataURL (JPEG).
function downscaleToDataURL(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const longest = Math.max(w, h);
  const scale = Math.min(1, MAX_DIMENSION / longest); // never upscale
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);

  // If we didn't need to resize and source is already a data URL, reuse it
  if (scale === 1 && img.src.startsWith('data:')) return img.src;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d');
  // Optional quality tweak for very large downscales could draw in steps
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

// Apply the dataURL to ALL placeholders (cover fit handled by CSS)
function applyToAllPlaceholders(dataURL) {
  placeholders.forEach((ph) => {
    ph.style.backgroundImage = `url("${dataURL}")`;
    ph.style.backgroundPosition = 'center';
    ph.style.backgroundSize = 'cover';
    ph.style.backgroundRepeat = 'no-repeat';
    ph.classList.add('has-image');
  });
  // Save image to localStorage
  try {
    localStorage.setItem('cardImage', dataURL);
  } catch {}
}

// Handle a File object end-to-end
async function handleFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;

  try {
    const img = await fileToImage(file);
    const dataURL = downscaleToDataURL(img);
    applyToAllPlaceholders(dataURL);
  } catch (err) {
    console.error('Could not process image:', err);
    alert('Sorry, that image could not be processed.');
  }
}
// Restore image from localStorage on page load
function restoreImageFromStorage() {
  const dataURL = localStorage.getItem('cardImage');
  if (dataURL) applyToAllPlaceholders(dataURL);
}
restoreImageFromStorage();

// ---------- event wiring ----------

// Make the dropzone open the system file picker on click
dropzone?.addEventListener('click', () => fileInput?.click());

// File input change
fileInput?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  handleFile(file);
  // allow selecting the same file again later
  e.target.value = '';
});

// Prevent default browser behavior for drag events on the page
['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// Visual state for dropzone + handle drop
dropzone?.addEventListener('dragenter', () => dropzone.classList.add('dragover'));
dropzone?.addEventListener('dragover',  () => dropzone.classList.add('dragover'));
dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone?.addEventListener('drop', (e) => {
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  handleFile(file);
});

// Paste from clipboard anywhere on the page
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      handleFile(file);
      break;
    }
  }
});
// ---------------------------
// Step 2b: HEX input → update accent color
// ---------------------------

const hexInput = document.getElementById('hexInput');

// Normalize hex: allow #ABC or #ABCDEF, with/without leading "#"
function normalizeHex(value) {
  if (!value) return null;
  let hex = value.trim().replace(/^#/, '');

  // Expand shorthand #ABC → #AABBCC
  if (hex.length === 3) {
    hex = hex.split('').map(ch => ch + ch).join('');
  }

  // Validate: must be exactly 6 hex chars
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return null;
}

function applyAccentColor(hex) {
  document.documentElement.style.setProperty('--accent', hex);
}

// Event: on typing or pasting into hex input
hexInput?.addEventListener('input', (e) => {
  const raw = e.target.value;
  const normalized = normalizeHex(raw);
  if (normalized) {
    applyAccentColor(normalized);
    // Optional: visually confirm the formatted hex
    e.target.style.borderColor = '#ccc';
  } else {
    // Bad input → maybe mark field
    e.target.style.borderColor = 'red';
  }
});

// Initialize field with current CSS variable
(function initHexField() {
  const currentAccent = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  if (currentAccent) {
    hexInput.value = currentAccent.replace(/^#/, '');
  }
})();
// ---------------------------
// Step 2c: Click-to-edit text mirroring by group/key
// ---------------------------

const editableNodes = Array.from(document.querySelectorAll('.editable[data-group][data-key]'));

// --- Capture default text immediately ---
const defaultText = {};
function mapKey(group, key) { return `${group}::${key}`; }
editableNodes.forEach(node => {
  const group = node.getAttribute('data-group');
  const key = node.getAttribute('data-key');
  defaultText[`${group}::${key}`] = node.innerText;
});

// Index nodes by group+key for fast fan-out updates
const bindMap = new Map(); // key = `${group}::${key}`, value = Set<HTMLElement>
editableNodes.forEach(node => {
  const group = node.getAttribute('data-group');
  const key   = node.getAttribute('data-key');
  const k = mapKey(group, key);
  if (!bindMap.has(k)) bindMap.set(k, new Set());
  bindMap.get(k).add(node);
});

// Start editing on click
editableNodes.forEach(node => {
  node.addEventListener('click', () => beginEdit(node));
  node.addEventListener('focus', () => beginEdit(node));
});

function beginEdit(node) {
  // If already editing, skip
  if (node.isContentEditable) {
    // Place caret at end if not already
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.anchorNode !== node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return;
  }

  node.setAttribute('contenteditable', 'true');
  node.focus();

  // Place caret at end
  setTimeout(() => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, 0);

  // Live mirror on input
  const onInput = () => mirrorValue(node);
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      endEdit(node);
    }
  };
  const onBlur = () => endEdit(node);

  node.addEventListener('input', onInput);
  node.addEventListener('keydown', onKey);
  node.addEventListener('blur', onBlur, { once: true });

  // stash listeners so we can remove on end
  node._editHandlers = { onInput, onKey };
}

function endEdit(node) {
  if (!node.isContentEditable) return;
  node.removeAttribute('contenteditable');

  // cleanup listeners
  if (node._editHandlers) {
    node.removeEventListener('input', node._editHandlers.onInput);
    node.removeEventListener('keydown', node._editHandlers.onKey);
    node._editHandlers = null;
  }

  // final mirror (trim and hide if key = legal and empty)
  mirrorValue(node, { finalize: true });
}

function mirrorValue(sourceNode, opts = {}) {
  const group = sourceNode.getAttribute('data-group');
  const key   = sourceNode.getAttribute('data-key');
  const k = mapKey(group, key);

  let value = sourceNode.innerText;
  if (opts.finalize) value = value.trim();

  // Save to localStorage
  try {
    localStorage.setItem(`cardText:${group}:${key}`, value);
  } catch {}

  // If this is "legal" and emptied, hide all mapped nodes; else show & set text
  const isLegal = key.toLowerCase() === 'legal';
  const nodes = bindMap.get(k) || [];
  if (isLegal && !value) {
    nodes.forEach(n => { n.style.display = 'none'; n.innerText = ''; });
    return;
  } else {
    nodes.forEach(n => { n.style.display = ''; });
  }

  // Mirror text to all siblings in the same group/key
  nodes.forEach(n => {
    if (n !== sourceNode) n.innerText = value;
  });
}
// Restore editable text from localStorage on page load
function restoreTextFromStorage() {
  editableNodes.forEach(node => {
    const group = node.getAttribute('data-group');
    const key = node.getAttribute('data-key');
    const stored = localStorage.getItem(`cardText:${group}:${key}`);
    if (stored !== null) {
      node.innerText = stored;
      // Hide if legal and empty
      if (key.toLowerCase() === 'legal' && !stored.trim()) {
        node.style.display = 'none';
      } else {
        node.style.display = '';
      }
    }
  });
}
restoreTextFromStorage();

// --- Reset all text blocks to default state ---
document.getElementById('resetTextBtn')?.addEventListener('click', () => {
  // Remove all text keys from localStorage
  editableNodes.forEach(node => {
    const group = node.getAttribute('data-group');
    const key = node.getAttribute('data-key');
    localStorage.removeItem(`cardText:${group}:${key}`);
    // Restore default text from initial HTML
    const def = defaultText[`${group}::${key}`];
    node.innerText = def;
    node.style.display = '';
  });
});
