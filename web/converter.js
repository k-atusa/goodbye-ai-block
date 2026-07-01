(() => {
  // tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  const drop = document.getElementById('dropzone');
  const fileIn = document.getElementById('fileInput');
  const seedIn = document.getElementById('seedInput');
  const btnConvert = document.getElementById('btnConvert');
  const btnDlAll = document.getElementById('btnDlAll');
  const btnClear = document.getElementById('btnClear');
  const statusEl = document.getElementById('status');
  const grid = document.getElementById('grid');
  const items = [];
  const SUPPORTED = ['image/jpeg','image/png','image/webp'];

  function addFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const item = { file: f, name: f.name, type: f.type, src: null, result: null, status: 'loading', el: null };
      items.push(item); loadItem(item);
    }
    updateUI();
  }

  function loadItem(item) {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        item.src = c; item.status = 'ready';
        AZ.detect(c).then(sig => { item.signal = sig; render(item); });
        render(item); updateUI();
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(item.file); render(item);
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
  }

  function render(item) {
    if (!item.el) { item.el = document.createElement('div'); item.el.className = 'item'; grid.appendChild(item.el); }
    const dims = item.src ? `${item.src.width}×${item.src.height}` : '';
    const safeName = escapeHTML(item.name);
    const safeErr = escapeHTML(item.err || 'Error');
    
    let badge = '';
    if (item.status === 'loading') badge = '<span class="item-badge badge-wait">Loading</span>';
    else if (item.status === 'processing') badge = '<span class="item-badge badge-wait">Processing</span>';
    else if (item.status === 'done') badge = '<span class="item-badge badge-done">Done</span>';
    else if (item.status === 'error') badge = `<span class="item-badge badge-err">${safeErr}</span>`;
    else if (item.signal) badge = '<span class="item-badge badge-sig">Obfuscated</span>';
    
    item.el.innerHTML = `
      <div class="item-head"><span class="item-name" title="${safeName}">${safeName}</span><span class="item-meta">${dims}</span>${badge}</div>
      <div class="item-body"><div class="src"></div>${item.result?'<span class="arrow">→</span><div class="res"></div>':''}</div>
      ${item.status==='done'?'<div class="item-foot"><button class="btn-sec dl">Download</button></div>':''}`;
    if (item.src) { const t = thumb(item.src); item.el.querySelector('.src').appendChild(t); }
    if (item.result) { const t = thumb(item.result); item.el.querySelector('.res').appendChild(t); }
    const dl = item.el.querySelector('.dl'); if (dl) dl.onclick = () => downloadItem(item);
  }

  function thumb(cv) {
    const t = document.createElement('canvas');
    const s = Math.min(160/cv.width, 80/cv.height, 1);
    t.width = cv.width*s; t.height = cv.height*s;
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); return t;
  }

  function updateUI() {
    btnConvert.disabled = !items.some(i => i.status !== 'loading');
    btnDlAll.style.display = items.some(i => i.status === 'done') ? '' : 'none';
    btnClear.style.display = items.length ? '' : 'none';
  }

  function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = 'status'+(cls?' '+cls:''); }

  // auto-detect: signal found → decode, else encode
  async function convertAll() {
    btnConvert.disabled = true;
    const seed = seedIn.value;
    let ok = 0, fail = 0;
    const total = items.filter(i => i.status !== 'loading').length;
    for (const item of items) {
      if (item.status === 'loading') continue;
      item.status = 'processing'; item.result = null; render(item);
      setStatus(`${ok+fail+1}/${total}`,'');
      await new Promise(r => setTimeout(r, 10));
      try {
        item.result = item.signal ? await AZ.deobfuscate(item.src, seed) : await AZ.obfuscate(item.src, seed);
        item.status = 'done'; ok++;
      } catch (e) { item.status = 'error'; item.err = e.message; fail++; }
      render(item);
    }
    setStatus(fail ? `${ok} done, ${fail} failed` : `Done: ${ok}`, fail ? 'err' : 'ok');
    updateUI();
  }

  function getExt(t) { return {['image/jpeg']:'.jpg',['image/png']:'.png',['image/webp']:'.webp'}[t]||'.png'; }

  function downloadItem(item) {
    if (!item.result) return;
    const t = item.type === 'image/png' ? 'image/png' : 'image/webp';
    item.result.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = item.name.replace(/\.[^.]+$/,'') + (t === 'image/png' ? '.png' : '.webp');
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, t, t === 'image/webp' ? 1.0 : undefined);
  }

  async function downloadAll() {
    for (const item of items) { if (item.status==='done') { downloadItem(item); await new Promise(r=>setTimeout(r,300)); } }
  }

  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  fileIn.addEventListener('change', () => { if (fileIn.files.length) addFiles(fileIn.files); fileIn.value=''; });
  document.addEventListener('paste', e => {
    const fs=[]; for (const it of (e.clipboardData?.items||[])) if (it.type.startsWith('image/')) fs.push(it.getAsFile());
    if (fs.length) addFiles(fs);
  });
  btnConvert.addEventListener('click', convertAll);
  btnDlAll.addEventListener('click', downloadAll);
  btnClear.addEventListener('click', () => { items.length=0; grid.innerHTML=''; btnDlAll.style.display='none'; btnClear.style.display='none'; btnConvert.disabled=true; setStatus(''); });

  // -- text panel --
  const txtIn = document.getElementById('txtInput');
  const txtOut = document.getElementById('txtOutput');
  const txtSt = document.getElementById('txtStatus');
  function setTxtSt(m,c) { txtSt.textContent=m; txtSt.className='status'+(c?' '+c:''); }

  // auto-detect: AI!1(...) → decode, else encode
  document.getElementById('btnTxtConvert').addEventListener('click', async () => {
    const val = txtIn.value.trim();
    if (!val) { setTxtSt('No input','err'); return; }
    try {
      const seed = seedIn.value;
      if (/AI!1\(/.test(val)) { txtOut.value = await AZ.deobfuscateText(val, seed); setTxtSt('Decoded','ok'); }
      else { txtOut.value = await AZ.obfuscateText(val, seed); setTxtSt('Encoded','ok'); }
    } catch (e) { setTxtSt(e.message,'err'); }
  });
  document.getElementById('btnTxtCopy').addEventListener('click', () => { navigator.clipboard.writeText(txtOut.value||txtIn.value).catch(()=>{}); });
  document.getElementById('btnTxtClear').addEventListener('click', () => { txtIn.value=''; txtOut.value=''; setTxtSt(''); });

  // -- test panel --
  const log = document.getElementById('log');
  function addLog(msg) { log.textContent += msg + '\n'; }

  async function makeTestImage(text, c1, c2) {
    const c = document.createElement('canvas'); c.width = 200; c.height = 120;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 200, 120);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 120);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.arc(150, 40, 30, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(20, 70, 60, 30);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
    ctx.fillText(text, 20, 45);
    return c;
  }

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

  // Hook test runner into tab click
  document.querySelector('[data-tab="test-panel"]').addEventListener('click', runTests);

})();