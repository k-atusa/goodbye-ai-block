// Core obfuscation engine using deterministic PRNG (Image Version: 3, Text Version: 1)

const AZ = (() => {

  // -- Constants --

  const MAGIC = [0x41, 0x49, 0x21]; // 'AI!'
  const HI = 200, LO = 40, TH = 120;
  const H_SIG = 20; // 신호 바 높이 (4px 검정 앵커 + 8px 상단 32비트 + 8px 하단 32비트)
  const B = 16;     // 16x16 고정 블록 크기
  const VER = 3;    // 이미지 난독화 버전 3
  const IS_LE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
  const INV_MASK = IS_LE ? 0x00FFFFFF : 0xFFFFFF00;

  // -- Helpers --

  function toCanvas(el) {
    if (el instanceof HTMLCanvasElement) return el;
    const c = document.createElement('canvas');
    const w = el.naturalWidth || el.width || 0;
    const h = el.naturalHeight || el.height || 0;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(el, 0, 0);
    return c;
  }

  // -- Hashing & PRNG --

  function sha256(data) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const len = data.length;
    const bitLen = len * 8;
    const padLen = ((len + 9 + 63) >> 6) << 6;
    const msg = new Uint8Array(padLen);
    msg.set(data);
    msg[len] = 0x80;
    const view = new DataView(msg.buffer);
    view.setUint32(padLen - 4, bitLen >>> 0);
    view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));

    const w = new Uint32Array(64);
    for (let i = 0; i < padLen; i += 64) {
      for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4);
      for (let j = 16; j < 64; j++) {
        const v1 = w[j - 15], v2 = w[j - 2];
        const s0 = ((v1 >>> 7) | (v1 << 25)) ^ ((v1 >>> 18) | (v1 << 14)) ^ (v1 >>> 3);
        const s1 = ((v2 >>> 17) | (v2 << 15)) ^ ((v2 >>> 19) | (v2 << 13)) ^ (v2 >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let j = 0; j < 64; j++) {
        const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ ((~e) & g);
        const t1 = (h + s1 + ch + K[j] + w[j]) | 0;
        const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (s0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    ov.setUint32(0, h0); ov.setUint32(4, h1);
    ov.setUint32(8, h2); ov.setUint32(12, h3);
    ov.setUint32(16, h4); ov.setUint32(20, h5);
    ov.setUint32(24, h6); ov.setUint32(28, h7);
    return out;
  }

  async function hash(str) {
    const data = new TextEncoder().encode(str);
    try {
      if (crypto?.subtle?.digest) return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    } catch (_) { }
    return sha256(data);
  }

  function prng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i += 4)
      s ^= ((seed[i] << 24) | (seed[i + 1] << 16) | (seed[i + 2] << 8) | seed[i + 3]);
    s = (s >>> 0) || 1;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -- Permutation --

  function shuffle(n, rng) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }

  function invert(p) {
    const inv = new Array(p.length);
    for (let i = 0; i < p.length; i++) inv[p[i]] = i;
    return inv;
  }

  // -- Pixel color transforms --

  function colorFwd(px, inv, ch) {
    if (inv) px ^= INV_MASK;
    if (ch === 1) {
      return IS_LE
        ? (px & 0xFF000000) | ((px >> 8) & 0x0000FFFF) | ((px << 16) & 0x00FF0000)
        : (px & 0x000000FF) | ((px << 8) & 0xFFFF0000) | ((px >> 16) & 0x0000FF00);
    } else if (ch === 2) {
      return IS_LE
        ? (px & 0xFF000000) | ((px << 8) & 0x00FFFF00) | ((px >> 16) & 0x000000FF)
        : (px & 0x000000FF) | ((px >> 8) & 0x00FFFF00) | ((px << 16) & 0xFF000000);
    }
    return px;
  }

  function colorRev(px, inv, ch) {
    let p = px;
    if (ch === 1) p = colorFwd(p, false, 2);
    else if (ch === 2) p = colorFwd(p, false, 1);
    if (inv) p ^= INV_MASK;
    return p;
  }

  // -- Signal I/O --

  function encDims(origW, origH) {
    const nw = Math.max(Math.ceil(origW / B) * B, 64);
    const nh = Math.ceil(origH / B) * B + H_SIG;
    return { nw, nh };
  }

  function writeSig(data, w, h, origW, origH) {
    const bytes = [
      MAGIC[0], MAGIC[1], MAGIC[2], VER,
      (origW >> 8) & 0xFF, origW & 0xFF,
      (origH >> 8) & 0xFF, origH & 0xFF,
    ];

    const bits = [];
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++)
        bits.push((bytes[i] >> (7 - j)) & 1);

    // 4px 검정 앵커 라인 (y: h - 20 ~ h - 16)
    for (let row = h - 20; row < h - 16; row++) {
      for (let col = 0; col < w; col++) {
        const i = (row * w + col) * 4;
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      }
    }

    function writeRowBits(rowStart, rowEnd, bitSlice) {
      for (let bi = 0; bi < 32; bi++) {
        const v = bitSlice[bi] ? HI : LO;
        const x1 = Math.floor((bi * w) / 32.0);
        const x2 = Math.floor(((bi + 1) * w) / 32.0);

        for (let row = rowStart; row < rowEnd; row++) {
          for (let col = x1; col < x2; col++) {
            const i = (row * w + col) * 4;
            data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
          }
        }
      }
    }

    writeRowBits(h - 16, h - 8, bits.slice(0, 32));  // Row A: Bit 0 ~ 31
    writeRowBits(h - 8, h, bits.slice(32, 64));      // Row B: Bit 32 ~ 63
  }

  function readSig(data, w, h) {
    if (w < 32 || h < 20) return null;

    let anchorY = -1;
    for (let y = h - 1; y >= 16; y--) {
      let rSum = 0, gSum = 0, bSum = 0;
      const sampleStep = Math.max(1, Math.floor(w / 64));
      let count = 0;
      for (let x = 0; x < w; x += sampleStep) {
        const idx = (y * w + x) * 4;
        rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
        count++;
      }
      const avgBrightness = (rSum + gSum + bSum) / (count * 3);

      if (avgBrightness < 20.0) {
        anchorY = y;
        break;
      }
    }

    const rowA_StartY = anchorY !== -1 ? anchorY + 1 : Math.floor(h - 16);
    const rowA_EndY = rowA_StartY + Math.max(2, Math.floor((h - rowA_StartY) / 2));
    const rowB_EndY = h;

    function readRowBits(yStart, yEnd) {
      const bitVals = new Float32Array(32);
      let minV = 255.0, maxV = 0.0;

      for (let bi = 0; bi < 32; bi++) {
        const sx = (bi * w) / 32.0;
        const ex = ((bi + 1) * w) / 32.0;
        const wCell = ex - sx;

        const cx1 = Math.floor(sx + wCell * 0.25);
        const cx2 = Math.max(cx1 + 1, Math.ceil(ex - wCell * 0.25));

        let cellSum = 0, cellCount = 0;
        for (let y = yStart; y < yEnd; y++) {
          for (let x = cx1; x < cx2; x++) {
            const idx = (y * w + x) * 4;
            cellSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3.0;
            cellCount++;
          }
        }

        const avg = cellCount > 0 ? cellSum / cellCount : 120.0;
        bitVals[bi] = avg;
        if (avg < minV) minV = avg;
        if (avg > maxV) maxV = avg;
      }

      const th = (maxV - minV) > 30 ? (minV + maxV) / 2.0 : 120.0;
      return Array.from(bitVals).map(v => (v > th ? 1 : 0));
    }

    const bitsA = readRowBits(rowA_StartY, rowA_EndY);
    const bitsB = readRowBits(rowA_EndY, rowB_EndY);
    const bits = bitsA.concat(bitsB);

    const bytes = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i * 8 + j];
      }
      bytes[i] = b;
    }

    if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) {
      return null;
    }

    const ver = bytes[3];
    const origW = (bytes[4] << 8) | bytes[5];
    const origH = (bytes[6] << 8) | bytes[7];

    return {
      ver: ver,
      origW: origW,
      origH: origH,
      B: B,
      bytes: bytes
    };
  }

  // -- Block transforms --

  function genXforms(n, rng) {
    const xf = [];
    for (let i = 0; i < n; i++)
      xf.push({ inv: rng() > 0.5, ch: (rng() * 3) | 0, sp: (rng() * 4) | 0, fl: rng() > 0.5 });
    return xf;
  }

  function blockFwd(src32, dst32, nw, ch, xf, perm) {
    const bw = nw / B, n = bw * (ch / B);
    for (let i = 0; i < n; i++) {
      const S = perm[i], D = i, t = xf[S];
      const sbx = S % bw, sby = (S / bw) | 0;
      const dbx = D % bw, dby = (D / bw) | 0;
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          let px = colorFwd(src32[(sby * B + y) * nw + sbx * B + x], t.inv, t.ch);
          let cx = x, cy = y;
          for (let r = 0; r < t.sp; r++) { let nx = B - 1 - cy; cy = cx; cx = nx; }
          if (t.fl) cx = B - 1 - cx;
          dst32[(dby * B + cy) * nw + dbx * B + cx] = px;
        }
    }
  }

  function blockRev(src32, dst32, nw, ch, xf, perm) {
    const inv = invert(perm);
    const bw = nw / B, n = bw * (ch / B);
    for (let j = 0; j < n; j++) {
      const S = inv[j], D = j, t = xf[j];
      const sbx = S % bw, sby = (S / bw) | 0;
      const dbx = D % bw, dby = (D / bw) | 0;
      const rot = (4 - t.sp) % 4;
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          let px = src32[(sby * B + y) * nw + sbx * B + x];
          let cx = x, cy = y;
          if (t.fl) cx = B - 1 - cx;
          for (let r = 0; r < rot; r++) { let nx = B - 1 - cy; cy = cx; cx = nx; }
          dst32[(dby * B + cy) * nw + dbx * B + cx] = colorRev(px, t.inv, t.ch);
        }
    }
  }

  // -- Image API --

  async function obfuscate(srcInput, key) {
    if (key == null) key = '';
    const srcCanvas = toCanvas(srcInput);
    const ow = srcCanvas.width, oh = srcCanvas.height;
    const { nw, nh } = encDims(ow, oh);
    const contentH = nh - H_SIG;

    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(srcCanvas, 0, 0);

    const d = ctx.getImageData(0, 0, nw, contentH).data;
    const rng = prng(await hash(key));
    const n = (nw / B) * (contentH / B);
    const xf = genXforms(n, rng);
    const perm = shuffle(n, rng);

    const rd = new Uint8ClampedArray(d.length);
    blockFwd(
      new Uint32Array(d.buffer, d.byteOffset, d.byteLength / 4),
      new Uint32Array(rd.buffer, rd.byteOffset, rd.byteLength / 4),
      nw, contentH, xf, perm
    );

    ctx.putImageData(new ImageData(rd, nw, contentH), 0, 0);
    const full = ctx.getImageData(0, 0, nw, nh);
    writeSig(full.data, nw, nh, ow, oh);
    ctx.putImageData(full, 0, 0);
    return c;
  }

  async function deobfuscate(input, key) {
    if (key == null) key = '';
    const srcCanvas = toCanvas(input);
    const curW = srcCanvas.width, curH = srcCanvas.height;
    if (curW === 0 || curH === 0) throw new Error('이미지 엘리먼트가 로드되지 않았거나 너비가 0입니다.');

    const ctx = srcCanvas.getContext('2d');

    // 1. 하단 메타데이터 감지
    const sig = readSig(ctx.getImageData(0, 0, curW, curH).data, curW, curH);
    if (!sig) throw new Error('유효한 난독화 시그널(AI!)을 찾을 수 없습니다.');

    const { nw, nh } = encDims(sig.origW, sig.origH);
    const contentH = nh - H_SIG;

    // 2. 리사이징 필요 여부 판단 (이미 난독화 규격 크기 그대로인 경우 불필요한 drawImage 및 임시 캔버스 생략)
    let workData;
    if (curW === nw && curH === nh) {
      workData = ctx.getImageData(0, 0, nw, contentH).data;
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = nw; tmp.height = nh;
      const tmpCtx = tmp.getContext('2d');
      tmpCtx.imageSmoothingEnabled = true;
      tmpCtx.drawImage(srcCanvas, 0, 0, nw, nh);
      workData = tmpCtx.getImageData(0, 0, nw, contentH).data;
    }

    const rng = prng(await hash(key));
    const bw = nw / B, bh = contentH / B;
    const n = bw * bh;
    const xf = genXforms(n, rng);
    const perm = shuffle(n, rng);

    const rd = new Uint8ClampedArray(workData.length);
    blockRev(
      new Uint32Array(workData.buffer, workData.byteOffset, workData.byteLength / 4),
      new Uint32Array(rd.buffer, rd.byteOffset, rd.byteLength / 4),
      nw, contentH, xf, perm
    );

    // 3. 원본 해상도 매핑 (이미 정수 패딩과 동일하면 캔버스 복사 생략)
    const workCanvas = document.createElement('canvas');
    workCanvas.width = nw;
    workCanvas.height = contentH;
    workCanvas.getContext('2d').putImageData(new ImageData(rd, nw, contentH), 0, 0);

    if (nw === sig.origW && contentH === sig.origH) {
      return workCanvas;
    }

    const out = document.createElement('canvas');
    out.width = sig.origW;
    out.height = sig.origH;
    out.getContext('2d').drawImage(workCanvas, 0, 0, sig.origW, sig.origH, 0, 0, sig.origW, sig.origH);

    return out;
  }

  async function detect(el) {
    const srcCanvas = toCanvas(el);
    const ctx = srcCanvas.getContext('2d');
    return readSig(ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height).data, srcCanvas.width, srcCanvas.height);
  }

  // -- Text API --

  // 텍스트 난독화 (버전 1)
  async function obfuscateText(text, key) {
    if (key == null) key = '';
    const rng = prng(await hash(key));
    const data = new TextEncoder().encode(text);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const xv = (rng() * 256) | 0, r = (rng() * 8) | 0;
      out[i] = ((data[i] ^ xv) << r | (data[i] ^ xv) >>> (8 - r)) & 0xFF;
    }
    let bin = '';
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    return `AI!1(${btoa(bin)})`;
  }

  // 텍스트 복원 (버전 1)
  async function deobfuscateText(str, key) {
    if (key == null) key = '';
    const match = str.match(/AI!1\(([^)]+)\)/);
    if (!match) throw new Error('No AI!1(...) signature found');
    const raw = atob(match[1].replace(/[^A-Za-z0-9+/=]/g, ''));
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const rng = prng(await hash(key));
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const xv = (rng() * 256) | 0, r = (rng() * 8) | 0;
      out[i] = (((data[i] >>> r) | (data[i] << (8 - r))) & 0xFF) ^ xv;
    }
    return new TextDecoder().decode(out);
  }

  // -- Public API --

  return { obfuscate, deobfuscate, detect, readSig, obfuscateText, deobfuscateText };
})();
