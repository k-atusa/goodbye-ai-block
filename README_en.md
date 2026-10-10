# goodbye-ai-block

Obfuscate images and text to bypass censorship, prevent unauthorized scraping by AI crawlers, and automatically decrypt content via a browser extension.


## Key Features

- **Bypass Censorship**: Obfuscate text and images to bypass automated censorship and filtering systems.
- **Prevent Scraping & AI Training**: By publishing content in an obfuscated format, you prevent crawlers and AI bots from unauthorized scraping or using your content as training data.
- **User Convenience**: Recipients with the browser extension installed can automatically view the original clean content in their browser without any manual steps.

### Conversion Options

- **HTML replace**: Automatically inserts line breaks and spaces to preserve the formatting of the original text.
- **Convert inputs**: Detects and converts text being typed inside text input fields.

### Seed Configuration

Click the extension icon or go to extension Options to enter and save your Seed.


## Installation & Usage

### Web Tool

1. Open `web/converter.html` in your browser
2. Images: Upload via drag / click / paste → click **Convert**
3. Text: Type input → click **Convert** → output in `` format
4. Feed obfuscated images/text back in to automatically restore the original
5. Leave Seed empty to use the default value

### Chrome / Edge / Brave

Open `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/`

### Firefox

`about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `manifest.json` (121+)

### Safari (macOS / iOS)

`xcrun safari-web-extension-converter ./extension` → Build in Xcode → Enable in Safari settings

### Android

- **Kiwi Browser**: Menu → Extensions → load `.zip`
- **Firefox Android**: Load `.xpi` via AMO or add-on collection


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

### Image Shuffle Algorithm

1. Seed → SHA-256 → PRNG seed
2. Split into 8×8 or 16×16 blocks (auto-scaled) → per-block color invert / channel rotate / spatial rotate / flip
3. Fisher-Yates shuffle to reorder blocks
4. Embed 64-bit metadata (signal, version, original resolution) in bottom 4px

### Text Shuffle Algorithm

1. Seed → SHA-256 → PRNG seed
2. Per-byte XOR + bit rotation on UTF-8 bytes
3. Base64-encode and wrap as `AI!1(...)`