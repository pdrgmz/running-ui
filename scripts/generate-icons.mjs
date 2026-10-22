import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal CRC32 table for PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(len, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, pixelFn) {
  // Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width(4), height(4), bitDepth(1)=8, colorType(1)=6(RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw image data: height rows, each row = 1 filter byte (0) + width * 4 bytes RGBA
  const rawRowLen = 1 + width * 4;
  const rawData = Buffer.alloc(height * rawRowLen);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rawRowLen;
    rawData[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Icon art renderer
function renderIconPixel(x, y, w, h, maskable = false) {
  // Normalize coords to [-1, 1]
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const rDist = Math.sqrt(nx * nx + ny * ny);

  // Background color: #161A16 (Obsidian dark slate)
  const bgR = 0x16, bgG = 0x1a, bgB = 0x16, bgA = 255;

  // Outer squircle / rounded rect if not maskable
  if (!maskable) {
    // Distance from center with superellipse power 4
    const superDist = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4);
    if (superDist > 0.85) {
      if (superDist > 0.95) return [0, 0, 0, 0]; // Transparent outside
      // Anti-aliased border
      const t = (0.95 - superDist) / 0.1;
      return [0x16, 0x1a, 0x16, Math.round(t * 255)];
    }
  }

  // Neon green accent: #00E676
  const accentR = 0x00, accentG = 0xe6, accentB = 0x76;
  // White/cream: #E8EDDF
  const creamR = 0xe8, creamG = 0xed, creamB = 0xdf;

  // Scale factor inside the icon
  const scale = maskable ? 0.65 : 0.78;
  const px = nx / scale;
  const py = ny / scale;

  // Outer circular ring / pulse track
  const ringDist = Math.sqrt(px * px + py * py);
  if (ringDist >= 0.82 && ringDist <= 0.96) {
    // Gradient arc on the ring
    const angle = Math.atan2(py, px);
    const alphaFactor = Math.sin((angle + Math.PI) / 2);
    if (alphaFactor > 0.1) {
      return [accentR, accentG, accentB, Math.round(Math.min(1, alphaFactor * 1.5) * 255)];
    }
  }

  // Draw Runner glyph / GPS Pulse Wave:
  // Head: circle at (0.05, -0.45) radius 0.13
  const headDist = Math.sqrt((px - 0.08) ** 2 + (py + 0.42) ** 2);
  if (headDist < 0.13) {
    return [accentR, accentG, accentB, 255];
  }

  // Torso & legs / dynamic runner motion:
  // Forward leaning line from (0.08, -0.3) to (-0.05, 0.1)
  // Back leg: from (-0.05, 0.1) to (-0.45, 0.42)
  // Front leg: from (-0.05, 0.1) to (0.35, 0.46) with bend at (0.2, 0.22)
  // Front arm: (0.05, -0.15) to (0.38, -0.1)
  // Back arm: (0.05, -0.15) to (-0.28, -0.05)
  function distToSegment(x0, y0, x1, y1, x2, y2) {
    const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (l2 === 0) return Math.hypot(x0 - x1, y0 - y1);
    let t = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x0 - (x1 + t * (x2 - x1)), y0 - (y1 + t * (y2 - y1)));
  }

  const strokeW = 0.08;
  const segments = [
    // Torso
    [0.08, -0.30, -0.05, 0.08, strokeW * 1.1, creamR, creamG, creamB],
    // Back leg thigh
    [-0.05, 0.08, -0.32, 0.18, strokeW, creamR, creamG, creamB],
    // Back leg shin
    [-0.32, 0.18, -0.44, 0.44, strokeW * 0.9, creamR, creamG, creamB],
    // Front leg thigh
    [-0.05, 0.08, 0.22, 0.22, strokeW, accentR, accentG, accentB],
    // Front leg shin
    [0.22, 0.22, 0.38, 0.48, strokeW * 0.9, accentR, accentG, accentB],
    // Front arm
    [0.05, -0.18, 0.25, -0.12, strokeW * 0.85, creamR, creamG, creamB],
    [0.25, -0.12, 0.40, -0.28, strokeW * 0.8, creamR, creamG, creamB],
    // Back arm
    [0.05, -0.18, -0.18, -0.08, strokeW * 0.85, accentR, accentG, accentB],
    [-0.18, -0.08, -0.32, -0.25, strokeW * 0.8, accentR, accentG, accentB],
  ];

  for (const [x1, y1, x2, y2, wThick, cr, cg, cb] of segments) {
    const d = distToSegment(px, py, x1, y1, x2, y2);
    if (d < wThick) {
      const alpha = Math.min(1, (wThick - d) / (wThick * 0.25));
      return [cr, cg, cb, Math.round(alpha * 255)];
    }
  }

  // Telemetry Pulse Wave baseline at bottom:
  // from px = -0.7 to 0.7 at py = 0.62 with a pulse peak
  let pulseY = 0.62;
  if (px >= -0.15 && px <= 0.15) {
    pulseY = 0.62 - 0.16 * Math.cos(((px) / 0.15) * (Math.PI / 2));
  }
  const pulseDist = Math.abs(py - pulseY);
  if (px >= -0.65 && px <= 0.65 && pulseDist < 0.035) {
    const fade = Math.sin(((px + 0.65) / 1.3) * Math.PI);
    return [accentR, accentG, accentB, Math.round(fade * 200)];
  }

  return [bgR, bgG, bgB, bgA];
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

// Generate icons
const sizes = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const { file, size, maskable } of sizes) {
  const buf = createPng(size, size, (x, y, w, h) => renderIconPixel(x, y, w, h, maskable));
  fs.writeFileSync(path.join(outDir, file), buf);
  console.log(`Generated ${file} (${size}x${size}, ${buf.length} bytes)`);
}

