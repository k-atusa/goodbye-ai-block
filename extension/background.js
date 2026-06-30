// background.js — service worker for CORS bypass and badge updates

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  // fetch cross-origin images and return as data URL
  if (msg.type === 'fetch-image') {
    fetchAsDataUrl(msg.url)
      .then(dataUrl => respond({ ok: true, dataUrl }))
      .catch(err => respond({ ok: false, error: err.message }));
    return true; // async response
  }

  // update toolbar badge with decoded count
  if (msg.type === 'update-badge') {
    const tabId = sender.tab?.id;
    if (tabId && chrome.action?.setBadgeText) {
      chrome.action.setBadgeText({ text: msg.count > 0 ? String(msg.count) : '', tabId });
      chrome.action.setBadgeBackgroundColor?.({ color: '#c084fc', tabId });
    }
  }
});

// fetch a URL and convert to base64 data URL
async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || 'image/png';
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  return `data:${type};base64,${btoa(bin)}`;
}
