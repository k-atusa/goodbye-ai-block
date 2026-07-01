// content.js — Auto-detect/decode text and inject page-worker for images
(() => {
  const TEXT_RE = /AI!1\(([^)]+)\)/g;
  let enabled = true;
  let key = '';
  let decodedCount = 0;
  const textCache = new WeakMap();

  // Load extension settings
  chrome.storage.sync.get({ enabled: true, key: '' }, cfg => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (enabled) {
      scanText();
      injectWorker();
    }
  });

  // Watch for setting changes
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
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
      chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => {});
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

  // Scan and deobfuscate text nodes
  async function scanText() {
    if (!enabled || typeof AZ === 'undefined') return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const tag = node.parentElement?.tagName?.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'textarea') return NodeFilter.FILTER_REJECT;
        return node.nodeValue.includes('AI!1(') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    let n; while (n = walker.nextNode()) nodes.push(n);

    for (const node of nodes) {
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
        } catch (_) {}
      }
      if (changed) {
        node.nodeValue = updated;
        textCache.set(node, updated);
        chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => {});
      }
    }
  }

  // Observe DOM for dynamic text changes
  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(scanText, 500);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
