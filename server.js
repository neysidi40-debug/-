const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 5500;
const ROOT = __dirname;
const DATABASE_FILE = path.join(ROOT, 'data', 'zoo-messages.json');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};
let databaseQueue = Promise.resolve();

async function readDatabase() {
  try {
    return JSON.parse(await fs.readFile(DATABASE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const emptyDatabase = { messages: [] };
    await writeDatabase(emptyDatabase);
    return emptyDatabase;
  }
}

async function writeDatabase(database) {
  await fs.mkdir(path.dirname(DATABASE_FILE), { recursive: true });
  const temporaryFile = `${DATABASE_FILE}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, DATABASE_FILE);
}

function updateDatabase(update) {
  const operation = databaseQueue.then(async () => {
    const database = await readDatabase();
    const result = await update(database);
    await writeDatabase(database);
    return result;
  });
  databaseQueue = operation.catch(() => {});
  return operation;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('payload_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function handleApi(request, response, requestUrl) {
  if (requestUrl.pathname === '/api/messages' && request.method === 'GET') {
    const database = await readDatabase();
    sendJson(response, 200, database.messages.slice(-100));
    return true;
  }

  if (requestUrl.pathname === '/api/messages' && request.method === 'POST') {
    let payload;
    try {
      payload = JSON.parse(await readRequestBody(request));
    } catch {
      sendError(response, 400, 'mensagem inválida');
      return true;
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text || text.length > 280) {
      sendError(response, 400, 'a mensagem deve ter entre 1 e 280 caracteres');
      return true;
    }

    const message = {
      author: 'anônimo',
      text,
      createdAt: new Date().toISOString()
    };
    const savedMessage = await updateDatabase((database) => {
      database.messages.push(message);
      database.messages = database.messages.slice(-1000);
      return message;
    });
    sendJson(response, 201, savedMessage);
    return true;
  }

  return false;
}

async function serveStatic(response, requestUrl) {
  const requestedPath = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    sendError(response, 403, 'acesso negado');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extension] || 'application/octet-stream' });
    response.end(file);
  } catch (error) {
    sendError(response, error.code === 'ENOENT' ? 404 : 500, 'arquivo não encontrado');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (await handleApi(request, response, requestUrl)) return;
    if (request.method !== 'GET') {
      sendError(response, 405, 'método não permitido');
      return;
    }
    await serveStatic(response, requestUrl);
  } catch (error) {
    console.error(error);
    sendError(response, 500, 'erro interno do servidor');
  }
});

server.listen(PORT, () => {
  console.log(`ZOO disponível em http://localhost:${PORT}`);
  console.log(`Banco de mensagens: ${DATABASE_FILE}`);
});
