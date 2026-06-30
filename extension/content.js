// content.js — auto-detect and decode obfuscated images & text on page
(() => {
  const MIN_SIZE = 64;                    // minimum image dimension to process
  const ATTR = 'data-az-processed';       // attribute to mark processed elements
  const TEXT_RE = /AI!1\(([^)]+)\)/g;      // regex to find AI!1(...) text signatures
  let enabled = true;
  let key = '';
  let decoded = 0;
  const textCache = new WeakMap();        // tracks processed text nodes to avoid re-processing

  // load settings from storage
  chrome.storage.sync.get({ enabled: true, key: '' }, cfg => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (enabled) scan();
  });

  // react to settings changes
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
    if (enabled) scan();
  });

  // handle messages from popup
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === 'manual-scan') {
      scan().then(() => respond({ count: decoded }));
      return true;
    }
    if (msg.type === 'get-status') {
      respond({ count: decoded, enabled });
      return true;
    }
  });

  // -- Scan orchestration --

  async function scan() {
    if (!enabled) return;
    await Promise.allSettled([scanImages(), scanText()]);
  }

  // -- Image scanning --

  async function scanImages() {
    const imgs = document.querySelectorAll(`img:not([${ATTR}])`);
    const tasks = [];
    for (const img of imgs) {
      if (img.hasAttribute(ATTR)) continue;
      if (!img.complete || !img.naturalWidth) {
        img.addEventListener('load', () => processImage(img), { once: true });
        continue;
      }
      tasks.push(processImage(img));
    }
    await Promise.allSettled(tasks);
  }

  async function processImage(img) {
    if (img.hasAttribute(ATTR)) return;
    img.setAttribute(ATTR, 'checking');

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < MIN_SIZE || h < MIN_SIZE) { img.setAttribute(ATTR, 'skip'); return; }

    try {
      const canvas = await loadImageToCanvas(img);
      if (!canvas) { img.setAttribute(ATTR, 'skip'); return; }

      const sig = await AZ.detect(canvas);
      if (!sig) { img.setAttribute(ATTR, 'no-signal'); return; }

      const result = await AZ.deobfuscate(canvas, key);
      const blob = await new Promise(r => result.toBlob(r, 'image/png'));
      img.dataset.azOrigSrc = img.src;
      img.src = URL.createObjectURL(blob);
      img.setAttribute(ATTR, 'decoded');
      decoded++;
      chrome.runtime.sendMessage({ type: 'update-badge', count: decoded });
    } catch (_) {
      img.setAttribute(ATTR, 'error');
    }
  }

  // -- Text scanning --

  async function scanText() {
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
          decoded++;
        } catch (_) { /* skip failed matches */ }
      }
      if (changed) {
        node.nodeValue = updated;
        textCache.set(node, updated);
        chrome.runtime.sendMessage({ type: 'update-badge', count: decoded });
      }
    }
  }

  // -- Image loading with CORS fallbacks --

  function loadImageToCanvas(img) {
    return new Promise(async resolve => {
      // attempt 1: direct draw
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        ctx.getImageData(0, 0, 1, 1); // taint check
        resolve(c); return;
      } catch (_) {}

      // attempt 2: reload with crossOrigin
      try {
        const c = await new Promise((ok, fail) => {
          const i2 = new Image(); i2.crossOrigin = 'anonymous';
          i2.onload = () => {
            try {
              const cv = document.createElement('canvas');
              cv.width = i2.naturalWidth; cv.height = i2.naturalHeight;
              const ctx = cv.getContext('2d');
              ctx.drawImage(i2, 0, 0);
              ctx.getImageData(0, 0, 1, 1);
              ok(cv);
            } catch (e) { fail(e); }
          };
          i2.onerror = fail;
          i2.src = img.src;
        });
        resolve(c); return;
      } catch (_) {}

      // attempt 3: fetch via background service worker
      try {
        const c = await new Promise((ok, fail) => {
          chrome.runtime.sendMessage({ type: 'fetch-image', url: img.src }, res => {
            if (!res?.ok) { fail(); return; }
            const i2 = new Image();
            i2.onload = () => {
              const cv = document.createElement('canvas');
              cv.width = i2.naturalWidth; cv.height = i2.naturalHeight;
              cv.getContext('2d').drawImage(i2, 0, 0);
              ok(cv);
            };
            i2.onerror = fail;
            i2.src = res.dataUrl;
          });
        });
        resolve(c);
      } catch (_) { resolve(null); }
    });
  }

  // -- MutationObserver: watch for dynamically added content --

  let timer = null;
  const obs = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 500);
  });
  obs.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src'],
    characterData: true,
  });
})();
