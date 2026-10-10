// Core obfuscation engine using deterministic PRNG.

const AZ = (() => {

  // -- Constants --

  const MAGIC = [0x41, 0x49, 0x21];
  const HI = 200, LO = 40, TH = 120;
  const H_SIG = 4;
  const IS_LE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
  const INV_MASK = IS_LE ? 0x00FFFFFF : 0xFFFFFF00;

  // -- Hashing & PRNG --

  // Pure JS SHA-256 (RFC 6234).
  function sha256js(data) {
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
    const outView = new DataView(out.buffer);
    outView.setUint32(0, h0); outView.setUint32(4, h1);
    outView.setUint32(8, h2); outView.setUint32(12, h3);
    outView.setUint32(16, h4); outView.setUint32(20, h5);
    outView.setUint32(24, h6); outView.setUint32(28, h7);
    return out;
  }

  // SHA-256 with WebCrypto, pure JS fallback.
  async function hash(str) {
    const data = new TextEncoder().encode(str);
    try {
      if (crypto?.subtle?.digest) return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    } catch (_) { }
    return sha256js(data);
  }

  // Mulberry32 PRNG returning [0,1).
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

  // Fisher-Yates shuffle.
  function shuffle(n, rng) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    return p;
  }

  // Inverse permutation.
  function invert(p) {
    const inv = new Array(p.length);
    for (let i = 0; i < p.length; i++) inv[p[i]] = i;
    return inv;
  }

  // -- Pixel transforms (32-bit, endian-aware) --

  // Forward color channel rotation + optional inversion.
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

  // Reverse color channel rotation + optional inversion.
  function colorRev(px, inv, ch) {
    let p = px;
    if (ch === 1) p = colorFwd(p, false, 2);
    else if (ch === 2) p = colorFwd(p, false, 1);
    if (inv) p ^= INV_MASK;
    return p;
  }

  // -- Signal I/O --

  // Compute encoded canvas dimensions from original content size.
  function encDims(origW, origH, B) {
    const nw = Math.max(Math.ceil(origW / B) * B, 64);
    const nh = Math.ceil(origH / B) * B + H_SIG;
    return { nw, nh };
  }

  // Write 64-bit metadata signal to bottom rows.
  function writeSig(data, w, h, origW, origH, B, VER) {
    const bytes = [
      MAGIC[0], MAGIC[1], MAGIC[2], VER,
      (origW >> 8) & 0xFF, origW & 0xFF,
      (origH >> 8) & 0xFF, origH & 0xFF,
    ];

    const bits = [];
    for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
      const byte = bytes[byteIdx];
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        bits.push((byte >> (7 - bitIdx)) & 1);
      }
    }

    const step = Math.floor(w / 64);
    for (let bitIdx = 0; bitIdx < 64; bitIdx++) {
      const v = bits[bitIdx] ? HI : LO;
      const startX = bitIdx * step;
      const endX = startX + step;
      for (let row = h - H_SIG; row < h; row++) {
        for (let col = startX; col < endX; col++) {
          const i = (row * w + col) * 4;
          data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
        }
      }
    }
  }

  // Read 64-bit metadata signal from bottom rows.
  function readSig(data, w, h) {
    if (w < 64 || h < H_SIG) return null;
    const step = Math.floor(w / 64);
    const bits = [];
    for (let bitIdx = 0; bitIdx < 64; bitIdx++) {
      const startX = bitIdx * step;
      const endX = startX + step;
      let sum = 0;
      for (let row = h - H_SIG; row < h; row++) {
        for (let col = startX; col < endX; col++) {
          const i = (row * w + col) * 4;
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
      }
      const avg = sum / (step * H_SIG);
      bits.push(avg > TH ? 1 : 0);
    }

    const bytes = new Uint8Array(8);
    for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
      let byte = 0;
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        const bit = bits[byteIdx * 8 + bitIdx];
        byte = (byte << 1) | bit;
      }
      bytes[byteIdx] = byte;
    }

    if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) {
      return null;
    }

    const ver = bytes[3];
    const origW = (bytes[4] << 8) | bytes[5];
    const origH = (bytes[6] << 8) | bytes[7];
    const B = (ver === 2) ? 16 : 8;

    return { ver, origW, origH, B };
  }

  // -- Block transforms --

  // Generate per-block transform params from PRNG.
  function genXforms(n, rng) {
    const xforms = [];
    for (let i = 0; i < n; i++)
      xforms.push({ inv: rng() > 0.5, ch: (rng() * 3) | 0, sp: (rng() * 4) | 0, fl: rng() > 0.5 });
    return xforms;
  }

  // Forward block transform: shuffle + rotate/flip + color.
  function blockFwd(src32, dst32, nw, contentH, B, xforms, perm) {
    const bw = nw / B;
    const n = bw * (contentH / B);

    for (let i = 0; i < n; i++) {
      const S = perm[i], D = i;
      const t = xforms[S];
      const sbx = S % bw, sby = (S / bw) | 0;
      const dbx = D % bw, dby = (D / bw) | 0;

      for (let y = 0; y < B; y++) {
        for (let x = 0; x < B; x++) {
          const si = (sby * B + y) * nw + (sbx * B + x);
          let px = colorFwd(src32[si], t.inv, t.ch);

          let cx = x, cy = y;
          for (let r = 0; r < t.sp; r++) {
            let nx = B - 1 - cy;
            cy = cx; cx = nx;
          }
          if (t.fl) cx = B - 1 - cx;

          dst32[(dby * B + cy) * nw + (dbx * B + cx)] = px;
        }
      }
    }
  }

  // Inverse block transform: unshuffle + reverse rotate/flip + color.
  function blockRev(src32, dst32, nw, contentH, B, xforms, perm) {
    const inv = invert(perm);
    const bw = nw / B;
    const n = bw * (contentH / B);

    for (let j = 0; j < n; j++) {
      const S = inv[j], D = j;
      const t = xforms[j];
      const sbx = S % bw, sby = (S / bw) | 0;
      const dbx = D % bw, dby = (D / bw) | 0;
      const rot = (4 - t.sp) % 4;

      for (let y = 0; y < B; y++) {
        for (let x = 0; x < B; x++) {
          const si = (sby * B + y) * nw + (sbx * B + x);
          let px = src32[si];

          let cx = x, cy = y;
          if (t.fl) cx = B - 1 - cx;
          for (let r = 0; r < rot; r++) {
            let nx = B - 1 - cy;
            cy = cx; cx = nx;
          }

          dst32[(dby * B + cy) * nw + (dbx * B + cx)] = colorRev(px, t.inv, t.ch);
        }
      }
    }
  }

  // -- Image encode/decode --

  // Encode: block-scramble image and embed signal.
  async function obfuscate(srcCanvas, key) {
    if (key === undefined || key === null) key = '';
    const ow = srcCanvas.width, oh = srcCanvas.height;
    const B = (ow >= 1000 && oh >= 1000) ? 16 : 8;
    const VER = (B === 16) ? 2 : 1;
    const { nw, nh } = encDims(ow, oh, B);

    // Pad source to block-aligned canvas.
    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(srcCanvas, 0, 0);

    // Read content region.
    const contentH = nh - H_SIG;
    const d = ctx.getImageData(0, 0, nw, contentH).data;
    const seed = await hash(key);
    const rng = prng(seed);
    const bw = nw / B, n = bw * (contentH / B);

    // Generate transforms and permutation.
    const xforms = genXforms(n, rng);
    const perm = shuffle(n, rng);

    // Forward block transform.
    const rd = new Uint8ClampedArray(d.length);
    const src32 = new Uint32Array(d.buffer, d.byteOffset, d.byteLength / 4);
    const dst32 = new Uint32Array(rd.buffer, rd.byteOffset, rd.byteLength / 4);
    blockFwd(src32, dst32, nw, contentH, B, xforms, perm);

    // Write result and embed signal.
    ctx.putImageData(new ImageData(rd, nw, contentH), 0, 0);
    const full = ctx.getImageData(0, 0, nw, nh);
    writeSig(full.data, nw, nh, ow, oh, B, VER);
    ctx.putImageData(full, 0, 0);
    return c;
  }

  // Decode: detect resize, restore dimensions, inverse block transform.
  async function deobfuscate(srcCanvas, key) {
    if (key === undefined || key === null) key = '';
    const curW = srcCanvas.width, curH = srcCanvas.height;
    const ctx = srcCanvas.getContext('2d');

    // Read signal from current (possibly resized) image.
    const full = ctx.getImageData(0, 0, curW, curH);
    const sig = readSig(full.data, curW, curH);
    if (!sig) throw new Error('No signal found');

    const B = sig.B;
    const { nw, nh } = encDims(sig.origW, sig.origH, B);
    const contentH = nh - H_SIG;

    // Detect resize and restore to encoded dimensions if needed.
    const resized = (curW !== nw || curH !== nh);
    let workData;
    if (resized) {
      const tmp = document.createElement('canvas');
      tmp.width = nw; tmp.height = nh;
      tmp.getContext('2d').drawImage(srcCanvas, 0, 0, nw, nh);
      workData = tmp.getContext('2d').getImageData(0, 0, nw, contentH).data;
    } else {
      workData = ctx.getImageData(0, 0, nw, contentH).data;
    }

    // Replay PRNG at original encoded dimensions.
    const seed = await hash(key);
    const rng = prng(seed);
    const bw = nw / B, n = bw * (contentH / B);
    const xforms = genXforms(n, rng);
    const perm = shuffle(n, rng);

    // Inverse block transform.
    const rd = new Uint8ClampedArray(workData.length);
    const src32 = new Uint32Array(workData.buffer, workData.byteOffset, workData.byteLength / 4);
    const dst32 = new Uint32Array(rd.buffer, rd.byteOffset, rd.byteLength / 4);
    blockRev(src32, dst32, nw, contentH, B, xforms, perm);

    // Crop to original content size.
    const tmp = document.createElement('canvas');
    tmp.width = nw; tmp.height = contentH;
    tmp.getContext('2d').putImageData(new ImageData(rd, nw, contentH), 0, 0);

    const out = document.createElement('canvas');
    out.width = sig.origW; out.height = sig.origH;
    out.getContext('2d').drawImage(tmp, 0, 0, sig.origW, sig.origH, 0, 0, sig.origW, sig.origH);
    return out;
  }

  // Detect signal in any image or canvas element.
  async function detect(imgOrCanvas) {
    const c = document.createElement('canvas');
    if (imgOrCanvas instanceof HTMLCanvasElement) {
      c.width = imgOrCanvas.width; c.height = imgOrCanvas.height;
      c.getContext('2d').drawImage(imgOrCanvas, 0, 0);
    } else {
      c.width = imgOrCanvas.naturalWidth || imgOrCanvas.width;
      c.height = imgOrCanvas.naturalHeight || imgOrCanvas.height;
      c.getContext('2d').drawImage(imgOrCanvas, 0, 0);
    }
    return readSig(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  }

  // -- Text encode/decode --

  // Bytes → base64.
  function toB64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // Base64 → bytes.
  function fromB64(b64) {
    const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Encode text with XOR + bitwise rotation.
  async function obfuscateText(text, key) {
    if (key === undefined || key === null) key = '';
    const seed = await hash(key);
    const rng = prng(seed);
    const data = new TextEncoder().encode(text);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const xv = (rng() * 256) | 0;
      const r = (rng() * 8) | 0;
      let b = data[i] ^ xv;
      b = ((b << r) | (b >>> (8 - r))) & 0xFF;
      out[i] = b;
    }
    return `AI!1(${toB64(out)})`;
  }

  // Decode text with reverse bitwise rotation + XOR.
  async function deobfuscateText(str, key) {
    if (key === undefined || key === null) key = '';
    const match = str.match(/AI!1\(([^)]+)\)/);
    if (!match) throw new Error('No AI!1(...) signature found');
    const data = fromB64(match[1]);
    const seed = await hash(key);
    const rng = prng(seed);
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const xv = (rng() * 256) | 0;
      const r = (rng() * 8) | 0;
      let b = data[i];
      b = ((b >>> r) | (b << (8 - r))) & 0xFF;
      b = b ^ xv;
      out[i] = b;
    }
    return new TextDecoder().decode(out);
  }

  // -- Public API --

  return { obfuscate, deobfuscate, detect, readSignal: readSig, obfuscateText, deobfuscateText };
})();
