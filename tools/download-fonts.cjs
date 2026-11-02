const fs = require('fs');
const https = require('https');
const path = require('path');
const css = fs.readFileSync('extension/assets/katex.min.css', 'utf8');
const names = [...new Set([...css.matchAll(/fonts\/([A-Za-z0-9_-]+\.(?:woff2|woff|ttf))/g)].map(m => m[1]))];
console.log('fonts referenced:', names.length);
function get(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' ' + url)); }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}
(async () => {
  fs.mkdirSync('extension/assets/fonts', { recursive: true });
  let fail = 0;
  const CONC = 8;
  for (let i = 0; i < names.length; i += CONC) {
    const batch = names.slice(i, i + CONC);
    await Promise.all(batch.map(async n => {
      try { await get('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/' + n, path.join('extension/assets/fonts', n)); }
      catch (e) { fail++; console.error('FAIL', n, e.message); }
    }));
  }
  console.log('done, failed:', fail);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });

