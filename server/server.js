// KanFlash local server: serves the site and exposes board.json through an API.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, BOARD_FILE, loadBoard, saveBoard } from '../core/board.js';

const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4545;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const clients = new Set();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error('Request body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/board' && req.method === 'GET') return json(res, 200, loadBoard());

    if (url.pathname === '/api/board' && req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      try {
        return json(res, 200, saveBoard(body, body.rev));
      } catch (e) {
        if (e.code === 'CONFLICT') return json(res, 409, { error: e.message, board: loadBoard() });
        throw e;
      }
    }

    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });

    // static files
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) return json(res, 403, { error: 'Forbidden' });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('The site has not been built yet. Run: npm run build (inside the KanFlash folder).');
    }
    const hashed = file.includes(path.join('dist', 'assets'));
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

// Watches the file for changes (made by the AI/CLI) and notifies the browser.
loadBoard(); // make sure the file exists
let timer;
fs.watch(path.dirname(BOARD_FILE), (_evt, name) => {
  if (name && path.basename(BOARD_FILE) !== name) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const c of clients) c.write('data: change\n\n');
  }, 60);
});
setInterval(() => {
  for (const c of clients) c.write(': ping\n\n');
}, 25000).unref();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use (KanFlash may already be running). Use --port <n>.`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://localhost:${PORT}`;
  console.log(`KanFlash running at ${addr}`);
  console.log(`Data: ${BOARD_FILE}`);
  if (process.env.KANFLASH_OPEN) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', addr]] : process.platform === 'darwin' ? ['open', [addr]] : ['xdg-open', [addr]];
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  }
});
