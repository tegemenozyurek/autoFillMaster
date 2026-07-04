# AutoFillMaster

A Chrome extension that types text naturally into any editable field on any webpage — simulating real human typing with variable speed, natural pauses, and occasional typos.

## Features

- **Human-like typing** — Character-by-character input with random delays (40–120 ms), pauses after spaces and punctuation, and rare typo corrections
- **Universal field support** — Works with `input`, `textarea`, and `contenteditable` elements
- **Framework compatible** — Uses native property setters and proper DOM events for React, Vue, Angular, and plain HTML sites
- **Visual field selection** — Custom cursor with purple highlight when hovering editable fields
- **Persistent text** — Automatically saves and restores your last entered text
- **AutoFill history** — Keeps the last 5 texts you used for quick reuse
- **MyDocs** — Upload and reopen saved PDF documents from the popup
- **MyLinks** — Save frequently used links and open them later
- **Cancel anytime** — Press `Esc` or click Cancel to stop immediately

## Installation

### Load in Chrome

1. Clone or download this project to your machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `AutoFillMaster` folder
6. The extension icon should appear in your toolbar

## Usage

1. Click the **AutoFillMaster** icon in the Chrome toolbar
2. Enter or paste the text you want to type in the textarea
3. Click **Select Field** — the popup closes and selection mode begins
4. Move your cursor over the page — editable fields highlight with a purple border
5. Click the target field — typing starts automatically
6. Press **Esc** at any time to cancel

Use **MyDocs** to upload PDFs and **MyLinks** to save links you want to keep handy.

### Tips

- Use **Ctrl/Cmd + Enter** in the popup to quickly start selection mode
- Your text is auto-saved as you type in the popup
- Refresh a tab if the extension was installed while the tab was already open

## Project Structure

```
AutoFillMaster/
├── manifest.json       # Extension manifest (Manifest V3)
├── popup.html          # Popup markup
├── popup.css           # Popup styles
├── popup.js            # Popup logic and storage
├── background.js       # Service worker — message relay
├── content.js          # Selection mode and field targeting
├── typingEngine.js     # Human-like typing simulation
├── utils.js            # Shared constants and DOM helpers
├── icons/              # Extension logo and cursor
└── README.md
```

## How It Works

### Typing Engine

The typing engine never assigns `element.value = text` or pastes content instantly. Instead it:

1. Types one character at a time with randomized delays
2. Adds extra pauses after spaces, punctuation, and sentence-ending periods
3. Occasionally (~2%) makes a typo, pauses, backspaces, and continues correctly
4. Varies typing speed throughout the session for a natural feel

### Framework Compatibility

For `<input>` and `<textarea>`, the extension uses the native prototype value setter (the same technique React devtools use) and dispatches `input` and `change` events. For `contenteditable` elements, it uses `document.execCommand('insertText')` with a Selection API fallback.

### Selection Mode

When activated, the content script:

- Sets the page cursor to the custom AutoFillMaster cursor
- Highlights editable elements on hover
- Captures clicks to start typing in the selected field
- Listens for `Esc` to cancel

## Permissions

| Permission    | Reason                                              |
|---------------|-----------------------------------------------------|
| `storage`     | Save and restore the last entered text              |
| `scripting`   | Inject content script on tabs opened before install |
| `unlimitedStorage` | Store saved PDFs for MyDocs                  |
| `<all_urls>`  | Run on any website the user visits                  |

## Future Improvements

- [ ] Configurable typing speed and typo rate
- [ ] Multiple saved text snippets / templates
- [ ] Keyboard shortcut to open popup or start selection
- [ ] Append mode (type at cursor instead of replacing field content)
- [ ] Support for rich-text editors (TinyMCE, CKEditor, ProseMirror)
- [ ] Dark mode for the popup UI
- [ ] Firefox and Edge port

## License

MIT
