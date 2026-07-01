// Composite a cut-out (transparent) character onto a flat chroma-green 9:16 canvas,
// so Veo image-to-video starts from a clean flat-green frame (no floor / shadow / letterbox).
// Usage: electron scripts/flatten-ref.js <cutout.png> <out.png> [targetW=780] [centerY=0.50] [bg=00B140]
const { app, nativeImage } = require('electron');
const fs = require('fs');

app.whenReady().then(() => {
  const inp = process.argv[2];
  const out = process.argv[3];
  const arg4 = process.argv[4] || '780';
  const orig = arg4 === 'orig';
  const centerY = Number(process.argv[5] || 0.50);
  const hex = (process.argv[6] || '00B140').replace('#', '');
  const GR = parseInt(hex.slice(0, 2), 16), GG = parseInt(hex.slice(2, 4), 16), GB = parseInt(hex.slice(4, 6), 16);

  let img = nativeImage.createFromPath(inp);
  const s0 = img.getSize();
  // 'orig' keeps the input dimensions & framing (just flatten the background); otherwise fit into 720x1280.
  const OW = orig ? s0.width : 720, OH = orig ? s0.height : 1280;
  const iw = orig ? s0.width : Number(arg4), ih = orig ? s0.height : Math.round(Number(arg4) * s0.height / s0.width);
  if (!orig) img = img.resize({ width: iw, height: ih });
  const bm = Buffer.from(img.toBitmap()); // BGRA

  const o = Buffer.alloc(OW * OH * 4);
  for (let p = 0; p < OW * OH; p++) { const i = p * 4; o[i] = GB; o[i + 1] = GG; o[i + 2] = GR; o[i + 3] = 255; }

  const offX = Math.round((OW - iw) / 2);
  const offY = Math.round(OH * centerY - ih / 2);
  for (let y = 0; y < ih; y++) {
    const oy = y + offY; if (oy < 0 || oy >= OH) continue;
    for (let x = 0; x < iw; x++) {
      const ox = x + offX; if (ox < 0 || ox >= OW) continue;
      const si = (y * iw + x) * 4, di = (oy * OW + ox) * 4;
      const a = bm[si + 3] / 255; if (a <= 0) continue;
      o[di] = Math.round(bm[si] * a + o[di] * (1 - a));
      o[di + 1] = Math.round(bm[si + 1] * a + o[di + 1] * (1 - a));
      o[di + 2] = Math.round(bm[si + 2] * a + o[di + 2] * (1 - a));
      o[di + 3] = 255;
    }
  }
  const outImg = nativeImage.createFromBuffer(Buffer.from(o), { width: OW, height: OH });
  fs.writeFileSync(out, outImg.toPNG());
  console.log('saved', out, iw + 'x' + ih, 'offset', offX, offY);
  app.quit();
});
