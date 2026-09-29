// A tiny static web server for the tests: serves the project folder (one level up) on the port given (default 5173).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.argv[2] || 5173;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.xml': 'application/xml', '.svg': 'image/svg+xml'};

http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root)){ res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'}).end(data);
  });
}).listen(port, () => console.log('serving ' + root + ' on http://localhost:' + port));
