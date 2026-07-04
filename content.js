/**
 * AutoFillMaster — Content script
 *
 * Handles field selection mode, highlighting, and orchestrates typing.
 */

(() => {
if (globalThis.__AFM_CONTENT_LOADED__) {
  // Already injected (manifest + programmatic fallback both ran)
  return;
}
globalThis.__AFM_CONTENT_LOADED__ = true;

const TypingEngine = globalThis.AutoFillMasterTypingEngine;
const {
  HIGHLIGHT_CLASS,
  resolveEditableElement,
} = globalThis.AutoFillMasterUtils;

// ─── State ───────────────────────────────────────────────────────────────

/** @type {TypingEngine|null} */
let typingEngine = null;

/** @type {boolean} */
let selectionModeActive = false;

/** @type {Element|null} */
let highlightedElement = null;

/** @type {string|null} */
let pendingText = null;

/** Bound handlers kept for clean removal */
let boundMouseMove = null;
let boundMouseOver = null;
let boundClick = null;
let boundKeyDown = null;

/** Last sparkle trail position/time to keep effects light */
let lastSparkle = { x: 0, y: 0, time: 0 };

// ─── Styles ──────────────────────────────────────────────────────────────

const STYLE_ID = 'afm-selection-styles';
const EFFECT_STYLE_ID = 'afm-magic-effects-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  injectEffectStyles();

  const penCursorUrl = chrome.runtime.getURL('icons/penCursor.png');
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #3b82f6 !important;
      outline-offset: 2px !important;
      background-color: rgba(59, 130, 246, 0.08) !important;
      cursor: url("${penCursorUrl}") 4 28, pointer !important;
      transition: outline-color 0.15s ease, background-color 0.15s ease;
    }

    body.afm-selection-active {
      cursor: url("${penCursorUrl}") 4 28, pointer !important;
    }

    body.afm-selection-active *:not(.${HIGHLIGHT_CLASS}) {
      cursor: url("${penCursorUrl}") 4 28, pointer !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function injectEffectStyles() {
  if (document.getElementById(EFFECT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = EFFECT_STYLE_ID;
  style.textContent = `
    .afm-sparkle,
    .afm-magic-dot,
    .afm-magic-ring {
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      contain: layout style paint !important;
    }

    .afm-sparkle {
      width: var(--afm-size, 7px) !important;
      height: var(--afm-size, 7px) !important;
      border-radius: 999px !important;
      background: radial-gradient(circle, #ffffff 0 18%, #fde68a 24% 45%, #60a5fa 58%, transparent 72%) !important;
      box-shadow: 0 0 10px rgba(96, 165, 250, 0.85), 0 0 18px rgba(253, 230, 138, 0.65) !important;
      transform: translate3d(var(--afm-x), var(--afm-y), 0) scale(1) rotate(0deg) !important;
      animation: afm-sparkle-trail 620ms ease-out forwards !important;
    }

    .afm-magic-ring {
      width: 12px !important;
      height: 12px !important;
      margin: -6px 0 0 -6px !important;
      border: 2px solid rgba(96, 165, 250, 0.9) !important;
      border-radius: 999px !important;
      box-shadow: 0 0 18px rgba(59, 130, 246, 0.9), inset 0 0 12px rgba(253, 230, 138, 0.8) !important;
      transform: translate3d(var(--afm-x), var(--afm-y), 0) scale(0.35) !important;
      animation: afm-magic-ring 560ms ease-out forwards !important;
    }

    .afm-magic-dot {
      width: 8px !important;
      height: 8px !important;
      margin: -4px 0 0 -4px !important;
      border-radius: 999px !important;
      background: #ffffff !important;
      box-shadow: 0 0 8px #ffffff, 0 0 16px #facc15, 0 0 24px #38bdf8 !important;
      transform: translate3d(var(--afm-x), var(--afm-y), 0) rotate(var(--afm-angle)) translateX(0) scale(1) !important;
      animation: afm-magic-dot 680ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
    }

    @keyframes afm-sparkle-trail {
      0% {
        opacity: 1;
        transform: translate3d(var(--afm-x), var(--afm-y), 0) scale(1) rotate(0deg);
      }
      100% {
        opacity: 0;
        transform: translate3d(calc(var(--afm-x) + var(--afm-dx)), calc(var(--afm-y) + var(--afm-dy)), 0) scale(0) rotate(90deg);
      }
    }

    @keyframes afm-magic-ring {
      0% {
        opacity: 0.95;
        transform: translate3d(var(--afm-x), var(--afm-y), 0) scale(0.35);
      }
      100% {
        opacity: 0;
        transform: translate3d(var(--afm-x), var(--afm-y), 0) scale(5.4);
      }
    }

    @keyframes afm-magic-dot {
      0% {
        opacity: 1;
        transform: translate3d(var(--afm-x), var(--afm-y), 0) rotate(var(--afm-angle)) translateX(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate3d(var(--afm-x), var(--afm-y), 0) rotate(var(--afm-angle)) translateX(var(--afm-distance)) scale(0);
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}

function createSparkle(x, y) {
  const sparkle = document.createElement('span');
  sparkle.className = 'afm-sparkle';

  const size = 5 + Math.random() * 6;
  sparkle.style.setProperty('--afm-x', `${x - size / 2}px`);
  sparkle.style.setProperty('--afm-y', `${y - size / 2}px`);
  sparkle.style.setProperty('--afm-size', `${size}px`);
  sparkle.style.setProperty('--afm-dx', `${-8 + Math.random() * 16}px`);
  sparkle.style.setProperty('--afm-dy', `${6 + Math.random() * 16}px`);

  document.documentElement.appendChild(sparkle);
  window.setTimeout(() => sparkle.remove(), 700);
}

function createMagicBurst(x, y) {
  injectEffectStyles();

  const ring = document.createElement('span');
  ring.className = 'afm-magic-ring';
  ring.style.setProperty('--afm-x', `${x}px`);
  ring.style.setProperty('--afm-y', `${y}px`);
  document.documentElement.appendChild(ring);
  window.setTimeout(() => ring.remove(), 650);

  for (let i = 0; i < 14; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'afm-magic-dot';
    dot.style.setProperty('--afm-x', `${x}px`);
    dot.style.setProperty('--afm-y', `${y}px`);
    dot.style.setProperty('--afm-angle', `${(360 / 14) * i + Math.random() * 12}deg`);
    dot.style.setProperty('--afm-distance', `${24 + Math.random() * 26}px`);
    document.documentElement.appendChild(dot);
    window.setTimeout(() => dot.remove(), 760);
  }
}

// ─── Highlight management ────────────────────────────────────────────────

function clearHighlight() {
  if (highlightedElement) {
    highlightedElement.classList.remove(HIGHLIGHT_CLASS);
    highlightedElement = null;
  }
}

function setHighlight(el) {
  if (el === highlightedElement) return;
  clearHighlight();
  if (el) {
    el.classList.add(HIGHLIGHT_CLASS);
    highlightedElement = el;
  }
}

// ─── Selection mode ──────────────────────────────────────────────────────

function removeSelectionListeners() {
  if (boundMouseMove) {
    document.removeEventListener('mousemove', boundMouseMove, true);
    document.removeEventListener('mouseover', boundMouseOver, true);
    document.removeEventListener('click', boundClick, true);
  }
}

function enterSelectionMode(text) {
  if (selectionModeActive) {
    exitSelectionMode(false);
  }

  pendingText = text;
  selectionModeActive = true;
  typingEngine = new TypingEngine();
  lastSparkle = { x: 0, y: 0, time: 0 };

  injectStyles();
  document.body.classList.add('afm-selection-active');

  boundMouseMove = onMouseMove;
  boundMouseOver = onMouseOver;
  boundClick = onClick;
  boundKeyDown = onKeyDown;

  document.addEventListener('mousemove', boundMouseMove, true);
  document.addEventListener('mouseover', boundMouseOver, true);
  document.addEventListener('click', boundClick, true);
  document.addEventListener('keydown', boundKeyDown, true);
}

function exitSelectionMode(cancelTyping = true) {
  if (cancelTyping && typingEngine) {
    typingEngine.cancel();
  }

  selectionModeActive = false;
  pendingText = null;

  clearHighlight();
  document.body.classList.remove('afm-selection-active');
  removeSelectionListeners();

  if (boundKeyDown) {
    document.removeEventListener('keydown', boundKeyDown, true);
  }

  removeStyles();
  typingEngine = null;

  boundMouseMove = null;
  boundMouseOver = null;
  boundClick = null;
  boundKeyDown = null;
}

function onMouseMove(e) {
  if (!selectionModeActive) return;
  const editable = resolveEditableElement(e.target);
  setHighlight(editable);

  const now = performance.now();
  const distance = Math.hypot(e.clientX - lastSparkle.x, e.clientY - lastSparkle.y);
  if (now - lastSparkle.time > 45 && distance > 14) {
    createSparkle(e.clientX, e.clientY);
    lastSparkle = { x: e.clientX, y: e.clientY, time: now };
  }
}

function onMouseOver(e) {
  if (!selectionModeActive) return;
  const editable = resolveEditableElement(e.target);
  if (!editable) {
    clearHighlight();
  }
}

async function onClick(e) {
  if (!selectionModeActive || !pendingText) return;

  const editable = resolveEditableElement(e.target);
  if (!editable) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  createMagicBurst(e.clientX, e.clientY);

  const text = pendingText;
  const engine = typingEngine;

  // Exit selection mode UI before typing begins
  clearHighlight();
  document.body.classList.remove('afm-selection-active');
  removeSelectionListeners();
  selectionModeActive = false;

  try {
    const completed = await engine.type(editable, text);
    chrome.runtime.sendMessage({
      action: 'TYPING_FINISHED',
      completed,
    }).catch(() => {});
  } catch (err) {
    console.error('[AutoFillMaster] Typing error:', err);
  } finally {
    exitSelectionMode(false);
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancelAll();
  }
}

function cancelAll() {
  if (typingEngine) {
    typingEngine.cancel();
  }
  exitSelectionMode(false);
  chrome.runtime.sendMessage({ action: 'TYPING_CANCELLED' }).catch(() => {});
}

// ─── Message handling ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'START_SELECTION':
      enterSelectionMode(message.text || '');
      sendResponse({ success: true });
      break;

    case 'CANCEL':
      cancelAll();
      sendResponse({ success: true });
      break;

    case 'GET_STATUS':
      sendResponse({
        selectionModeActive,
        isTyping: typingEngine !== null && !typingEngine.isCancelled && !selectionModeActive,
      });
      break;

    default:
      break;
  }

  return true;
});
})();
