/**
 * AutoFillMaster — Popup script
 */

const STORAGE_KEY = 'afm_lastText';
const HISTORY_KEY = 'afm_textHistory';
const DOCS_KEY = 'afm_docs';
const LINKS_KEY = 'afm_links';
const SAVE_DEBOUNCE_MS = 400;
const MAX_HISTORY_ITEMS = 5;
const MAX_DOC_ITEMS = 5;
const MAX_LINK_ITEMS = 20;

const textInput = document.getElementById('textInput');
const selectBtn = document.getElementById('selectBtn');
const cancelBtn = document.getElementById('cancelBtn');
const charCount = document.getElementById('charCount');
const statusMsg = document.getElementById('statusMsg');
const autoFillTab = document.getElementById('autoFillTab');
const myDocsTab = document.getElementById('myDocsTab');
const myLinksTab = document.getElementById('myLinksTab');
const autoFillPanel = document.getElementById('autoFillPanel');
const myDocsPanel = document.getElementById('myDocsPanel');
const myLinksPanel = document.getElementById('myLinksPanel');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const pdfInput = document.getElementById('pdfInput');
const docsList = document.getElementById('docsList');
const linkInput = document.getElementById('linkInput');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const linksList = document.getElementById('linksList');
const githubBtn = document.getElementById('githubBtn');

const GITHUB_URL = 'https://github.com/tegemenozyurek/autoFillMaster';

let saveTimer = null;
let textHistory = [];
let docs = [];
let links = [];

// ─── Init ────────────────────────────────────────────────────────────────

async function init() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, HISTORY_KEY, DOCS_KEY, LINKS_KEY]);
    if (result[STORAGE_KEY]) {
      textInput.value = result[STORAGE_KEY];
    }
    textHistory = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
    docs = Array.isArray(result[DOCS_KEY]) ? result[DOCS_KEY] : [];
    links = Array.isArray(result[LINKS_KEY]) ? result[LINKS_KEY] : [];
  } catch (err) {
    console.error('[AutoFillMaster] Failed to load saved data:', err);
  }

  updateCharCount();
  renderHistory();
  renderDocs();
  renderLinks();
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

function setListEmpty(listEl, message) {
  listEl.className = 'item-list empty';
  listEl.textContent = message;
}

function createActionButton(label, onClick) {
  const button = document.createElement('button');
  button.className = 'item-action';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function renderHistory() {
  historyList.replaceChildren();
  if (!textHistory.length) {
    setListEmpty(historyList, 'No history yet.');
    return;
  }

  historyList.className = 'item-list';
  textHistory.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const main = document.createElement('div');
    main.className = 'item-main';

    const text = document.createElement('div');
    text.className = 'item-text';
    text.textContent = item.text;

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = new Date(item.createdAt).toLocaleString();

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      createActionButton('Use', () => {
        textInput.value = item.text;
        updateCharCount();
        scheduleSave();
        showPanel('autofill');
      }),
      createActionButton('Del', async () => {
        textHistory.splice(index, 1);
        await saveHistory();
        renderHistory();
      }),
    );

    main.append(text, meta);
    row.append(main, actions);
    historyList.append(row);
  });
}

function renderDocs() {
  docsList.replaceChildren();
  if (!docs.length) {
    setListEmpty(docsList, 'No PDF uploaded yet.');
    return;
  }

  docsList.className = 'item-list';
  docs.forEach((doc, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const main = document.createElement('div');
    main.className = 'item-main';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = doc.name;

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = `${formatBytes(doc.size)} · ${new Date(doc.createdAt).toLocaleDateString()}`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      createActionButton('Open', async () => {
        try {
          await openStoredPdf(doc);
        } catch (err) {
          console.error('[AutoFillMaster] Failed to open PDF:', err);
          setStatus('Could not open this PDF.', 'error');
        }
      }),
      createActionButton('Del', async () => {
        docs.splice(index, 1);
        await saveDocs();
        renderDocs();
      }),
    );

    main.append(title, meta);
    row.append(main, actions);
    docsList.append(row);
  });
}

