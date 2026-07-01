// content.js — auto-detect and decode obfuscated text, and inject page-worker for images
(() => {
  const TEXT_RE = /AI!1\(([^)]+)\)/g;
  let enabled = true;
  let key = '';
  let decodedCount = 0;
  const textCache = new WeakMap();

  // Load settings
  chrome.storage.sync.get({ enabled: true, key: '' }, cfg => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (enabled) {
      scanText();
      injectWorker();
    }
  });

  // Settings changes
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
    if (enabled) scanText();
    
    // Notify page-worker
    window.postMessage({
      source: 'goodbye-ai-block-content',
      payload: { type: 'az-settings', enabled, key }
    }, '*');
  });

  // Messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'manual-scan') {
      scanText();
      window.postMessage({
        source: 'goodbye-ai-block-content',
        payload: { type: 'az-scan' }
      }, '*');
      sendResponse({ count: decodedCount });
      return true;
    }
    if (msg.type === 'get-status') {
      sendResponse({ count: decodedCount, enabled });
      return true;
    }
  });

  // Inject script into Main World
  function injectScript(file) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = () => {
        s.remove();
        resolve();
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function injectWorker() {
    if (window.azWorkerInjected) return;
    window.azWorkerInjected = true;
    
    // Inject obfuscator first, then page-worker
    await injectScript('obfuscator.js');
    await injectScript('page-worker.js');
  }

  // Bridge messages from page-worker
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'goodbye-ai-block-page') return;
    
    const msg = e.data.payload;
    
    if (msg.type === 'az-ready') {
      // Worker ready, send initial settings
      window.postMessage({
        source: 'goodbye-ai-block-content',
        payload: { type: 'az-settings', enabled, key }
      }, '*');
    }
    
    else if (msg.type === 'az-decoded') {
      // Update badge count. page-worker sends its own decoded count, text scanning has its own.
      // We should probably just add them up or let page-worker manage its own and we manage ours.
      // Actually, badge doesn't care if we send it multiple times.
      decodedCount += 1;
      chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => {});
    }
    
    else if (msg.type === 'az-fetch-image') {
      // Proxy fetch request to background script to bypass CORS
      try {
        const res = await chrome.runtime.sendMessage({ type: 'fetch-image', url: msg.url });
        window.postMessage({
          source: 'goodbye-ai-block-content',
          payload: { type: 'az-fetch-result', id: msg.id, ...res }
        }, '*');
      } catch (err) {
        window.postMessage({
          source: 'goodbye-ai-block-content',
          payload: { type: 'az-fetch-result', id: msg.id, ok: false, error: err.message }
        }, '*');
      }
    }
  });

  // -- Text scanning (no Xray issues, keep in content script) --
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
        } catch (_) { /* skip failed matches */ }
      }
      if (changed) {
        node.nodeValue = updated;
        textCache.set(node, updated);
        chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount }).catch(() => {});
      }
    }
  }

  // Watch for text changes dynamically added
  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(scanText, 500);
  });
  obs.observe(document.body, {
    childList: true, subtree: true,
    characterData: true,
  });
})();
