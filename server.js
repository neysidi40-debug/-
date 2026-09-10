const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const port = Number(process.env.PORT) || 5500;
const root = __dirname;
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.jpeg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

http.createServer(async (request, response) => {
	if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
	const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
	const file = path.resolve(root, `.${requested}`);
	if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end(); return; }
	try {
		const content = await fs.readFile(file);
		const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
		if (requested === '/changelog.json') headers['Cache-Control'] = 'no-store';
		response.writeHead(200, headers);
		response.end(content);
	} catch {
		response.writeHead(404);
		response.end('Not found');
	}
}).listen(port, () => console.log(`ZOO disponível em http://localhost:${port}`));
