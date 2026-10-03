const toggle = document.getElementById('toggleEnabled');
const statusEnabled = document.getElementById('statusEnabled');
const toggleHtml = document.getElementById('toggleHtml');
const toggleInputs = document.getElementById('toggleInputs');
const seedIn = document.getElementById('seedInput');
const btnSave = document.getElementById('btnSave');
const stats = document.getElementById('stats');

// update enabled text and style
function updateEnabledText(val) {
  if (!statusEnabled) return;
  statusEnabled.textContent = val ? 'Enabled' : 'Disabled';
  statusEnabled.style.color = val ? '#4ade80' : '#888';
}

// load settings
if (chrome?.storage?.sync) {
  chrome.storage.sync.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
    toggle.checked = cfg.enabled;
    updateEnabledText(cfg.enabled);
    toggleHtml.checked = cfg.htmlReplace;
    toggleInputs.checked = cfg.convertInputs;
    seedIn.value = cfg.key;
  });
}

toggle.addEventListener('change', () => {
  chrome?.storage?.sync?.set({ enabled: toggle.checked });
  updateEnabledText(toggle.checked);
});
toggleHtml.addEventListener('change', () => chrome?.storage?.sync?.set({ htmlReplace: toggleHtml.checked }));
toggleInputs.addEventListener('change', () => chrome?.storage?.sync?.set({ convertInputs: toggleInputs.checked }));

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

// open converter tab
document.getElementById('btnOpen').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') });
});

// show current status (Promise-based for cross-browser MV3)
(async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'get-status' }).catch(() => null);
  stats.textContent = res ? `Decoded: ${res.count}` : 'Waiting';
})();
