/**
 * AutoFillMaster — Popup script
 */

const STORAGE_KEY = 'afm_lastText';
const SAVE_DEBOUNCE_MS = 400;

const textInput = document.getElementById('textInput');
const selectBtn = document.getElementById('selectBtn');
const cancelBtn = document.getElementById('cancelBtn');
const charCount = document.getElementById('charCount');
const statusMsg = document.getElementById('statusMsg');

let saveTimer = null;

// ─── Init ────────────────────────────────────────────────────────────────

async function init() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      textInput.value = result[STORAGE_KEY];
    }
  } catch (err) {
    console.error('[AutoFillMaster] Failed to load saved text:', err);
  }

  updateCharCount();
  textInput.focus();
}

// ─── Storage ─────────────────────────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveText, SAVE_DEBOUNCE_MS);
}

async function saveText() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: textInput.value });
  } catch (err) {
    console.error('[AutoFillMaster] Failed to save text:', err);
  }
}

// ─── UI helpers ──────────────────────────────────────────────────────────

function updateCharCount() {
  const len = textInput.value.length;
  charCount.textContent = `${len} character${len === 1 ? '' : 's'}`;
}

function setStatus(message, type = '') {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg${type ? ` ${type}` : ''}`;
}

function setLoading(isLoading) {
  selectBtn.disabled = isLoading;
  selectBtn.textContent = isLoading ? 'Starting…' : 'Select Field';
}

// ─── Actions ─────────────────────────────────────────────────────────────

async function handleSelectField() {
  const text = textInput.value;

  if (!text.trim()) {
    setStatus('Please enter some text first.', 'error');
    textInput.focus();
    return;
  }

  setLoading(true);
  setStatus('');

  try {
    await saveText();

    const response = await chrome.runtime.sendMessage({
      action: 'START_SELECTION',
      text,
    });

    if (response?.success) {
      window.close();
    } else {
      setStatus(response?.error || 'Could not start selection mode.', 'error');
      setLoading(false);
    }
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', 'error');
    setLoading(false);
  }
}

async function handleCancel() {
  try {
    await chrome.runtime.sendMessage({ action: 'CANCEL_ALL' });
  } catch {
    // Ignore — content script may not be active
  }
  window.close();
}

// ─── Event listeners ─────────────────────────────────────────────────────

textInput.addEventListener('input', () => {
  updateCharCount();
  scheduleSave();
});

selectBtn.addEventListener('click', handleSelectField);
cancelBtn.addEventListener('click', handleCancel);

// Keyboard shortcut: Ctrl/Cmd + Enter to start
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleSelectField();
  }
});

init();