// Also generate SVG version
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1A201A"/>
      <stop offset="100%" stop-color="#0E120E"/>
    </linearGradient>
    <linearGradient id="neonGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E676"/>
      <stop offset="100%" stop-color="#00B0FF"/>
    </linearGradient>
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Background rounded squircle -->
  <rect width="512" height="512" rx="128" fill="url(#bgGrad)"/>
  <rect width="506" height="506" x="3" y="3" rx="125" fill="none" stroke="#2D382D" stroke-width="3"/>

  <!-- Outer telemetry pulse ring -->
  <circle cx="256" cy="256" r="195" fill="none" stroke="#00E676" stroke-width="6" stroke-dasharray="14 10" opacity="0.35"/>
  <circle cx="256" cy="256" r="195" fill="none" stroke="url(#neonGrad)" stroke-width="8" stroke-dasharray="180 600" stroke-linecap="round" filter="url(#neonGlow)"/>

  <!-- Runner Figure -->
  <g transform="translate(18, -10)">
    <!-- Head -->
    <circle cx="270" cy="150" r="28" fill="#00E676" filter="url(#neonGlow)"/>

    <!-- Body & Limbs -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <!-- Torso -->
      <line x1="270" y1="180" x2="235" y2="280" stroke="#E8EDDF" stroke-width="26"/>

      <!-- Arms -->
      <polyline points="262,205 315,220 345,185" stroke="#E8EDDF" stroke-width="18"/>
      <polyline points="262,205 205,230 170,195" stroke="#00E676" stroke-width="18" filter="url(#neonGlow)"/>

      <!-- Legs -->
      <!-- Back leg (bent back) -->
      <polyline points="235,280 175,310 140,380" stroke="#E8EDDF" stroke-width="22"/>
      <!-- Front leg (driving forward) -->
      <polyline points="235,280 305,315 350,390" stroke="#00E676" stroke-width="22" filter="url(#neonGlow)"/>
    </g>
  </g>

  <!-- Telemetry ECG/GPS wave at bottom -->
  <path d="M 80 430 L 200 430 L 225 430 L 245 390 L 265 460 L 285 410 L 305 430 L 432 430"
        fill="none" stroke="#00E676" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" filter="url(#neonGlow)"/>
</svg>`;

fs.writeFileSync(path.join(outDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.resolve('public/favicon.svg'), svgContent);
console.log('Generated icon.svg and favicon.svg');
