// Decode image from Main World (bypasses Xray Vision)
(() => {
  // ===== constants and common helpers =====
  const MIN_SIZE = 64;
  const ATTR = 'data-az-processed';
  const MSG_SRC = 'goodbye-ai-block-page';
  let enabled = true, key = '';
  let decodedCount = 0;
  const fetchCbs = new Map();
  let fetchId = 0;

  // post message inside window
  function post(payload) {
    window.postMessage({ source: MSG_SRC, payload }, '*');
  }

  // fetch via background proxy
  function bgFetch(url) {
    const id = ++fetchId;
    return new Promise(resolve => {
      fetchCbs.set(id, resolve);
      post({ type: 'az-fetch-image', id, url });
    });
  }

  // receive message from content script
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'goodbye-ai-block-content') return;
    const msg = e.data.payload;
    if (msg.type === 'az-settings') { // update settings
      enabled = msg.enabled;
      key = msg.key;
      if (enabled) scanImages();
    } else if (msg.type === 'az-scan') { // scan order
      scanImages();
    } else if (msg.type === 'az-fetch-result') { // fetch result
      const cb = fetchCbs.get(msg.id);
      if (cb) { cb(msg); fetchCbs.delete(msg.id); }
    }
  });

  // ===== image processing =====
  function tryDraw(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.getImageData(0, 0, 1, 1); // throws on tainted canvas
    return c;
  }

  // load image to canvas
  async function loadCanvas(img) {
    // try direct draw (1)
    try { return tryDraw(img); } catch (_) { }

    // try reload with crossOrigin (2)
    try {
      const i2 = await new Promise((ok, fail) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => ok(el);
        el.onerror = () => fail(new Error('Load error'));
        el.src = img.src;
      });
      return tryDraw(i2);
    } catch (_) { }

    // try background proxy fetch (3)
    try {
      const res = await bgFetch(img.src);
      if (!res?.ok) return null;
      const i3 = await new Promise((ok, fail) => {
        const el = new Image();
        el.onload = () => ok(el);
        el.onerror = fail;
        el.src = res.dataUrl;
      });
      return tryDraw(i3);
    } catch (_) {
      return null;
    }
  }

  // scan images
  async function scanImages() {
    if (!enabled || typeof AZ === 'undefined') return;
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

  // convert images
  async function processImage(img) {
    // check if valid image target
    if (img.hasAttribute(ATTR)) return;
    img.setAttribute(ATTR, 'checking');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < MIN_SIZE || h < MIN_SIZE) { img.setAttribute(ATTR, 'skip'); return; }

    try {
      // try to detect signal
      const canvas = await loadCanvas(img);
      if (!canvas) { img.setAttribute(ATTR, 'skip'); return; }
      const sig = await AZ.detect(canvas);
      if (!sig) { img.setAttribute(ATTR, 'no-signal'); return; }

      // get current image scale, deobscurate
      const currentW = canvas.width || w;
      const targetWidth = (currentW > 0 && currentW !== sig.origW) ? currentW : undefined;
      let result = await AZ.deobfuscate(canvas, key, { targetWidth });

      // resize original image to current size
      if (currentW > 0 && result.width > currentW) {
        const targetH = Math.round((result.height * currentW) / result.width);
        const scaled = document.createElement('canvas');
        scaled.width = currentW;
        scaled.height = targetH;
        const sctx = scaled.getContext('2d');
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(result, 0, 0, currentW, targetH);
        result = scaled;
      }

      // replace with blob URL or data URL
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
      post({ type: 'az-decoded', count: decodedCount });
    } catch (err) {
      console.error('[goodbye-ai-block] Decode failed:', err);
      img.setAttribute(ATTR, 'error');
    }
  }

  // ===== DOM mutation observe =====
  let timer = null;
  const obs = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
        const img = m.target;
        if (img.src && img.src !== img.dataset.azDecodedSrc) img.removeAttribute(ATTR);
      }
    }
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; scanImages(); }, 250);
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  post({ type: 'az-ready' });
})();
