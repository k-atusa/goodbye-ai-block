const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const storage = ext.storage?.sync || ext.storage?.local;

const toggle = document.getElementById('toggleEnabled');
const statusEnabled = document.getElementById('statusEnabled');
const toggleHtml = document.getElementById('toggleHtml');
const toggleInputs = document.getElementById('toggleInputs');
const seedIn = document.getElementById('seedInput');
const btnSave = document.getElementById('btnSave');
const btnScan = document.getElementById('btnScan');
const btnOpen = document.getElementById('btnOpen');
const stats = document.getElementById('stats');

// update enabled text and style
function updateEnabledText(val) {
  if (!statusEnabled) return;
  statusEnabled.textContent = val ? 'Enabled' : 'Disabled';
  statusEnabled.style.color = val ? '#4ade80' : '#888';
}

// load settings
if (storage) {
  storage.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
    toggle.checked = cfg.enabled;
    updateEnabledText(cfg.enabled);
    toggleHtml.checked = cfg.htmlReplace;
    toggleInputs.checked = cfg.convertInputs;
    seedIn.value = cfg.key;
  });
}

toggle.addEventListener('change', () => {
  storage?.set({ enabled: toggle.checked });
  updateEnabledText(toggle.checked);
});
toggleHtml.addEventListener('change', () => storage?.set({ htmlReplace: toggleHtml.checked }));
toggleInputs.addEventListener('change', () => storage?.set({ convertInputs: toggleInputs.checked }));

// save seed
btnSave.addEventListener('click', () => {
  storage?.set({ key: seedIn.value }, () => {
    btnSave.textContent = '✓';
    setTimeout(() => btnSave.textContent = 'Save', 800);
  });
});

// manual scan (Promise-based for cross-browser MV3)
if (btnScan) {
  btnScan.addEventListener('click', async () => {
    try {
      const tabs = await ext.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs[0]) return;
      const res = await ext.tabs.sendMessage(tabs[0].id, { type: 'manual-scan' });
      stats.textContent = res ? `Decoded: ${res.count}` : 'No response';
    } catch (_) {
      stats.textContent = 'No response';
    }
  });
}

// open converter tab
if (btnOpen) {
  btnOpen.addEventListener('click', () => {
    const seed = seedIn.value.trim();
    const url = seed ? ext.runtime.getURL(`converter.html?seed=${encodeURIComponent(seed)}`) : ext.runtime.getURL('converter.html');
    ext.tabs.create({ url });
  });
}

// show current status (Promise-based for cross-browser MV3)
(async () => {
  try {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs[0]) return;
    const res = await ext.tabs.sendMessage(tabs[0].id, { type: 'get-status' });
    stats.textContent = res ? `Decoded: ${res.count}` : 'Waiting';
  } catch (_) {
    stats.textContent = 'Waiting';
  }
})();
