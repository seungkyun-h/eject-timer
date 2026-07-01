// Flatten ANY greenish pixel (background + floor + contact shadow gradient) to a single flat
// chroma green, leaving the character. Global chroma replace — unlike flood-fill it isn't fooled
// by smooth green gradients. Separates via GREEN DOMINANCE g-max(r,b): real green ~+40..+70,
// cream/orange fur ~<=+12. Usage: electron scripts/green-flatten.js <in> <out.png> [T=26] [hex=00B140]
const { app, nativeImage } = require('electron');
const fs = require('fs');

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

app.whenReady().then(() => {
  const inp = process.argv[2], out = process.argv[3];
  const T = Number(process.argv[4] || 26);
  const hex = (process.argv[5] || '00B140').replace('#', '');
  const GR = parseInt(hex.slice(0, 2), 16), GG = parseInt(hex.slice(2, 4), 16), GB = parseInt(hex.slice(4, 6), 16);

  const img = nativeImage.createFromPath(inp);
  const { width, height } = img.getSize();
  const buf = Buffer.from(img.toBitmap()); // BGRA
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const b = buf[i], g = buf[i + 1], r = buf[i + 2];
    const dom = g - Math.max(r, b);                 // green dominance
    const a = ss(T - 8, T + 8, dom);
    if (a > 0) {
      buf[i] = Math.round(b * (1 - a) + GB * a);
      buf[i + 1] = Math.round(g * (1 - a) + GG * a);
      buf[i + 2] = Math.round(r * (1 - a) + GR * a);
    }
    buf[i + 3] = 255;
  }
  const o = nativeImage.createFromBuffer(buf, { width, height });
  fs.writeFileSync(out, o.toPNG());
  console.log('flattened', width + 'x' + height, 'thr', thr);
  app.quit();
});
