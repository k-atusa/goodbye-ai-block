// Anti-Zaiming Core Engine (obfuscator.js)
// 시드 문자열 → SHA-256 해시 → PRNG → 블록 셔플 + 블록 변환으로 이미지 난독화
// JPEG 재압축에 강한 블록 단위 변환만 사용 (XOR 없음)

const AZ = (() => {
  const B = 8; // block size (JPEG DCT block 단위)
  const MAGIC = [0x41, 0x5A, 0x21]; // "AZ!"
  const VER = 1;
  const HI = 200, LO = 40, TH = 120; // signal encoding values & threshold

  // ---- Hashing & PRNG ----

  async function hash(str) {
    const data = new TextEncoder().encode(str);
    try {
      return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    } catch (_) {
      // fallback for non-secure contexts
      const r = new Uint8Array(32);
      for (let i = 0; i < data.length; i++) r[i % 32] = (r[i % 32] * 31 + data[i]) & 0xFF;
      for (let n = 0; n < 8; n++)
        for (let i = 0; i < 32; i++)
          r[i] = (r[i] ^ r[(i + 13) % 32] ^ ((r[(i + 7) % 32] << 3) & 0xFF)) & 0xFF;
      return r;
    }
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

  // ---- Permutation ----

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

  // ---- Block pixel I/O ----

  function getBlock(data, w, bx, by) {
    const px = new Uint8Array(B * B * 4);
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const si = ((by * B + y) * w + bx * B + x) * 4;
        const di = (y * B + x) * 4;
        px[di] = data[si]; px[di + 1] = data[si + 1];
        px[di + 2] = data[si + 2]; px[di + 3] = data[si + 3];
      }
    return px;
  }

  function putBlock(data, w, bx, by, px) {
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const di = ((by * B + y) * w + bx * B + x) * 4;
        const si = (y * B + x) * 4;
        data[di] = px[si]; data[di + 1] = px[si + 1];
        data[di + 2] = px[si + 2]; data[di + 3] = px[si + 3];
      }
  }

  // ---- Block transforms (JPEG-robust) ----

  function invertColors(px) {
    const out = new Uint8Array(px.length);
    for (let i = 0; i < px.length; i += 4) {
      out[i] = 255 - px[i]; out[i + 1] = 255 - px[i + 1];
      out[i + 2] = 255 - px[i + 2]; out[i + 3] = px[i + 3];
    }
    return out;
  }

  function rotateChannels(px, rot) {
    if (rot === 0) return px;
    const out = new Uint8Array(px.length);
    for (let i = 0; i < px.length; i += 4) {
      if (rot === 1) { out[i] = px[i + 1]; out[i + 1] = px[i + 2]; out[i + 2] = px[i]; }
      else { out[i] = px[i + 2]; out[i + 1] = px[i]; out[i + 2] = px[i + 1]; }
      out[i + 3] = px[i + 3];
    }
    return out;
  }

  function unrotateChannels(px, rot) {
    if (rot === 0) return px;
    return rotateChannels(px, rot === 1 ? 2 : 1);
  }

  function rotateSpatial(px, times) {
    times = ((times % 4) + 4) % 4;
    if (times === 0) return px;
    let cur = px;
    for (let t = 0; t < times; t++) {
      const out = new Uint8Array(cur.length);
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          const si = (y * B + x) * 4, di = (x * B + (B - 1 - y)) * 4;
          out[di] = cur[si]; out[di + 1] = cur[si + 1];
          out[di + 2] = cur[si + 2]; out[di + 3] = cur[si + 3];
        }
      cur = out;
    }
    return cur;
  }

  function flipH(px) {
    const out = new Uint8Array(px.length);
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const si = (y * B + x) * 4, di = (y * B + (B - 1 - x)) * 4;
        out[di] = px[si]; out[di + 1] = px[si + 1];
        out[di + 2] = px[si + 2]; out[di + 3] = px[si + 3];
      }
    return out;
  }

  function applyTransform(px, t) {
    let p = px;
    if (t.inv) p = invertColors(p);
    p = rotateChannels(p, t.ch);
    p = rotateSpatial(p, t.sp);
    if (t.fl) p = flipH(p);
    return p;
  }

  function reverseTransform(px, t) {
    let p = px;
    if (t.fl) p = flipH(p);
    p = rotateSpatial(p, (4 - t.sp) % 4);
    p = unrotateChannels(p, t.ch);
    if (t.inv) p = invertColors(p);
    return p;
  }

  // ---- Signal encoding (JPEG-resistant) ----
  // 각 바이트를 8x8 블록 한 개에 인코딩: 행마다 1비트, 8픽셀 균일 밝기

  function encodeSignalByte(data, w, bx, by, byte) {
    for (let row = 0; row < B; row++) {
      const v = ((byte >> (7 - row)) & 1) ? HI : LO;
      for (let col = 0; col < B; col++) {
        const i = ((by * B + row) * w + bx * B + col) * 4;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
  }

  function decodeSignalByte(data, w, bx, by) {
    let byte = 0;
    for (let row = 0; row < B; row++) {
      let sum = 0;
      for (let col = 0; col < B; col++) {
        const i = ((by * B + row) * w + bx * B + col) * 4;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      if (sum / B > TH) byte |= 1 << (7 - row);
    }
    return byte;
  }

  function embedSignal(data, w, h, origW, origH) {
    const by = (h / B) - 1;
    const bytes = [
      MAGIC[0], MAGIC[1], MAGIC[2], VER,
      (origW >> 8) & 0xFF, origW & 0xFF,
      (origH >> 8) & 0xFF, origH & 0xFF,
    ];
    for (let i = 0; i < bytes.length; i++) encodeSignalByte(data, w, i, by, bytes[i]);
  }

  function readSignal(data, w, h) {
    if (w < 64 || h < 16) return null;
    const by = Math.floor(h / B) - 1;
    if (decodeSignalByte(data, w, 0, by) !== MAGIC[0]) return null;
    if (decodeSignalByte(data, w, 1, by) !== MAGIC[1]) return null;
    if (decodeSignalByte(data, w, 2, by) !== MAGIC[2]) return null;
    return {
      ver: decodeSignalByte(data, w, 3, by),
      origW: (decodeSignalByte(data, w, 4, by) << 8) | decodeSignalByte(data, w, 5, by),
      origH: (decodeSignalByte(data, w, 6, by) << 8) | decodeSignalByte(data, w, 7, by),
    };
  }

  // ---- Main API ----

  async function obfuscate(srcCanvas, key) {
    if (key === undefined || key === null) key = '';
    const ow = srcCanvas.width, oh = srcCanvas.height;
    const nw = Math.ceil(ow / B) * B;
    const nh = Math.ceil(oh / B) * B + B; // +B for signal row

    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(srcCanvas, 0, 0);

    const ch = nh - B; // content height (without signal row)
    const id = ctx.getImageData(0, 0, nw, ch);
    const d = id.data;

    const seed = await hash(key);
    const rng = prng(seed);

    const bw = nw / B, bh = ch / B, n = bw * bh;

    // 1. Generate per-block transforms
    const xforms = [];
    for (let i = 0; i < n; i++) {
      xforms.push({
        inv: rng() > 0.5,
        ch: (rng() * 3) | 0,
        sp: (rng() * 4) | 0,
        fl: rng() > 0.5,
      });
    }

    // 2. Generate permutation
    const perm = shuffle(n, rng);

    // 3. Read blocks, apply transforms
    const blocks = [];
    for (let i = 0; i < n; i++) {
      const bx = i % bw, by = (i / bw) | 0;
      blocks.push(applyTransform(getBlock(d, nw, bx, by), xforms[i]));
    }

    // 4. Shuffle blocks into result
    const rd = new Uint8ClampedArray(d.length);
    for (let i = 0; i < n; i++) {
      const bx = i % bw, by = (i / bw) | 0;
      putBlock(rd, nw, bx, by, blocks[perm[i]]);
    }

    // 5. Write to canvas
    ctx.putImageData(new ImageData(rd, nw, ch), 0, 0);

    // 6. Embed signal
    const full = ctx.getImageData(0, 0, nw, nh);
    embedSignal(full.data, nw, nh, ow, oh);
    ctx.putImageData(full, 0, 0);

    return c;
  }

  async function deobfuscate(srcCanvas, key) {
    if (key === undefined || key === null) key = '';
    const w = srcCanvas.width, h = srcCanvas.height;
    const ctx = srcCanvas.getContext('2d');

    const full = ctx.getImageData(0, 0, w, h);
    const sig = readSignal(full.data, w, h);
    if (!sig) throw new Error('AZ 시그널 없음');

    const ch = h - B;
    const id = ctx.getImageData(0, 0, w, ch);
    const d = id.data;

    const seed = await hash(key);
    const rng = prng(seed);

    const bw = w / B, bh = ch / B, n = bw * bh;

    // Same PRNG sequence as obfuscation
    const xforms = [];
    for (let i = 0; i < n; i++) {
      xforms.push({
        inv: rng() > 0.5,
        ch: (rng() * 3) | 0,
        sp: (rng() * 4) | 0,
        fl: rng() > 0.5,
      });
    }
    const perm = shuffle(n, rng);
    const inv = invert(perm);

    // Read shuffled blocks
    const blocks = [];
    for (let i = 0; i < n; i++) {
      const bx = i % bw, by = (i / bw) | 0;
      blocks.push(getBlock(d, w, bx, by));
    }

    // Unshuffle + reverse transform
    const rd = new Uint8ClampedArray(d.length);
    for (let j = 0; j < n; j++) {
      const restored = reverseTransform(blocks[inv[j]], xforms[j]);
      const bx = j % bw, by = (j / bw) | 0;
      putBlock(rd, w, bx, by, restored);
    }

    // Crop to original size
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = ch;
    tmp.getContext('2d').putImageData(new ImageData(rd, w, ch), 0, 0);

    const out = document.createElement('canvas');
    out.width = sig.origW; out.height = sig.origH;
    out.getContext('2d').drawImage(tmp, 0, 0, sig.origW, sig.origH, 0, 0, sig.origW, sig.origH);

    return out;
  }

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
    return readSignal(c.getContext('2d').getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  }

  return { obfuscate, deobfuscate, detect, readSignal };
})();
