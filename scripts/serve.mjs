// Serves dist/ the way GitHub Pages will: under BASE_URL, with 404.html as the SPA fallback.
// Usage: BASE_URL=/lexicard node scripts/serve.mjs   (then open http://localhost:4173/lexicard/)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const BASE = (process.env.BASE_URL ?? '').replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (BASE && !path.startsWith(BASE)) { res.writeHead(302, { Location: `${BASE}/` }); return res.end(); }
  path = path.slice(BASE.length) || '/';
  let file = normalize(join('dist', path));
  if (!file.startsWith('dist')) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  let status = 200;
  if (!existsSync(file)) { file = join('dist', '404.html'); status = 404; }
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Serving dist at http://localhost:${PORT}${BASE}/`));