function renderLinks() {
  linksList.replaceChildren();
  if (!links.length) {
    setListEmpty(linksList, 'No links saved yet.');
    return;
  }

  linksList.className = 'item-list';
  links.forEach((link, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';

    const main = document.createElement('div');
    main.className = 'item-main';

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = link.url;

    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = new Date(link.createdAt).toLocaleString();

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      createActionButton('Open', () => {
        chrome.tabs.create({ url: link.url });
      }),
      createActionButton('Del', async () => {
        links.splice(index, 1);
        await saveLinks();
        renderLinks();
      }),
    );

    main.append(title, meta);
    row.append(main, actions);
    linksList.append(row);
  });
}

function showPanel(panelName) {
  const panels = {
    autofill: [autoFillTab, autoFillPanel],
    docs: [myDocsTab, myDocsPanel],
    links: [myLinksTab, myLinksPanel],
  };

  Object.entries(panels).forEach(([name, [tab, panel]]) => {
    const active = name === panelName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });

  if (panelName === 'autofill') {
    textInput.focus();
  }
}

function setStatus(message, type = '') {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg${type ? ` ${type}` : ''}`;
}

function setLoading(isLoading) {
  selectBtn.disabled = isLoading;
  selectBtn.textContent = isLoading ? 'Starting…' : 'Select Field';
}

async function saveHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: textHistory });
}

async function saveDocs() {
  await chrome.storage.local.set({ [DOCS_KEY]: docs });
}

async function saveLinks() {
  await chrome.storage.local.set({ [LINKS_KEY]: links });
}

async function addHistoryItem(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  textHistory = [
    { text: trimmed, createdAt: Date.now() },
    ...textHistory.filter((item) => item.text !== trimmed),
  ].slice(0, MAX_HISTORY_ITEMS);

  await saveHistory();
  renderHistory();
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
    await addHistoryItem(text);

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function openStoredPdf(doc) {
  const response = await fetch(doc.dataUrl);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url });
}

async function handlePdfUpload() {
  const [file] = pdfInput.files || [];
  if (!file) return;

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Please choose a PDF file.', 'error');
    pdfInput.value = '';
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    docs = [
      {
        name: file.name,
        size: file.size,
        createdAt: Date.now(),
        dataUrl,
      },
      ...docs.filter((doc) => doc.name !== file.name),
    ].slice(0, MAX_DOC_ITEMS);

    await saveDocs();
    renderDocs();
    setStatus('PDF saved.', 'success');
  } catch (err) {
    console.error('[AutoFillMaster] Failed to save PDF:', err);
    setStatus('Could not save this PDF.', 'error');
  } finally {
    pdfInput.value = '';
  }
}

async function handleSaveLink() {
  const url = normalizeUrl(linkInput.value);
  if (!url) {
    setStatus('Enter a link first.', 'error');
    linkInput.focus();
    return;
  }

  try {
    new URL(url);
  } catch {
    setStatus('Enter a valid link.', 'error');
    linkInput.focus();
    return;
  }

  links = [
    { url, createdAt: Date.now() },
    ...links.filter((link) => link.url !== url),
  ].slice(0, MAX_LINK_ITEMS);

  await saveLinks();
  renderLinks();
  linkInput.value = '';
  setStatus('Link saved.', 'success');
}

// ─── Event listeners ─────────────────────────────────────────────────────

textInput.addEventListener('input', () => {
  updateCharCount();
  scheduleSave();
});

selectBtn.addEventListener('click', handleSelectField);
cancelBtn.addEventListener('click', handleCancel);
autoFillTab.addEventListener('click', () => showPanel('autofill'));
myDocsTab.addEventListener('click', () => showPanel('docs'));
myLinksTab.addEventListener('click', () => showPanel('links'));
clearHistoryBtn.addEventListener('click', async () => {
  textHistory = [];
  await saveHistory();
  renderHistory();
});
pdfInput.addEventListener('change', handlePdfUpload);
saveLinkBtn.addEventListener('click', handleSaveLink);
linkInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSaveLink();
  }
});
githubBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: GITHUB_URL });
});

// Keyboard shortcut: Ctrl/Cmd + Enter to start
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleSelectField();
  }
});

init();
