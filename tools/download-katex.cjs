const fs = require('fs');
const https = require('https');
function get(url, dest, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
      file.on('error', reject);
    }).on('error', reject);
  });
}
(async () => {
  const base = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  await get(base + 'katex.min.js', 'extension/assets/katex.min.js');
  console.log('katex.min.js OK');
  await get(base + 'katex.min.css', 'extension/assets/katex.min.css');
  console.log('katex.min.css OK');
  require('child_process').execFileSync(process.execPath, [require('path').join(__dirname, 'download-fonts.cjs')], { stdio: 'inherit' });
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
