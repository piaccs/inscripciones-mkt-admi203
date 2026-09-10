const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'inscripciones.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sach TEXT,
    hs6 TEXT,
    subproductos TEXT,
    max_cupos INTEGER NOT NULL,
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT,
    product_id TEXT NOT NULL,
    past_project_name TEXT,
    members TEXT NOT NULL,
    member_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    created_at_chile TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// Seed default products if table is empty
const checkProducts = db.prepare('SELECT COUNT(*) as count FROM products');
const row = checkProducts.get();

if (row.count === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, sach, hs6, subproductos, max_cupos, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultProducts = [
    {
      id: 'miel',
      name: 'Miel (orgánicas y naturales)',
      sach: '04090010 - 04090090',
      hs6: '040900',
      subproductos: '04109011 – 04109019 – 04109021 – 04109029',
      max_cupos: 2,
      sort_order: 1
    },
    {
      id: 'cerveza',
      name: 'Cerveza',
      sach: '22030000',
      hs6: '220300',
      subproductos: 'Bagazo de cerveza',
      max_cupos: 2,
      sort_order: 2
    },
    {
      id: 'sidra',
      name: 'Sidra',
      sach: '22060000',
      hs6: '220600',
      subproductos: 'Agua ardiente de orujo de manzana',
      max_cupos: 2,
      sort_order: 3
    },
    {
      id: 'maqui',
      name: 'Maqui Liofilizado',
      sach: '08134071 - 08134079',
      hs6: '081340',
      subproductos: '08109071 – 08109079 – 08119071 – 08119079 – 11063011 – 11063019 – 12119092 – 12119093 – 15159030 – 20098981 – 20098989',
      max_cupos: 2,
      sort_order: 4
    },
    {
      id: 'gin',
      name: 'Gin',
      sach: '22085010 - 22085020',
      hs6: '–',
      subproductos: '–',
      max_cupos: 2,
      sort_order: 5
    },
    {
      id: 'vodka',
      name: 'Vodka',
      sach: '22086000',
      hs6: '–',
      subproductos: '–',
      max_cupos: 2,
      sort_order: 6
    },
    {
      id: 'semestre_pasado',
      name: 'Producto semestre pasado',
      sach: '–',
      hs6: '–',
      subproductos: 'Debe especificar el nombre del emprendimiento anterior',
      max_cupos: 999,
      sort_order: 7
    }
  ];

  for (const prod of defaultProducts) {
    insertProduct.run(
      prod.id,
      prod.name,
      prod.sach,
      prod.hs6,
      prod.subproductos,
      prod.max_cupos,
      prod.sort_order
    );
  }
  console.log('Seeded default products into database.');
}

function getChileTimeFormatted(date = new Date()) {
  const options = {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('es-CL', options);
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

// Queries
function getProductsWithStock() {
  const query = `
    SELECT 
      p.id,
      p.name,
      p.sach,
      p.hs6,
      p.subproductos,
      p.max_cupos,
      p.sort_order,
      COUNT(r.id) as registered_count,
      CASE 
        WHEN p.max_cupos >= 999 THEN 999 
        ELSE MAX(0, p.max_cupos - COUNT(r.id)) 
      END as cupos_disponibles
    FROM products p
    LEFT JOIN registrations r ON p.id = r.product_id
    GROUP BY p.id
    ORDER BY p.sort_order ASC;
  `;
  return db.prepare(query).all();
}

function getRegistrationsChronological() {
  const query = `
    SELECT 
      r.id,
      r.group_name,
      r.product_id,
      p.name as product_name,
      p.sach as product_sach,
      r.past_project_name,
      r.members,
      r.member_count,
      r.created_at,
      r.created_at_chile
    FROM registrations r
    JOIN products p ON r.product_id = p.id
    ORDER BY r.id ASC;
  `;
  const rows = db.prepare(query).all();
  return rows.map(r => ({
    ...r,
    members: JSON.parse(r.members)
  }));
}

/**
 * Register a group with strict transaction and race condition handling
 */
function registerGroup({ group_name, product_id, past_project_name, members }) {
  // 1. Validate members (min 5, max 6)
  if (!Array.isArray(members)) {
    throw new Error('Integrantes inválidos.');
  }

  const cleanedMembers = members
    .map(m => (typeof m === 'string' ? m.trim() : ''))
    .filter(m => m.length > 0);

  if (cleanedMembers.length < 5) {
    const err = new Error('El grupo debe tener como mínimo 5 integrantes.');
    err.statusCode = 400;
    throw err;
  }

  if (cleanedMembers.length > 6) {
    const err = new Error('El grupo no puede tener más de 6 integrantes.');
    err.statusCode = 400;
    throw err;
  }

  // 2. Validate product exists
  const prodStmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const product = prodStmt.get(product_id);
  if (!product) {
    const err = new Error('El producto seleccionado no es válido.');
    err.statusCode = 400;
    throw err;
  }

  // 3. If past semester product, require past_project_name
  if (product_id === 'semestre_pasado') {
    if (!past_project_name || past_project_name.trim().length === 0) {
      const err = new Error('Debe indicar el nombre del emprendimiento del semestre pasado.');
      err.statusCode = 400;
      throw err;
    }
  }

  // 4. ATOMIC TRANSACTION: Check cupos and insert
  db.exec('BEGIN IMMEDIATE;');
  try {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM registrations WHERE product_id = ?');
    const { count } = countStmt.get(product_id);

    if (product.max_cupos < 999 && count >= product.max_cupos) {
      db.exec('ROLLBACK;');
      const err = new Error('producto sin cupos disponibles');
      err.statusCode = 409;
      throw err;
    }

    const now = new Date();
    const createdAtIso = now.toISOString();
    const createdAtChile = getChileTimeFormatted(now);

    const insertStmt = db.prepare(`
      INSERT INTO registrations (
        group_name, product_id, past_project_name, members, member_count, created_at, created_at_chile
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      group_name && group_name.trim() ? group_name.trim() : null,
      product_id,
      past_project_name ? past_project_name.trim() : null,
      JSON.stringify(cleanedMembers),
      cleanedMembers.length,
      createdAtIso,
      createdAtChile
    );

    db.exec('COMMIT;');

    return {
      success: true,
      id: result.lastInsertRowid,
      product_name: product.name,
      members: cleanedMembers,
      created_at_chile: createdAtChile
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch (_) {}
    throw err;
  }
}

function deleteRegistration(id) {
  const checkStmt = db.prepare('SELECT * FROM registrations WHERE id = ?');
  const reg = checkStmt.get(id);
  if (!reg) {
    const err = new Error('Inscripción no encontrada.');
    err.statusCode = 404;
    throw err;
  }

  const delStmt = db.prepare('DELETE FROM registrations WHERE id = ?');
  delStmt.run(id);

  return { success: true, deleted_id: id, product_id: reg.product_id };
}

module.exports = {
  db,
  getProductsWithStock,
  getRegistrationsChronological,
  registerGroup,
  deleteRegistration,
  getChileTimeFormatted
};
