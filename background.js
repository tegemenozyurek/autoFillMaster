/**
 * AutoFillMaster — Background service worker
 *
 * Relays messages between the popup and content scripts.
 */

const STORAGE_KEY = 'afm_lastText';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SAVE_TEXT') {
    chrome.storage.local.set({ [STORAGE_KEY]: message.text }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'START_SELECTION') {
    handleStartSelection(message.text)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'CANCEL_ALL') {
    broadcastToActiveTab({ action: 'CANCEL' })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});

/**
 * Saves text and tells the active tab's content script to enter selection mode.
 */
async function handleStartSelection(text) {
  await chrome.storage.local.set({ [STORAGE_KEY]: text });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Restricted pages (chrome://, Web Store, etc.) cannot receive content scripts
  if (
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('about:')
  ) {
    throw new Error('Cannot run on this page. Try a regular website.');
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_SELECTION',
      text,
    });
  } catch {
    // Content script may not be injected yet (e.g. tab opened before install)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['utils.js', 'typingEngine.js', 'content.js'],
    });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_SELECTION',
      text,
    });
  }

  return { success: true };
}

async function broadcastToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Tab may not have content script — nothing to cancel
    }
  }
}
