# goodbye-ai-block

Obfuscate images and text to bypass censorship and prevent unauthorized scraping by AI crawlers, with automatic decryption via browser extension.

## Key Features

- **Bypass Censorship**: Obfuscate text and images to bypass automated censorship and filtering systems.
- **Prevent Scraping & AI Training**: By publishing content in an obfuscated format, you prevent crawlers and AI bots from scraping or training on your original content.
- **User Convenience**: Recipients with the browser extension installed can automatically view the decrypted content without any manual steps.

## Structure

```
web/                  ← Obfuscation/deobfuscation web tool
  converter.html
  converter.js
  obfuscator.js       ← Core engine

extension/            ← Browser extension (Chrome, Firefox, Safari)
  manifest.json
  converter.html      ← Built-in converter page
  converter.js
  obfuscator.js
  background.js
  content.js
  page-worker.js      ← Main World script (for image canvas processing)
  popup.html
  options.html
```

## Web Tool

1. Open `web/converter.html` in a browser
2. Images: drag/click/paste to upload → click **Convert**
3. Text: type input → click **Convert** → outputs `AI!1(...)` format
4. Feed obfuscated image/text back in to restore the original
5. Leave Seed empty for default

## Extension Install

### Chrome / Edge / Brave

1. Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/`

### Firefox

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `manifest.json` (121+)

### Safari (macOS / iOS)

1. Run `xcrun safari-web-extension-converter ./extension` → build in Xcode → enable in Safari settings

### Android

- **Kiwi Browser**: Menu → Extensions → load `.zip` of `extension/`
- **Firefox Android**: Load via AMO or add-on collection with `.xpi`

### Seed Setup

Click extension icon or go to extension Options to enter and save your Seed.

## Algorithm

### Image

1. Seed → SHA-256 → PRNG seed
2. Split into 8×8 or 16×16 blocks (auto-scaled) → per-block color invert / channel rotate / spatial rotate / flip
3. Fisher-Yates shuffle to reorder blocks
4. Embed 64-bit metadata (signal, version, original resolution) in bottom 4px

### Text

1. Seed → SHA-256 → PRNG seed
2. Per-byte XOR + bit rotation on UTF-8 bytes
3. Base64-encode and wrap as `AI!1(...)`
