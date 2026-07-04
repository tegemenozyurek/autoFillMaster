/**
 * AutoFillMaster — Shared utilities and constants
 */

(function () {
  if (globalThis.AutoFillMasterUtils) return;

  // ─── Timing constants (ms) ───────────────────────────────────────────────

  const DELAY = {
    CHAR_MIN: 40,
    CHAR_MAX: 120,
    SPACE_EXTRA_MIN: 30,
    SPACE_EXTRA_MAX: 80,
    PUNCTUATION_MIN: 150,
    PUNCTUATION_MAX: 350,
    PERIOD_MIN: 300,
    PERIOD_MAX: 600,
    TYPO_PAUSE_MIN: 200,
    TYPO_PAUSE_MAX: 450,
    BACKSPACE_DELAY_MIN: 80,
    BACKSPACE_DELAY_MAX: 180,
  };

  /** Probability of inserting a typo before a character (≈2%) */
  const TYPO_RATE = 0.02;

  /** CSS class applied to highlighted editable fields during selection mode */
  const HIGHLIGHT_CLASS = 'afm-field-highlight';

  /** Data attribute marking elements handled by AutoFillMaster */
  const AFM_ATTR = 'data-afm-highlight';

// ─── Punctuation helpers ─────────────────────────────────────────────────

const PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', '-', '—', '…']);
const PERIODS = new Set(['.', '!', '?']);

function isPunctuation(char) {
  return PUNCTUATION.has(char);
}

function isPeriod(char) {
  return PERIODS.has(char);
}

// ─── Random helpers ──────────────────────────────────────────────────────

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a delay (ms) for typing the given character, with natural variation.
 */
function getCharDelay(char, speedFactor = 1) {
  let delay = randomBetween(DELAY.CHAR_MIN, DELAY.CHAR_MAX);

  if (char === ' ') {
    delay += randomBetween(DELAY.SPACE_EXTRA_MIN, DELAY.SPACE_EXTRA_MAX);
  } else if (isPeriod(char)) {
    delay += randomBetween(DELAY.PERIOD_MIN, DELAY.PERIOD_MAX);
  } else if (isPunctuation(char)) {
    delay += randomBetween(DELAY.PUNCTUATION_MIN, DELAY.PUNCTUATION_MAX);
  }

  // Slight speed variation throughout the sentence
  delay = Math.round(delay * speedFactor);
  return Math.max(20, delay);
}

// ─── Editable field detection ────────────────────────────────────────────

/**
 * Returns true if the element (or its editable ancestor) can receive typed text.
 */
function isEditableElement(el) {
  if (!el || !(el instanceof Element)) return false;

  const target = el.closest(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [contenteditable="true"], [contenteditable=""]'
  );

  if (!target) return false;

  if (target instanceof HTMLInputElement) {
    const type = (target.type || 'text').toLowerCase();
    const textTypes = ['text', 'search', 'email', 'url', 'tel', 'password', 'number'];
    return textTypes.includes(type);
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Resolves the actual editable element from a click target.
 */
function resolveEditableElement(el) {
  if (!el || !(el instanceof Element)) return null;

  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [contenteditable="true"], [contenteditable=""]';

  const target = el.closest(selector);
  if (!target || !isEditableElement(target)) return null;
  return target;
}

// ─── Native value setters (React / Vue / Angular compatibility) ──────────

const inputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;

const textareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value'
)?.set;

/**
 * Sets the value of an input or textarea using the native prototype setter
 * so framework listeners detect the change.
 */
function setNativeValue(element, value) {
  if (element instanceof HTMLInputElement && inputValueSetter) {
    inputValueSetter.call(element, value);
  } else if (element instanceof HTMLTextAreaElement && textareaValueSetter) {
    textareaValueSetter.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * Dispatches input and change events on an element.
 */
function dispatchInputEvents(element, inputType = 'insertText', data = null) {
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    })
  );
}

function dispatchChangeEvent(element) {
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Dispatches keyboard events for a character or special key.
 */
function dispatchKeyEvents(element, key, code, keyCode) {
  const opts = {
    key,
    code,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  };

  element.dispatchEvent(new KeyboardEvent('keydown', opts));
  element.dispatchEvent(new KeyboardEvent('keypress', opts));
  element.dispatchEvent(new KeyboardEvent('keyup', opts));
}

// ─── Typo generation ─────────────────────────────────────────────────────

/** QWERTY adjacent keys for natural-looking typos */
const ADJACENT_KEYS = {
  a: 'sqwz', b: 'vghn', c: 'xdfv', d: 'serfcx', e: 'wrsdf', f: 'drtgvc',
  g: 'ftyhbv', h: 'gyujnb', i: 'ujklo', j: 'huikmn', k: 'jiolm', l: 'kop',
  m: 'njk', n: 'bhjm', o: 'iklp', p: 'ol', q: 'wa', r: 'edft', s: 'awedxz',
  t: 'rfgy', u: 'yhji', v: 'cfgb', w: 'qase', x: 'zsdc', y: 'tghu', z: 'asx',
};

/**
 * Returns a plausible typo character for the given character, or null.
 */
function getTypoChar(char) {
  const lower = char.toLowerCase();
  const adjacent = ADJACENT_KEYS[lower];
  if (!adjacent) return null;

  const typo = adjacent[Math.floor(Math.random() * adjacent.length)];
  return char === char.toUpperCase() && char !== char.toLowerCase()
    ? typo.toUpperCase()
    : typo;
}

  globalThis.AutoFillMasterUtils = {
    DELAY,
    TYPO_RATE,
    HIGHLIGHT_CLASS,
    AFM_ATTR,
    isPunctuation,
    isPeriod,
    randomBetween,
    sleep,
    getCharDelay,
    isEditableElement,
    resolveEditableElement,
    setNativeValue,
    dispatchInputEvents,
    dispatchChangeEvent,
    dispatchKeyEvents,
    getTypoChar,
  };
})();
