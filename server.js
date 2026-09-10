const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./database.js');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'piayanitalidas';
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// SSE active clients
const sseClients = new Set();

async function broadcastStock() {
  const products = await db.getProductsWithStock();
  const data = JSON.stringify({ type: 'stock_update', products });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

// Keep-alive heartbeat for SSE every 25 seconds
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': keep-alive\n\n');
    } catch (_) {
      sseClients.delete(client);
    }
  }
}, 25000);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Formato JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function checkAdminAuth(req) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const headerPwd = req.headers['x-admin-password'];
  const queryPwd = parsedUrl.searchParams.get('password');
  return headerPwd === ADMIN_PASSWORD || queryPwd === ADMIN_PASSWORD;
}

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password'
    });
    res.end();
    return;
  }

  // --- API ROUTES ---

  // SSE stream endpoint
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    sseClients.add(res);

    // Send initial stock payload immediately
    const products = await db.getProductsWithStock();
    res.write(`data: ${JSON.stringify({ type: 'stock_update', products })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // GET /api/products
  if (pathname === '/api/products' && method === 'GET') {
    const products = await db.getProductsWithStock();
    return sendJson(res, 200, { products });
  }

  // POST /api/register
  if (pathname === '/api/register' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = await db.registerGroup(body);
      console.log('>>> [NUEVA INSCRIPCIÓN CONFIRMADA]:', JSON.stringify({
        id: result.id,
        producto: result.product_name,
        integrantes: result.members,
        fecha: result.created_at_chile
      }));
      // Real-time broadcast to all connected students and admin
      await broadcastStock();
      return sendJson(res, 201, result);
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return sendJson(res, statusCode, { error: err.message });
    }
  }

  // POST /api/admin/login
  if (pathname === '/api/admin/login' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (body.password === ADMIN_PASSWORD) {
        return sendJson(res, 200, { success: true, message: 'Autenticación exitosa' });
      } else {
        return sendJson(res, 401, { error: 'Contraseña incorrecta' });
      }
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // GET /api/admin/registrations
  if (pathname === '/api/admin/registrations' && method === 'GET') {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { error: 'No autorizado. Clave de administrador incorrecta.' });
    }
    const registrations = await db.getRegistrationsChronological();
    return sendJson(res, 200, { registrations });
  }

  // DELETE /api/admin/registrations/:id
  if (pathname.startsWith('/api/admin/registrations/') && method === 'DELETE') {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { error: 'No autorizado. Clave de administrador incorrecta.' });
    }
    const parts = pathname.split('/');
    const id = parseInt(parts[parts.length - 1], 10);
    if (isNaN(id)) {
      return sendJson(res, 400, { error: 'ID de inscripción inválido.' });
    }
    try {
      const result = await db.deleteRegistration(id);
      // Immediately notify all users of restored quota
      await broadcastStock();
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, err.statusCode || 500, { error: err.message });
    }
  }

  // GET /api/admin/export-csv
  if (pathname === '/api/admin/export-csv' && method === 'GET') {
    if (!checkAdminAuth(req)) {
      return sendJson(res, 401, { error: 'No autorizado' });
    }
    const registrations = await db.getRegistrationsChronological();
    
    // Generate CSV UTF-8 with BOM for Excel
    const bom = '\uFEFF';
    let csv = bom + 'N° Orden,Fecha y Hora (Chile),Producto,Código SACh,Emprendimiento Semestre Pasado,Cant. Integrantes,Integrantes\n';
    
    registrations.forEach((r, idx) => {
      const order = idx + 1;
      const date = `"${r.created_at_chile}"`;
      const prod = `"${r.product_name.replace(/"/g, '""')}"`;
      const sach = `"${(r.product_sach || '').replace(/"/g, '""')}"`;
      const past = `"${(r.past_project_name || '').replace(/"/g, '""')}"`;
      const count = r.member_count;
      const members = `"${r.members.join(' | ').replace(/"/g, '""')}"`;
      csv += `${order},${date},${prod},${sach},${past},${count},${members}\n`;
    });

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inscripciones-marketing-admi203.csv"',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(csv);
    return;
  }

  // --- STATIC FILE SERVING ---
  let filePath = pathname;
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  } else if (filePath === '/admin') {
    filePath = '/admin.html';
  }

  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure path is within PUBLIC_DIR
  if (!absolutePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Acceso denegado');
    return;
  }

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Página no encontrada');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
  });
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` Servidor de Inscripciones Marketing ADMI-203`);
    console.log(` En ejecución en: http://localhost:${PORT}`);
    console.log(` Formulario alumnos: http://localhost:${PORT}/`);
    console.log(` Panel admin:        http://localhost:${PORT}/admin.html`);
    console.log(` Clave de admin:     ${ADMIN_PASSWORD}`);
    console.log(`====================================================`);
  });
}

module.exports = { server, handleRequest };

