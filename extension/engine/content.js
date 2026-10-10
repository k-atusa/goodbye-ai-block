// content.js — Auto-detect/decode text, inject page-worker for images.
(() => {
  const TEXT_RE = /AI!1\(([^)]+)\)/g;
  const MSG_SRC = 'goodbye-ai-block-content';
  let enabled = true, key = '', htmlReplace = true, convertInputs = false;
  let decodedCount = 0;
  const textCache = new WeakMap();

  // -- Messaging helpers --

  function post(payload) {
    window.postMessage({ source: MSG_SRC, payload }, '*');
  }

  function badge() {
    chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => {});
  }

  // -- Settings --

  // Load initial settings and bootstrap.
  chrome.storage.sync.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (cfg.htmlReplace !== undefined) htmlReplace = cfg.htmlReplace;
    if (cfg.convertInputs !== undefined) convertInputs = cfg.convertInputs;
    if (enabled) { scanText(); injectWorker(); }
  });

  // React to setting changes.
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
    if (changes.htmlReplace) htmlReplace = changes.htmlReplace.newValue;
    if (changes.convertInputs) convertInputs = changes.convertInputs.newValue;
    if (enabled) scanText();
    post({ type: 'az-settings', enabled, key });
  });

  // -- Popup message handler --

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'manual-scan') {
      scanText();
      post({ type: 'az-scan' });
      sendResponse({ count: decodedCount });
      return true;
    }
    if (msg.type === 'get-status') {
      sendResponse({ count: decodedCount, enabled });
      return true;
    }
  });

  // -- Script injection --

  function injectScript(file) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = () => { s.remove(); resolve(); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function injectWorker() {
    if (window.azWorkerInjected) return;
    window.azWorkerInjected = true;
    await injectScript('engine/obfuscator.js');
    await injectScript('engine/page-worker.js');
  }

  // -- Page-worker message handler --

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'goodbye-ai-block-page') return;
    const msg = e.data.payload;

    if (msg.type === 'az-ready') {
      post({ type: 'az-settings', enabled, key });
    } else if (msg.type === 'az-decoded') {
      decodedCount += 1;
      badge();
    } else if (msg.type === 'az-fetch-image') {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'fetch-image', url: msg.url });
        post({ type: 'az-fetch-result', id: msg.id, ...res });
      } catch (err) {
        post({ type: 'az-fetch-result', id: msg.id, ok: false, error: err.message });
      }
    }
  });

  // -- DOM helpers --

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'input') return true;
    return !!el.closest?.('textarea, input, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]');
  }

  function textToNodes(str) {
    const frag = document.createDocumentFragment();
    const lines = str.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) frag.appendChild(document.createElement('br'));
      const line = lines[i];
      if (!line) continue;
      const formatted = line
        .replace(/\t/g, '\u00a0\u00a0\u00a0\u00a0')
        .replace(/^[ ]+/g, m => '\u00a0'.repeat(m.length))
        .replace(/ {2}/g, '\u00a0 ');
      frag.appendChild(document.createTextNode(formatted));
    }
    return frag;
  }

  // -- Text scanner --

  async function scanText() {
    if (!enabled || typeof AZ === 'undefined') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const parent = node.parentElement;
        const tag = parent?.tagName?.toLowerCase();
        if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
        if (!convertInputs && isEditable(parent)) return NodeFilter.FILTER_REJECT;
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
        if (htmlReplace && !isEditable(parent) && parent) {
          const frag = textToNodes(updated);
          node.replaceWith ? node.replaceWith(frag) : parent.replaceChild(frag, node);
        } else {
          node.nodeValue = updated;
          textCache.set(node, updated);
        }
        badge();
      }
    }
  }

  // -- DOM mutation observer --

  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      scanText();
      post({ type: 'az-scan' });
    }, 250);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
