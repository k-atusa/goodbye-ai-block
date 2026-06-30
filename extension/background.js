// background.js — Service Worker
// Cross-origin 이미지를 fetch하여 content script에 base64로 전달

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'fetch-image') {
    fetchImageAsDataUrl(msg.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === 'update-badge') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const count = msg.count;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : '', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#e94560', tabId });
    }
  }
});

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}
