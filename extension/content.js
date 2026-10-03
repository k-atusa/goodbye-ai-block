// content.js — Auto-detect/decode text and inject page-worker for images
(() => {
  const TEXT_RE = /AI!1\(([^)]+)\)/g;
  let enabled = true;
  let key = '';
  let htmlReplace = true;
  let convertInputs = false;
  let decodedCount = 0;
  const textCache = new WeakMap();

  // Load extension settings
  chrome.storage.sync.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (cfg.htmlReplace !== undefined) htmlReplace = cfg.htmlReplace;
    if (cfg.convertInputs !== undefined) convertInputs = cfg.convertInputs;
    if (enabled) {
      scanText();
      injectWorker();
    }
  });

  // Watch for setting changes
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
    if (changes.htmlReplace) htmlReplace = changes.htmlReplace.newValue;
    if (changes.convertInputs) convertInputs = changes.convertInputs.newValue;
    if (enabled) scanText();

    // Sync settings to page-worker
    window.postMessage({
      source: 'goodbye-ai-block-content',
      payload: { type: 'az-settings', enabled, key }
    }, '*');
  });

  // Handle popup messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'manual-scan') {
      scanText();
      window.postMessage({ source: 'goodbye-ai-block-content', payload: { type: 'az-scan' } }, '*');
      sendResponse({ count: decodedCount });
      return true;
    }
    if (msg.type === 'get-status') {
      sendResponse({ count: decodedCount, enabled });
      return true;
    }
  });

  // Helper to inject script to Main World
  function injectScript(file) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = () => { s.remove(); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  // Inject necessary worker scripts
  async function injectWorker() {
    if (window.azWorkerInjected) return;
    window.azWorkerInjected = true;
    await injectScript('obfuscator.js');
    await injectScript('page-worker.js');
  }

  // Handle messages from page-worker
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'goodbye-ai-block-page') return;

    const msg = e.data.payload;
    if (msg.type === 'az-ready') {
      // Send initial settings once ready
      window.postMessage({
        source: 'goodbye-ai-block-content',
        payload: { type: 'az-settings', enabled, key }
      }, '*');
    } else if (msg.type === 'az-decoded') {
      // Update toolbar badge
      decodedCount += 1;
      chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => { });
    } else if (msg.type === 'az-fetch-image') {
      // Bypass CORS via background script proxy
      try {
        const res = await chrome.runtime.sendMessage({ type: 'fetch-image', url: msg.url });
        window.postMessage({ source: 'goodbye-ai-block-content', payload: { type: 'az-fetch-result', id: msg.id, ...res } }, '*');
      } catch (err) {
        window.postMessage({ source: 'goodbye-ai-block-content', payload: { type: 'az-fetch-result', id: msg.id, ok: false, error: err.message } }, '*');
      }
    }
  });

  // Check if an element is an input or editable field
  function isInputElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return true;
    return !!el.closest?.('textarea, input, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]');
  }

  // Convert plain text to DOM nodes preserving line breaks and indentation
  function textToNodes(str) {
    const frag = document.createDocumentFragment();
    const lines = str.split(/\r\n|\r|\n/);

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) frag.appendChild(document.createElement('br'));

      const line = lines[i];
      if (!line) continue;

      // Preserve indentation and consecutive spaces using non-breaking spaces (\u00a0)
      const formatted = line
        .replace(/\t/g, '\u00a0\u00a0\u00a0\u00a0')
        .replace(/^[ ]+/g, m => '\u00a0'.repeat(m.length))
        .replace(/ {2}/g, '\u00a0 ');

      frag.appendChild(document.createTextNode(formatted));
    }
    return frag;
  }

  // Scan and deobfuscate text nodes
  async function scanText() {
    if (!enabled || typeof AZ === 'undefined') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const parent = node.parentElement;
        const tag = parent?.tagName?.toLowerCase();
        if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
        if (!convertInputs && isInputElement(parent)) return NodeFilter.FILTER_REJECT;
        return node.nodeValue.includes('AI!1(') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    let n; while (n = walker.nextNode()) nodes.push(n);

    for (const node of nodes) {
      if (!node.isConnected) continue;
      const val = node.nodeValue;
      if (textCache.get(node) === val) continue;
      textCache.set(node, val);

      TEXT_RE.lastIndex = 0;
      const matches = [...val.matchAll(TEXT_RE)];
      if (!matches.length) continue;

      let updated = val, changed = false;
      for (const m of matches) {
        try {
          updated = updated.replace(m[0], await AZ.deobfuscateText(m[0], key));
          changed = true;
          decodedCount++;
        } catch (_) { }
      }
      if (changed) {
        const parent = node.parentElement;
        const isInput = isInputElement(parent);
        if (htmlReplace && !isInput && parent) {
          const fragment = textToNodes(updated);
          if (node.replaceWith) {
            node.replaceWith(fragment);
          } else {
            parent.replaceChild(fragment, node);
          }
        } else {
          node.nodeValue = updated;
          textCache.set(node, updated);
        }
        chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => { });
      }
    }
  }

  // Observe DOM for dynamic text changes
  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled) return;
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      scanText();
      window.postMessage({ source: 'goodbye-ai-block-content', payload: { type: 'az-scan' } }, '*');
    }, 250);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
