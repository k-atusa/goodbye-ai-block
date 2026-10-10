// background.js — Service worker: CORS proxy and badge updates.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'fetch-image') {
    fetchDataUrl(msg.url)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'update-badge') {
    const tabId = sender.tab?.id;
    if (tabId && chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: msg.count > 0 ? String(msg.count) : '', tabId });
      chrome.action.setBadgeBackgroundColor?.({ color: '#c084fc', tabId });
    }
  }
});

// Fetch URL → base64 data URL.
async function fetchDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || 'image/png';
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  return `data:${type};base64,${btoa(bin)}`;
}
