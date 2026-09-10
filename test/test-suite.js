const assert = require('node:assert');
const { Readable, Writable } = require('node:stream');
const { handleRequest } = require('../server.js');
const db = require('../database.js');

// Mock request/response simulator
function simulateRequest({ method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    // Mock incoming request stream
    const req = new Readable({
      read() {
        if (body) {
          this.push(typeof body === 'object' ? JSON.stringify(body) : body);
        }
        this.push(null);
      }
    });
    req.method = method;
    req.url = url;
    req.headers = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    );

    // Mock outgoing response stream
    const res = new Writable({
      write(chunk, encoding, callback) {
        this.bodyChunks.push(chunk);
        callback();
      }
    });
    res.bodyChunks = [];
    res.statusCode = 200;
    res.headers = {};
    res.writeHead = (statusCode, headers = {}) => {
      res.statusCode = statusCode;
      res.headers = { ...res.headers, ...headers };
    };
    res.setHeader = (key, value) => {
      res.headers[key.toLowerCase()] = value;
    };
    res.end = (chunk) => {
      if (chunk) res.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const fullBuffer = Buffer.concat(res.bodyChunks);
      const text = fullBuffer.toString('utf-8');
      let data = text;
      const contentType = (res.headers['content-type'] || res.headers['Content-Type'] || '');
      if (contentType.includes('application/json')) {
        try { data = JSON.parse(text); } catch (_) {}
      }
      resolve({ status: res.statusCode, headers: res.headers, data, text });
    };

    handleRequest(req, res).catch(reject);
  });
}

