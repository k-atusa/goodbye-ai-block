// content.js — 페이지 이미지 자동 감지 & 복호화
(() => {
  const MIN_SIZE = 64; // 최소 이미지 크기 (px)
  const ATTR = 'data-az-processed';
  let enabled = true;
  let key = '';
  let decodedCount = 0;

  // 설정 로드
  chrome.storage.sync.get({ enabled: true, key: '' }, (cfg) => {
    enabled = cfg.enabled;
    key = cfg.key;
    if (enabled) scan();
  });

  // 설정 변경 감지
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
    if (changes.key) key = changes.key.newValue;
    if (enabled) scan();
  });

  // 메시지 수신 (popup에서 수동 스캔 요청)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'manual-scan') {
      scan().then(() => sendResponse({ count: decodedCount }));
      return true;
    }
    if (msg.type === 'get-status') {
      sendResponse({ count: decodedCount, enabled });
      return true;
    }
  });

  // ---- 이미지 스캔 ----

  async function scan() {
    if (!enabled) return;
    const imgs = document.querySelectorAll(`img:not([${ATTR}])`);
    const promises = [];
    for (const img of imgs) {
      if (img.hasAttribute(ATTR)) continue;
      // 아직 로드 안 된 이미지는 load 이벤트 대기
      if (!img.complete || !img.naturalWidth) {
        img.addEventListener('load', () => processImage(img), { once: true });
        continue;
      }
      promises.push(processImage(img));
    }
    await Promise.allSettled(promises);
  }

  async function processImage(img) {
    if (img.hasAttribute(ATTR)) return;
    img.setAttribute(ATTR, 'checking');

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < MIN_SIZE || h < MIN_SIZE) {
      img.setAttribute(ATTR, 'skip');
      return;
    }

    try {
      // 이미지를 canvas에 로드
      const canvas = await loadImageToCanvas(img);
      if (!canvas) { img.setAttribute(ATTR, 'skip'); return; }

      // 시그널 감지
      const sig = await AZ.detect(canvas);
      if (!sig) { img.setAttribute(ATTR, 'no-signal'); return; }

      // 복호화
      const decoded = await AZ.deobfuscate(canvas, key);
      const blob = await canvasToBlob(decoded);
      const url = URL.createObjectURL(blob);

      // 원본 src 백업 & 교체
      img.dataset.azOrigSrc = img.src;
      img.src = url;
      img.setAttribute(ATTR, 'decoded');
      decodedCount++;

      // 배지 업데이트
      chrome.runtime.sendMessage({ type: 'update-badge', count: decodedCount });

    } catch (e) {
      img.setAttribute(ATTR, 'error');
    }
  }

  // ---- 이미지 로딩 (CORS 우회) ----

  function loadImageToCanvas(img) {
    return new Promise(async (resolve) => {
      // 1차 시도: 직접 canvas에 그리기
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        // tainted canvas 테스트
        ctx.getImageData(0, 0, 1, 1);
        resolve(c);
        return;
      } catch (_) {
        // CORS 에러 → background fetch 시도
      }

      // 2차 시도: crossOrigin='anonymous' 로 재로드
      try {
        const c = await loadWithCORS(img.src);
        if (c) { resolve(c); return; }
      } catch (_) {}

      // 3차 시도: background service worker로 fetch
      try {
        const c = await loadViaBackground(img.src);
        resolve(c);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function loadWithCORS(url) {
    return new Promise((resolve, reject) => {
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img2.naturalWidth; c.height = img2.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img2, 0, 0);
          ctx.getImageData(0, 0, 1, 1); // taint check
          resolve(c);
        } catch (e) { reject(e); }
      };
      img2.onerror = reject;
      img2.src = url;
    });
  }

  function loadViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'fetch-image', url }, (res) => {
        if (!res || !res.ok) { reject(new Error(res?.error || 'fetch failed')); return; }
        const img2 = new Image();
        img2.onload = () => {
          const c = document.createElement('canvas');
          c.width = img2.naturalWidth; c.height = img2.naturalHeight;
          c.getContext('2d').drawImage(img2, 0, 0);
          resolve(c);
        };
        img2.onerror = reject;
        img2.src = res.dataUrl;
      });
    });
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  // ---- MutationObserver: 동적 이미지 감지 ----

  let scanTimer = null;
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 500); // 500ms 디바운스
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
})();
