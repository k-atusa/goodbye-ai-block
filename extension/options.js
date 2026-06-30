const enabledEl = document.getElementById('enabled');
const seedEl = document.getElementById('seed');
const statusEl = document.getElementById('status');

// load settings
chrome.storage.sync.get({ enabled: true, key: '' }, cfg => {
  enabledEl.checked = cfg.enabled;
  seedEl.value = cfg.key;
});

// save settings
document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({ enabled: enabledEl.checked, key: seedEl.value }, () => {
    statusEl.textContent = 'Saved.';
    setTimeout(() => statusEl.textContent = '', 2000);
  });
});
