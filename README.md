<img width="1092" height="786" alt="image" src="https://github.com/user-attachments/assets/85372cd0-4299-46b7-a332-634bd7ab1d39" />
# Em Dash Cleaner

A tiny Chrome extension that strips em dashes ( ) from any input field on any website. Built for cleaning up LLM output (ChatGPT, Claude, Gemini) before you paste or send it.

## How to use

Two ways to trigger it inside any input, textarea, or chat box:

1. **Type a slash command** in the field: `/clear-emdash` (or `/clear-em`, `/noem`).
   The extension detects the trigger, removes every em dash from the field, and
   strips the trigger text itself.
2. **Press the shortcut**: `Alt + Shift + E` while focused on any input.

A small toast confirms when it ran.

## Install (developer mode until you publish to the Web Store)

1. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Arc).
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the `d:\em-dash-ext` folder.
4. Pin the extension to your toolbar so the popup is one click away.
5. (Optional) Visit `chrome://extensions/shortcuts` to rebind the keyboard shortcut.

## Options (click the toolbar icon)

- **Replacement style**: remove, hyphen `-`, comma+space `, `, or spaced hyphen ` - `.
- **Also clean en dashes (–)**: off by default; turn on if you also want `–` cleaned.
- **Auto-replace as I type**: removes em dashes the moment you type or paste them no command needed.
- **Show confirmation toast**: small bottom-of-screen notification when it fires.

## Where it works

- Plain `<input>` and `<textarea>` fields (Twitter/X, Reddit, GitHub, email, etc.)
- ContentEditable rich editors (ChatGPT, Claude.ai, Gemini, most chat UIs)
- Inside iframes (e.g. embedded composers)

It does NOT touch page text outside of input fields only what you're actively editing.

## Files

- `manifest.json` Manifest V3 config + keyboard command
- `content.js` listens on every page, watches inputs for the trigger, performs the replacement
- `background.js` receives the keyboard shortcut and forwards it to the active tab
- `popup.html` / `popup.js` / `popup.css` settings panel
