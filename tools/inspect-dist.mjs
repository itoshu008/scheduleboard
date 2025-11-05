import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'suke', 'dist');
const idx = path.join(dist, 'index.html');
if (!fs.existsSync(idx)) {
  console.error('❌ dist/index.html not found. Run build first.');
  process.exit(1);
}
const html = fs.readFileSync(idx, 'utf8');

const problems = [];
if (!/\/scheduleboard\/assets\/.+\.js/.test(html)) {
  problems.push('index.html does not reference /scheduleboard/assets/*.js (Vite base may be wrong).');
}
if (html.includes('src="/assets/')) {
  problems.push('Found src="/assets/..." (missing /scheduleboard/ prefix).');
}
if (html.includes('href="/favicon') || html.includes('href="/apple-touch-icon')) {
  problems.push('Found icons referenced at root ("/favicon..." or "/apple-touch..."). Use /scheduleboard/... or relative.');
}
if (problems.length) {
  console.error('❌ Dist inspection found issues:');
  for (const p of problems) console.error(' - ' + p);
  process.exit(2);
}
console.log('✅ Dist looks good for /scheduleboard/:');
console.log(html.split('\n').slice(0, 25).join('\n'));

