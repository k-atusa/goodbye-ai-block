const toggle = document.getElementById('toggleEnabled');
const seedIn = document.getElementById('seedInput');
const btnSave = document.getElementById('btnSave');
const stats = document.getElementById('stats');

// load settings
chrome.storage.sync.get({ enabled: true, key: '' }, cfg => {
  toggle.checked = cfg.enabled;
  seedIn.value = cfg.key;
});

toggle.addEventListener('change', () => chrome.storage.sync.set({ enabled: toggle.checked }));

// save seed
btnSave.addEventListener('click', () => {
  chrome.storage.sync.set({ key: seedIn.value }, () => {
    btnSave.textContent = '✓';
    setTimeout(() => btnSave.textContent = 'Save', 800);
  });
});

// manual scan (Promise-based for cross-browser MV3)
btnScan.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'manual-scan' }).catch(() => null);
  stats.textContent = res ? `Decoded: ${res.count}` : 'No response';
});

// show current status (Promise-based for cross-browser MV3)
(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'get-status' }).catch(() => null);
  stats.textContent = res ? `Decoded: ${res.count}` : 'Waiting';
})();
