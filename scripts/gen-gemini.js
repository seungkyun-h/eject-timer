// Generate an image via the Gemini API. Reads GEMINI_API_KEY from env (never logged).
// Usage: PROMPT="..." node scripts/gen-gemini.js <model> <out.png>
const fs = require('fs');

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
const model = process.argv[2];
const out = process.argv[3];
const prompt = process.env.PROMPT || 'a cute hamster';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

async function main() {
  let url, body, extract;
  if (model.startsWith('imagen')) {
    url = BASE + model + ':predict';
    body = { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: process.env.ASPECT || '1:1', personGeneration: 'allow_all' } };
    extract = (j) => j.predictions && j.predictions[0] && j.predictions[0].bytesBase64Encoded;
  } else {
    url = BASE + model + ':generateContent';
    body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } };
    extract = (j) => {
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      const p = parts.find((x) => x.inlineData && x.inlineData.data);
      return p && p.inlineData.data;
    };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) { console.error('HTTP', res.status, txt.slice(0, 700)); process.exit(1); }
  const j = JSON.parse(txt);
  const b64 = extract(j);
  if (!b64) { console.error('no image in response:', JSON.stringify(j).slice(0, 700)); process.exit(1); }
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('saved', out, fs.statSync(out).size, 'bytes');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
