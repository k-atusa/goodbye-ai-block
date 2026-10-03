const enabledEl = document.getElementById('enabled');
const htmlReplaceEl = document.getElementById('htmlReplace');
const convertInputsEl = document.getElementById('convertInputs');
const seedEl = document.getElementById('seed');
const statusEl = document.getElementById('status');

// load settings
chrome.storage.sync.get({ enabled: true, key: '', htmlReplace: true, convertInputs: false }, cfg => {
  enabledEl.checked = cfg.enabled;
  htmlReplaceEl.checked = cfg.htmlReplace;
  convertInputsEl.checked = cfg.convertInputs;
  seedEl.value = cfg.key;
});

// save settings
document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({
    enabled: enabledEl.checked,
    htmlReplace: htmlReplaceEl.checked,
    convertInputs: convertInputsEl.checked,
    key: seedEl.value
  }, () => {
    statusEl.textContent = 'Saved.';
    setTimeout(() => statusEl.textContent = '', 2000);
  });
});
