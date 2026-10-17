// content.js — Auto-detect/decode text, inject page-worker for images with direct fallback.
(() => {
  const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  const storage = ext.storage?.sync || ext.storage?.local;

  const TEXT_RE = /AI!1\(([^)]+)\)/g;
  const MSG_SRC = 'goodbye-ai-block-content';
  const ATTR = 'data-az-processed';
  let enabled = true, key = '', htmlReplace = true, convertInputs = false;
  let decodedCount = 0;
  let workerActive = false;
  const textCache = new WeakMap();

  // -- Messaging helpers --

  function post(payload) {
    window.postMessage({ source: MSG_SRC, payload }, '*');
  }

  function badge() {
    try {
      const p = ext.runtime.sendMessage({ type: 'update-badge', count: decodedCount });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  // -- Settings --

  if (storage) {
    storage.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
      enabled = cfg.enabled;
      key = cfg.key;
      if (cfg.htmlReplace !== undefined) htmlReplace = cfg.htmlReplace;
      if (cfg.convertInputs !== undefined) convertInputs = cfg.convertInputs;
      if (enabled) {
        scanText();
        injectWorker();
      }
    });

    ext.storage?.onChanged.addListener(changes => {
      if (changes.enabled) enabled = changes.enabled.newValue;
      if (changes.key) key = changes.key.newValue;
      if (changes.htmlReplace) htmlReplace = changes.htmlReplace.newValue;
      if (changes.convertInputs) convertInputs = changes.convertInputs.newValue;
      if (enabled) {
        scanText();
        if (!workerActive) scanImagesFallback();
      }
      post({ type: 'az-settings', enabled, key });
    });
  }

  // -- Popup message handler --

  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'manual-scan') {
      scanText();
      if (workerActive) {
        post({ type: 'az-scan' });
      } else {
        scanImagesFallback();
      }
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
      s.src = ext.runtime.getURL(file);
      s.onload = () => { s.remove(); resolve(true); };
      s.onerror = () => { s.remove(); resolve(false); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function injectWorker() {
    if (window.azWorkerInjected) return;
    window.azWorkerInjected = true;
    await injectScript('engine/obfuscator.js');
    await injectScript('engine/page-worker.js');

    // CSP 차단 등으로 page-worker가 동작하지 않는 환경 대비 fallback
    setTimeout(() => {
      if (!workerActive && enabled) {
        scanImagesFallback();
      }
    }, 400);
  }

  // -- Page-worker message handler --

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'goodbye-ai-block-page') return;
    const msg = e.data.payload;

    if (msg.type === 'az-ready') {
      workerActive = true;
      post({ type: 'az-settings', enabled, key });
    } else if (msg.type === 'az-decoded') {
      decodedCount += 1;
      badge();
    } else if (msg.type === 'az-fetch-image') {
      try {
        const res = await ext.runtime.sendMessage({ type: 'fetch-image', url: msg.url });
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

  // -- Fallback Image Processor (CSP 등으로 page-worker 주입이 막힌 경우 직접 디코딩) --

  async function processImageFallback(img) {
    if (img.hasAttribute(ATTR)) return;
    img.setAttribute(ATTR, 'checking');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 64 || h < 64) { img.setAttribute(ATTR, 'skip'); return; }

    try {
      let canvas = null;
      try {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.getImageData(0, 0, 1, 1);
        canvas = c;
      } catch (_) {
        const res = await ext.runtime.sendMessage({ type: 'fetch-image', url: img.src });
        if (res?.ok && res.dataUrl) {
          const i2 = new Image();
          await new Promise((ok, fail) => { i2.onload = ok; i2.onerror = fail; i2.src = res.dataUrl; });
          const c2 = document.createElement('canvas');
          c2.width = i2.naturalWidth || w; c2.height = i2.naturalHeight || h;
          c2.getContext('2d').drawImage(i2, 0, 0);
          canvas = c2;
        }
      }

      if (!canvas) { img.setAttribute(ATTR, 'skip'); return; }
      const sig = await AZ.detect(canvas);
      if (!sig) { img.setAttribute(ATTR, 'no-signal'); return; }

      const currentW = canvas.width || w;
      const targetWidth = (currentW > 0 && currentW !== sig.origW) ? currentW : undefined;
      let result = await AZ.deobfuscate(canvas, key, { targetWidth });

      if (currentW > 0 && result.width > currentW) {
        const targetH = Math.round((result.height * currentW) / result.width);
        const scaled = document.createElement('canvas');
        scaled.width = currentW; scaled.height = targetH;
        const sctx = scaled.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(result, 0, 0, currentW, targetH);
        result = scaled;
      }

      img.dataset.azOrigSrc = img.src;
      let src;
      try {
        const blob = await new Promise((ok, fail) => {
          if (!result.toBlob) return fail();
          result.toBlob(b => b ? ok(b) : fail(), 'image/png');
        });
        src = URL.createObjectURL(blob);
      } catch (_) {
        src = result.toDataURL('image/png');
      }
      img.dataset.azDecodedSrc = src;
      img.src = src;

      img.setAttribute(ATTR, 'decoded');
      decodedCount++;
      badge();
    } catch (_) {
      img.setAttribute(ATTR, 'error');
    }
  }

  async function scanImagesFallback() {
    if (!enabled || typeof AZ === 'undefined') return;
    const imgs = document.querySelectorAll(`img:not([${ATTR}])`);
    for (const img of imgs) {
      if (img.hasAttribute(ATTR)) continue;
      if (!img.complete || !img.naturalWidth) {
        img.addEventListener('load', () => processImageFallback(img), { once: true });
        continue;
      }
      processImageFallback(img);
    }
  }

  // -- DOM mutation observer --

  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      scanText();
      if (workerActive) {
        post({ type: 'az-scan' });
      } else {
        scanImagesFallback();
      }
    }, 250);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
