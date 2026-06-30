const { app, nativeImage } = require('electron');
const fs = require('fs');
app.whenReady().then(() => {
  const inp = process.argv[2], out = process.argv[3];
  const [R,G,B] = (process.argv[4]||'40,140,150').split(',').map(Number);
  let img = nativeImage.createFromPath(inp);
  if (process.argv[5]) img = img.crop({ x:+process.argv[5], y:+process.argv[6], width:+process.argv[7], height:+process.argv[8] });
  const { width, height } = img.getSize();
  const buf = Buffer.from(img.getBitmap());
  for (let i=0;i<buf.length;i+=4){ const a=buf[i+3]/255;
    buf[i]=Math.round(buf[i]*a + B*(1-a));
    buf[i+1]=Math.round(buf[i+1]*a + G*(1-a));
    buf[i+2]=Math.round(buf[i+2]*a + R*(1-a));
    buf[i+3]=255; }
  fs.writeFileSync(out, nativeImage.createFromBitmap(buf,{width,height}).toPNG());
  app.quit();
});
