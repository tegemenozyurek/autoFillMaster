/**
 * AutoFillMaster — Human-like typing engine
 *
 * Simulates natural typing with variable speed, pauses, and occasional typos.
 * Supports input, textarea, and contenteditable elements.
 */

(() => {
const {
  TYPO_RATE,
  DELAY,
  randomBetween,
  sleep,
  getCharDelay,
  getTypoChar,
  setNativeValue,
  dispatchInputEvents,
  dispatchChangeEvent,
  dispatchKeyEvents,
} = globalThis.AutoFillMasterUtils;

class TypingEngine {
  constructor() {
    /** @type {boolean} */
    this._cancelled = false;
    /** @type {AbortController|null} */
    this._abortController = null;
  }

  /** Immediately stop any in-progress typing session. */
  cancel() {
    this._cancelled = true;
    this._abortController?.abort();
  }

  get isCancelled() {
    return this._cancelled;
  }

  /**
   * Type `text` into `element` character by character.
   * @returns {Promise<boolean>} true if completed, false if cancelled
   */
  async type(element, text) {
    this._cancelled = false;
    this._abortController = new AbortController();

    element.focus();

    if (element.isContentEditable) {
      return this._typeContentEditable(element, text);
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return this._typeInputElement(element, text);
    }

    return false;
  }

  // ─── Input / Textarea ────────────────────────────────────────────────────

  async _typeInputElement(element, text) {
    // Start fresh — clear existing value through native setter
    setNativeValue(element, '');
    dispatchInputEvents(element, 'deleteContentBackward');

    let currentValue = '';
    // Speed factor drifts slightly over the session for natural variation
    let speedFactor = 0.85 + Math.random() * 0.3;

    for (let i = 0; i < text.length; i++) {
      if (this._cancelled) return false;

      let char = text[i];

      // Occasionally drift speed factor
      if (Math.random() < 0.05) {
        speedFactor = 0.85 + Math.random() * 0.3;
      }

      // Rare typo with correction
      if (Math.random() < TYPO_RATE && char.trim() !== '') {
        const typoChar = getTypoChar(char);
        if (typoChar) {
          const typed = await this._typeChar(element, currentValue, typoChar);
          if (typed === null) return false;
          currentValue = typed;

          await sleep(randomBetween(DELAY.TYPO_PAUSE_MIN, DELAY.TYPO_PAUSE_MAX));
          if (this._cancelled) return false;

          // Backspace to fix typo
          const corrected = await this._backspace(element, currentValue);
          if (corrected === null) return false;
          currentValue = corrected;
        }
      }

      const result = await this._typeChar(element, currentValue, char);
      if (result === null) return false;
      currentValue = result;

      await sleep(getCharDelay(char, speedFactor));
    }

    dispatchChangeEvent(element);
    return true;
  }

  /**
   * Types a single character into an input/textarea.
   * @returns {Promise<string|null>} new value, or null if cancelled
   */
  async _typeChar(element, currentValue, char) {
    if (this._cancelled) return null;

    const { key, code, keyCode } = getKeyInfo(char);
    dispatchKeyEvents(element, key, code, keyCode);

    const newValue = currentValue + char;
    setNativeValue(element, newValue);
    dispatchInputEvents(element, 'insertText', char);

    return newValue;
  }

  /**
   * Simulates a backspace keypress.
   * @returns {Promise<string|null>} new value after deletion, or null if cancelled
   */
  async _backspace(element, currentValue) {
    if (this._cancelled) return null;

    dispatchKeyEvents(element, 'Backspace', 'Backspace', 8);

    const newValue = currentValue.slice(0, -1);
    setNativeValue(element, newValue);
    dispatchInputEvents(element, 'deleteContentBackward');

    await sleep(randomBetween(DELAY.BACKSPACE_DELAY_MIN, DELAY.BACKSPACE_DELAY_MAX));
    return newValue;
  }

  // ─── ContentEditable ─────────────────────────────────────────────────────

  async _typeContentEditable(element, text) {
    // Place caret at end of content
    this._focusContentEditable(element);

    let speedFactor = 0.85 + Math.random() * 0.3;

    for (let i = 0; i < text.length; i++) {
      if (this._cancelled) return false;

      let char = text[i];

      if (Math.random() < 0.05) {
        speedFactor = 0.85 + Math.random() * 0.3;
      }

      if (Math.random() < TYPO_RATE && char.trim() !== '') {
        const typoChar = getTypoChar(char);
        if (typoChar) {
          if (!(await this._insertContentEditableChar(element, typoChar))) return false;
          await sleep(randomBetween(DELAY.TYPO_PAUSE_MIN, DELAY.TYPO_PAUSE_MAX));
          if (this._cancelled) return false;
          if (!(await this._deleteContentEditableChar(element))) return false;
        }
      }

      if (!(await this._insertContentEditableChar(element, char))) return false;
      await sleep(getCharDelay(char, speedFactor));
    }

    dispatchChangeEvent(element);
    return true;
  }

  _focusContentEditable(element) {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async _insertContentEditableChar(element, char) {
    if (this._cancelled) return false;

    element.focus();

    const { key, code, keyCode } = getKeyInfo(char);
    dispatchKeyEvents(element, key, code, keyCode);

    // Prefer execCommand for broad framework compatibility
    const inserted = document.execCommand('insertText', false, char);

    if (!inserted) {
      // Fallback: Selection API
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        this._focusContentEditable(element);
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(char);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      dispatchInputEvents(element, 'insertText', char);
    }

    return true;
  }

  async _deleteContentEditableChar(element) {
    if (this._cancelled) return false;

    dispatchKeyEvents(element, 'Backspace', 'Backspace', 8);

    const deleted = document.execCommand('delete', false);

    if (!deleted) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
          range.deleteContents();
        } else {
          range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
          range.deleteContents();
        }
        dispatchInputEvents(element, 'deleteContentBackward');
      }
    }

    await sleep(randomBetween(DELAY.BACKSPACE_DELAY_MIN, DELAY.BACKSPACE_DELAY_MAX));
    return true;
  }
}

/** Builds keyboard event metadata for a typed character. */
function getKeyInfo(char) {
  if (char === ' ') return { key: ' ', code: 'Space', keyCode: 32 };
  if (char === '\n') return { key: 'Enter', code: 'Enter', keyCode: 13 };
  if (char === '\t') return { key: 'Tab', code: 'Tab', keyCode: 9 };
  if (/^[a-zA-Z]$/.test(char)) {
    return {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: char.toUpperCase().charCodeAt(0),
    };
  }
  if (/^[0-9]$/.test(char)) {
    return { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0) };
  }
  return { key: char, code: '', keyCode: char.charCodeAt(0) };
}

globalThis.AutoFillMasterTypingEngine = TypingEngine;
})();
