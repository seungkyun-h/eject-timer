// Generate a short video via Veo (Gemini API), long-running op + poll + download.
// Usage: PROMPT="..." node scripts/veo-gen.js <model> <out.mp4>
const fs = require('fs');
const KEY = process.env.GEMINI_API_KEY;
const model = process.argv[2] || 'veo-3.0-fast-generate-001';
const out = process.argv[3] || '/tmp/veo.mp4';
const prompt = process.env.PROMPT || 'a cute hamster';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const inst = { prompt };
  if (process.env.IMAGE) {
    const ib = fs.readFileSync(process.env.IMAGE);
    inst.image = { bytesBase64Encoded: ib.toString('base64'), mimeType: process.env.IMAGE.endsWith('.jpg') ? 'image/jpeg' : 'image/png' };
  }
  const startBody = JSON.stringify({ instances: [inst], parameters: { aspectRatio: '9:16', personGeneration: process.env.IMAGE ? 'allow_adult' : 'allow_all' } });
  let res, txt;
  for (let attempt = 0; attempt < 10; attempt++) {
    res = await fetch(BASE + 'models/' + model + ':predictLongRunning', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: startBody,
    });
    txt = await res.text();
    if (res.ok) break;
    if (res.status === 429 || res.status >= 500) { console.log('start', res.status, '- backoff 25s (attempt ' + (attempt + 1) + ')'); await sleep(25000); continue; }
    console.error('start HTTP', res.status, txt.slice(0, 700)); process.exit(1);
  }
  if (!res.ok) { console.error('start failed after retries', res.status); process.exit(1); }
  const op = JSON.parse(txt).name;
  console.log('operation:', op);

  for (let i = 0; i < 60; i++) {
    await sleep(10000);
    res = await fetch(BASE + op, { headers: { 'x-goog-api-key': KEY } });
    txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch { console.log('poll parse err'); continue; }
    if (!j.done) { console.log('polling', (i + 1) * 10 + 's'); continue; }
    console.log('done at', (i + 1) * 10 + 's; response keys:', JSON.stringify(Object.keys(j.response || {})));
    const r = j.response || {};
    const samp = (r.generateVideoResponse && r.generateVideoResponse.generatedSamples) || r.generatedSamples || r.videos || [];
    const s0 = samp[0] || {};
    const uri = (s0.video && s0.video.uri) || s0.uri;
    const b64 = (s0.video && s0.video.bytesBase64Encoded) || s0.bytesBase64Encoded;
    if (uri) {
      const vr = await fetch(uri, { headers: { 'x-goog-api-key': KEY } });
      const buf = Buffer.from(await vr.arrayBuffer());
      fs.writeFileSync(out, buf); console.log('saved', out, buf.length, 'bytes');
    } else if (b64) {
      fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('saved', out);
    } else {
      console.error('no video found:', JSON.stringify(j).slice(0, 1200));
    }
    return;
  }
  console.error('timeout');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
