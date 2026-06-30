// Background cutout via flood-fill from the image borders, so only the CONNECTED
// background is removed (interior light fur is preserved). Pure Electron main.
// Usage: electron scripts/cutout.js <in> <out.png> [tol=40] [feather=26]
const { app, nativeImage } = require('electron');
const fs = require('fs');

app.whenReady().then(() => {
  const inp = process.argv[2];
  const out = process.argv[3];
  const TOL = Number(process.argv[4] || 40);
  const FEATHER = Number(process.argv[5] || 26);
  const OUT = TOL + FEATHER;

  const img = nativeImage.createFromPath(inp);
  const { width, height } = img.getSize();
  const buf = Buffer.from(img.getBitmap());

  // background colour = average of the four corners
  const corner = (x, y) => ((y * width + x) * 4);
  let br = 0, bg = 0, bb = 0;
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    const i = corner(x, y); bb += buf[i]; bg += buf[i + 1]; br += buf[i + 2];
  }
  br /= 4; bg /= 4; bb /= 4;
  const dist = (i) => Math.sqrt((buf[i + 2] - br) ** 2 + (buf[i + 1] - bg) ** 2 + (buf[i] - bb) ** 2);

  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) { stack.push(x, 0, x, height - 1); }
  for (let y = 0; y < height; y++) { stack.push(0, y, width - 1, y); }

  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    const d = dist(i);
    if (d > OUT) continue;                 // hit the subject — stop
    buf[i + 3] = d <= TOL ? 0 : Math.round(255 * (d - TOL) / FEATHER); // feathered edge
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  fs.writeFileSync(out, nativeImage.createFromBitmap(buf, { width, height }).toPNG());
  let cut = 0;
  for (let p = 0; p < width * height; p++) if (buf[p * 4 + 3] === 0) cut++;
  console.log('cutout', width + 'x' + height, 'bg=' + [br, bg, bb].map(Math.round).join(','), 'transparent', cut);
  app.quit();
});
