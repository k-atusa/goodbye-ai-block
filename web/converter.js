// convert and test page
(() => {
  // tab switch
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab)?.classList.add('active');
    });
  });

  // constants
  const drop = document.getElementById('dropzone');
  const fileIn = document.getElementById('fileInput');
  const seedIn = document.getElementById('seedInput');
  const btnConvert = document.getElementById('btnConvert');
  const btnDlAll = document.getElementById('btnDlAll');
  const btnClear = document.getElementById('btnClear');
  const statusEl = document.getElementById('status');
  const grid = document.getElementById('grid');
  const items = [];
  
  // load seed and browser type
  const urlSeed = new URLSearchParams(window.location.search).get('seed');
  if (urlSeed) seedIn.value = urlSeed;
  const ext = (typeof browser !== 'undefined' && browser.runtime) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const storage = ext?.storage?.sync || ext?.storage?.local;

  // load seed from localStorage
  if (storage) {
    storage.get({ key: '' }, cfg => {
      if (cfg.key && !seedIn.value) seedIn.value = cfg.key;
    });
    ext?.storage?.onChanged?.addListener(changes => {
      if (changes.key?.newValue !== undefined) seedIn.value = changes.key.newValue;
    });
    seedIn.addEventListener('change', () => {
      storage.set({ key: seedIn.value });
    });
  } else {
    try {
      const saved = localStorage.getItem('goodbye_ai_seed');
      if (saved && !seedIn.value) seedIn.value = saved;
      seedIn.addEventListener('input', () => localStorage.setItem('goodbye_ai_seed', seedIn.value));
    } catch (_) { }
  }

  // generate thumbnail
  function thumb(cv) {
    const t = document.createElement('canvas');
    const s = Math.min(160 / cv.width, 80 / cv.height, 1);
    t.width = cv.width * s; t.height = cv.height * s;
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    return t;
  }

  // status update
  function updateUI() {
    btnConvert.disabled = !items.some(i => i.status !== 'loading' && i.status !== 'processing');
    btnDlAll.style.display = items.some(i => i.status === 'done') ? '' : 'none';
    btnClear.style.display = items.length ? '' : 'none';
  }

  // status notification
  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  // download image
  function downloadItem(item) {
    if (!item.result) return;
    const t = item.type === 'image/png' ? 'image/png' : 'image/webp';
    item.result.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = item.name.replace(/\.[^.]+$/, '') + (t === 'image/png' ? '.png' : '.webp');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, t, t === 'image/webp' ? 1.0 : undefined);
  }

  // download all images
  async function downloadAll() {
    for (const item of items) {
      if (item.status === 'done') {
        downloadItem(item);
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  // ===== Image panel =====
  function addFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const item = { file: f, name: f.name, type: f.type, src: null, result: null, status: 'loading', el: null };
      items.push(item);
      loadItem(item);
    }
    updateUI();
  }

  // load thumbnails
  async function loadItem(item) {
    try {
      let bmp;
      if (typeof createImageBitmap === 'function') {
        bmp = await createImageBitmap(item.file);
      } else {
        bmp = await new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = URL.createObjectURL(item.file);
        });
      }
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close?.();
      item.src = c;
      item.status = 'ready';
      item.signal = await AZ.detect(c);
    } catch (e) {
      item.status = 'error';
      item.err = e.message;
    }
    render(item);
    updateUI();
  }

  // render original and converted image
  function render(item) {
    if (!item.el) {
      item.el = document.createElement('div');
      item.el.className = 'item';
      item.el.innerHTML = '<div class="item-head"><span class="item-name"></span><span class="item-meta"></span><span class="item-badge"></span></div><div class="item-body"><div class="src"></div><span class="arrow" style="display:none">→</span><div class="res"></div></div><div class="item-foot" style="display:none"><button class="btn-sec dl">Download</button></div>';
      grid.appendChild(item.el);
    }

    // set name and size
    const nameEl = item.el.querySelector('.item-name');
    nameEl.textContent = item.name;
    nameEl.title = item.name;
    const metaEl = item.el.querySelector('.item-meta');
    metaEl.textContent = item.src ? `${item.src.width}×${item.src.height}` : '';

    // converting status
    const badgeClass = {
      loading: 'badge-wait', processing: 'badge-wait',
      done: 'badge-done', error: 'badge-err'
    }[item.status] || (item.signal ? 'badge-sig' : '');
    const badgeText = {
      loading: 'Loading', processing: 'Processing',
      done: 'Done', error: item.err || 'Error'
    }[item.status] || (item.signal ? 'Obfuscated' : '');

    const badgeEl = item.el.querySelector('.item-badge');
    badgeEl.textContent = badgeText;
    badgeEl.className = 'item-badge' + (badgeClass ? ' ' + badgeClass : '');
    badgeEl.style.display = badgeText ? '' : 'none';

    // draw thumbnails
    const srcDiv = item.el.querySelector('.src');
    if (srcDiv.children.length === 0 && item.src) {
      srcDiv.appendChild(thumb(item.src));
    }

    const arrowEl = item.el.querySelector('.arrow');
    arrowEl.style.display = item.result ? '' : 'none';

    const resDiv = item.el.querySelector('.res');
    resDiv.style.display = item.result ? '' : 'none';
    resDiv.textContent = '';
    if (item.result) resDiv.appendChild(thumb(item.result));

    const footEl = item.el.querySelector('.item-foot');
    footEl.style.display = item.status === 'done' ? '' : 'none';
    const dl = item.el.querySelector('.dl');
    if (dl) dl.onclick = () => downloadItem(item);
  }

  // convert all images
  async function convertAll() {
    // base status
    btnConvert.disabled = true;
    const seed = seedIn.value;
    const queue = items.filter(i => i.status !== 'loading');
    const total = queue.length;
    if (!total) { updateUI(); return; }

    let ok = 0, fail = 0;
    setStatus(`0/${total}`, '');

    const concurrency = Math.min(4, Math.max(2, navigator.hardwareConcurrency || 2));
    let cursor = 0;

    // convert job
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        item.status = 'processing';
        item.result = null;
        render(item);

        try { // obscurate or deobfuscate
          item.result = item.signal
            ? await AZ.deobfuscate(item.src, seed)
            : await AZ.obfuscate(item.src, seed);
          item.status = 'done';
          ok++;
        } catch (e) {
          item.status = 'error';
          item.err = e.message;
          fail++;
        }
        render(item);
        setStatus(`${ok + fail}/${total}`, '');
      }
    }

    // convert all files
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
    setStatus(fail ? `${ok} done, ${fail} failed` : `Done: ${ok}`, fail ? 'err' : 'ok');
    updateUI();
  }

  // button listeners
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  fileIn.addEventListener('change', () => { if (fileIn.files.length) addFiles(fileIn.files); fileIn.value = ''; });
  document.addEventListener('paste', e => {
    const fs = [];
    for (const it of (e.clipboardData?.items || [])) if (it.type.startsWith('image/')) fs.push(it.getAsFile());
    if (fs.length) addFiles(fs);
  });
  btnConvert.addEventListener('click', convertAll);
  btnDlAll.addEventListener('click', downloadAll);
  btnClear.addEventListener('click', () => {
    items.length = 0;
    grid.textContent = '';
    btnDlAll.style.display = 'none';
    btnClear.style.display = 'none';
    btnConvert.disabled = true;
    setStatus('');
  });

  // ===== Text panel =====
  const txtIn = document.getElementById('txtInput');
  const txtOut = document.getElementById('txtOutput');
  const txtSt = document.getElementById('txtStatus');
  function setTxtSt(m, c) { txtSt.textContent = m; txtSt.className = 'status' + (c ? ' ' + c : ''); }

  document.getElementById('btnTxtConvert').addEventListener('click', async () => {
    const val = txtIn.value.trim();
    if (!val) { setTxtSt('No input', 'err'); return; }
    try {
      const seed = seedIn.value;
      if (/AI!1\(/.test(val)) { txtOut.value = await AZ.deobfuscateText(val, seed); setTxtSt('Decoded', 'ok'); }
      else { txtOut.value = await AZ.obfuscateText(val, seed); setTxtSt('Encoded', 'ok'); }
    } catch (e) { setTxtSt(e.message, 'err'); }
  });
  document.getElementById('btnTxtCopy').addEventListener('click', () => { navigator.clipboard.writeText(txtOut.value || txtIn.value).catch(() => { }); });
  document.getElementById('btnTxtClear').addEventListener('click', () => { txtIn.value = ''; txtOut.value = ''; setTxtSt(''); });

  // ===== Test panel =====
  const log = document.getElementById('log');
  function addLog(msg) { log.textContent += msg + '\n'; }

  async function makeTestImage(text, c1, c2) {
    const c = document.createElement('canvas'); c.width = 200; c.height = 120;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 200, 120);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 120);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.arc(150, 40, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(20, 70, 60, 30);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(text, 20, 45);
    return c;
  }

  // run test
  let testsRun = false;
  async function runTests() {
    if (testsRun) return;
    testsRun = true;
    try {
      const s1 = await makeTestImage('Test A', '#c084fc', '#1a1a2e');
      document.getElementById('orig1').src = s1.toDataURL();
      document.getElementById('obf1').src = (await AZ.obfuscate(s1, '')).toDataURL();
      addLog('✓ Image test 1 (default seed)');

      const s2 = await makeTestImage('Test B', '#f472b6', '#111');
      document.getElementById('orig2').src = s2.toDataURL();
      document.getElementById('obf2').src = (await AZ.obfuscate(s2, 'hello')).toDataURL();
      addLog('✓ Image test 2 (seed: hello)');

      document.getElementById('obfText1').textContent = await AZ.obfuscateText('This is a test message with default seed.', '');
      addLog('✓ Text test 1 (default seed)');

      document.getElementById('obfText2').textContent = await AZ.obfuscateText("This is a secret message with seed 'hello'.", 'hello');
      addLog('✓ Text test 2 (seed: hello)');

      addLog('\nDone. Extension should auto-decode the obfuscated items above.');
    } catch (e) { addLog('✗ Error: ' + e.message); }
  }

  document.querySelector('[data-tab="test-panel"]').addEventListener('click', runTests);
})();