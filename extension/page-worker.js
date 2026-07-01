// page-worker.js — Main World script to bypass Xray Vision blocks on Canvas API
(() => {
  const MIN_SIZE = 64;
  const ATTR = 'data-az-processed';
  let enabled = true;
  let key = '';
  let decodedCount = 0;

  const fetchCallbacks = new Map();
  let fetchIdCounter = 0;

  // Listen for messages from content script
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'goodbye-ai-block-content') return;
    
    const msg = e.data.payload;
    if (msg.type === 'az-settings') {
      enabled = msg.enabled;
      key = msg.key;
      if (enabled) scanImages();
    } else if (msg.type === 'az-scan') {
      scanImages();
    } else if (msg.type === 'az-fetch-result') {
      const cb = fetchCallbacks.get(msg.id);
      if (cb) { cb(msg); fetchCallbacks.delete(msg.id); }
    }
  });

  // Helper to send messages to content script
  function sendMessage(payload) {
    window.postMessage({ source: 'goodbye-ai-block-page', payload }, '*');
  }

  // Request cross-origin fetch via background script
  async function backgroundFetch(url) {
    const id = ++fetchIdCounter;
    return new Promise((resolve) => {
      fetchCallbacks.set(id, resolve);
      sendMessage({ type: 'az-fetch-image', id, url });
    });
  }

  // Find and process new images
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

  // Decode obfuscated image and replace source
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
      img.dataset.azOrigSrc = img.src;

      try {
        const blob = await new Promise((r, rej) => {
          try { result.toBlob(r, 'image/png'); } catch(e) { rej(e); }
        });
        if (!blob) throw new Error('toBlob returned null');
        const newSrc = URL.createObjectURL(blob);
        img.dataset.azDecodedSrc = newSrc;
        img.src = newSrc;
      } catch (blobErr) {
        console.warn('[goodbye-ai-block] URL.createObjectURL failed, falling back to data URL:', blobErr);
        const newSrc = result.toDataURL('image/png');
        img.dataset.azDecodedSrc = newSrc;
        img.src = newSrc;
      }

      img.setAttribute(ATTR, 'decoded');
      decodedCount++;
      sendMessage({ type: 'az-decoded', count: decodedCount });
    } catch (err) {
      console.error('[goodbye-ai-block] Image decoding failed:', err);
      img.setAttribute(ATTR, 'error');
    }
  }

  // Load image to canvas with fallback strategies
  async function loadImageToCanvas(img) {
    // 1. Direct draw
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.getImageData(0, 0, 1, 1);
      return c;
    } catch (err) {}

    // 2. Reload with crossOrigin
    try {
      return await new Promise((ok, fail) => {
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
        i2.onerror = (e) => fail(new Error('Image load error'));
        i2.src = img.src;
      });
    } catch (err) {}

    // 3. Fetch via background proxy
    try {
      const res = await backgroundFetch(img.src);
      if (!res?.ok) return null;
      
      const i3 = new Image();
      await new Promise((resolve, reject) => {
        i3.onload = resolve;
        i3.onerror = reject;
        i3.src = res.dataUrl;
      });
      
      const cv = document.createElement('canvas');
      cv.width = i3.naturalWidth; cv.height = i3.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(i3, 0, 0);
      ctx.getImageData(0, 0, 1, 1);
      return cv;
    } catch (err) {
      console.log('[goodbye-ai-block] Attempt 3 failed:', err.message);
      return null;
    }
  }

  // Observe DOM for dynamically added images
  let timer = null;
  const obs = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
        const img = m.target;
        if (img.src && img.src !== img.dataset.azDecodedSrc) {
          img.removeAttribute(ATTR);
        }
      }
    }
    clearTimeout(timer);
    timer = setTimeout(scanImages, 500);
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  sendMessage({ type: 'az-ready' });
})();