async function runTests() {
  console.log('==============================================');
  console.log(' STARTING AUTOMATED VALIDATION TEST SUITE     ');
  console.log('==============================================');

  // Reset db registrations for tests
  db.db.exec('DELETE FROM registrations;');

  // 1. Static HTML serving
  const home = await simulateRequest({ method: 'GET', url: '/' });
  assert.strictEqual(home.status, 200);
  assert.ok(home.text.includes('Marketing Internacional ADMI-203'));
  assert.ok(home.text.includes('Integrantes del Grupo'));
  console.log('✔ Test 1: Student home page loaded successfully');

  const adminPage = await simulateRequest({ method: 'GET', url: '/admin.html' });
  assert.strictEqual(adminPage.status, 200);
  assert.ok(adminPage.text.includes('Panel de Control Docente'));
  console.log('✔ Test 2: Admin page loaded successfully');

  // 2. GET /api/products
  const prodRes = await simulateRequest({ method: 'GET', url: '/api/products' });
  assert.strictEqual(prodRes.status, 200);
  assert.strictEqual(prodRes.data.products.length, 7);
  const cervezaProd = prodRes.data.products.find(p => p.id === 'cerveza');
  assert.strictEqual(cervezaProd.cupos_disponibles, 2);
  assert.strictEqual(cervezaProd.sach, '22030000');
  assert.strictEqual(cervezaProd.hs6, '220300');
  console.log('✔ Test 3: Products endpoint returns accurate catalogue and initial cupos');

  // 3. Reject < 5 members
  const failMinMembers = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'cerveza',
      members: ['Alumno 1', 'Alumno 2', 'Alumno 3', 'Alumno 4']
    }
  });
  assert.strictEqual(failMinMembers.status, 400);
  assert.ok(failMinMembers.data.error.includes('mínimo 5 integrantes'));
  console.log('✔ Test 4: Rejects submission if less than 5 members');

  // 4. Reject > 6 members
  const failMaxMembers = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'cerveza',
      members: ['1', '2', '3', '4', '5', '6', '7']
    }
  });
  assert.strictEqual(failMaxMembers.status, 400);
  assert.ok(failMaxMembers.data.error.includes('más de 6 integrantes'));
  console.log('✔ Test 5: Rejects submission if more than 6 members');

  // 5. Reject past semester without venture name
  const failPast = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'semestre_pasado',
      past_project_name: '',
      members: ['A1', 'A2', 'A3', 'A4', 'A5']
    }
  });
  assert.strictEqual(failPast.status, 400);
  assert.ok(failPast.data.error.includes('emprendimiento'));
  console.log('✔ Test 6: Requires venture name for "Producto semestre pasado"');

  // 6. Register 1st group for cerveza (5 members)
  const reg1 = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'cerveza',
      members: ['Juan Soto', 'Maria Diaz', 'Carlos Perez', 'Ana Silva', 'Diego Mora']
    }
  });
  assert.strictEqual(reg1.status, 201);
  assert.ok(reg1.data.created_at_chile);
  console.log('✔ Test 7: Group 1 successfully registered for cerveza (Remaining: 1 cupo)');

  // 7. Register 2nd group for cerveza (6 members)
  const reg2 = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'cerveza',
      members: ['Paula Rivas', 'Luis Gomez', 'Fernanda Toro', 'Javier Vega', 'Camila Munoz', 'Matias Valenzuela']
    }
  });
  assert.strictEqual(reg2.status, 201);
  console.log('✔ Test 8: Group 2 successfully registered for cerveza (Remaining: 0 cupos - AGOTADO)');

  // 8. Attempt 3rd registration for cerveza -> MUST return 409 with exact message
  const reg3 = await simulateRequest({
    method: 'POST',
    url: '/api/register',
    body: {
      product_id: 'cerveza',
      members: ['M1', 'M2', 'M3', 'M4', 'M5']
    }
  });
  assert.strictEqual(reg3.status, 409);
  assert.strictEqual(reg3.data.error, 'producto sin cupos disponibles');
  console.log('✔ Test 9: 3rd registration rejected with exact error: "producto sin cupos disponibles"');

  // 9. Admin Login with incorrect password
  const badLogin = await simulateRequest({
    method: 'POST',
    url: '/api/admin/login',
    body: { password: 'wrongpassword' }
  });
  assert.strictEqual(badLogin.status, 401);
  console.log('✔ Test 10: Unauthorized admin access rejected');

  // 10. Admin Login with 'piayanitalidas'
  const goodLogin = await simulateRequest({
    method: 'POST',
    url: '/api/admin/login',
    body: { password: 'piayanitalidas' }
  });
  assert.strictEqual(goodLogin.status, 200);
  console.log('✔ Test 11: Admin password "piayanitalidas" successfully authenticated');

  // 11. Admin view registrations list
  const listRes = await simulateRequest({
    method: 'GET',
    url: '/api/admin/registrations',
    headers: { 'x-admin-password': 'piayanitalidas' }
  });
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.data.registrations.length, 2);
  assert.strictEqual(listRes.data.registrations[0].product_id, 'cerveza');
  assert.strictEqual(listRes.data.registrations[0].member_count, 5);
  assert.strictEqual(listRes.data.registrations[1].member_count, 6);
  console.log('✔ Test 12: Admin can see chronological registrations list with timestamps');

  // 12. Admin delete registration #1 -> frees up 1 cupo for cerveza
  const delRes = await simulateRequest({
    method: 'DELETE',
    url: `/api/admin/registrations/${reg1.data.id}`,
    headers: { 'x-admin-password': 'piayanitalidas' }
  });
  assert.strictEqual(delRes.status, 200);

  // Check that cerveza now has 1 cupo available again!
  const checkStock = await simulateRequest({ method: 'GET', url: '/api/products' });
  const cervezaStock = checkStock.data.products.find(p => p.id === 'cerveza');
  assert.strictEqual(cervezaStock.cupos_disponibles, 1);
  console.log('✔ Test 13: Deletion frees up product cupo back to 1 in real time');

  // 13. Export CSV
  const csvRes = await simulateRequest({
    method: 'GET',
    url: '/api/admin/export-csv?password=piayanitalidas'
  });
  assert.strictEqual(csvRes.status, 200);
  assert.ok(csvRes.text.includes('N° Orden,Fecha y Hora (Chile)'));
  assert.ok(csvRes.text.includes('Paula Rivas'));
  console.log('✔ Test 14: CSV Export for Excel generates properly with all group data');

  // Clean up test data
  db.db.exec('DELETE FROM registrations;');

  console.log('==============================================');
  console.log(' ALL 14 INTEGRATION TESTS PASSED SUCCESSFULLY! ');
  console.log('==============================================');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
