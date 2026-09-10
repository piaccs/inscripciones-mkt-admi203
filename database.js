const path = require('node:path');

const isPostgres = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let sqliteDb = null;

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

const initialRecoveredGroups = [
  {
    product_id: 'gin',
    members: ["Constanza Cisternas", "Renato Paredes", "Matias Olavarria", "Javiera Studer", "Maria Paula Gomez", "Isidora Riquelme"],
    member_count: 6,
    created_at: "2026-09-10T20:23:58.000Z",
    created_at_chile: "10/09/2026 17:23:58"
  },
  {
    product_id: 'miel',
    members: ["Ninoska Silva", "Yarelly Inostroza", "Catalina Mesas", "Danae Aqueveque", "Aylin Tapia"],
    member_count: 5,
    created_at: "2026-09-10T20:24:44.000Z",
    created_at_chile: "10/09/2026 17:24:44"
  },
  {
    product_id: 'maqui',
    members: ["Josefa Aravena", "Danielle Kemp", "Paula Saavedra", "Carolina Zenteno", "Maite Godoy"],
    member_count: 5,
    created_at: "2026-09-10T20:25:44.000Z",
    created_at_chile: "10/09/2026 17:25:44"
  },
  {
    product_id: 'cerveza',
    members: ["Joaquin Perez Monsalve", "Nicolas Jara", "Luis Holguin", "Vicente Lagos", "Alexander Espindola", "Felipe Garay"],
    member_count: 6,
    created_at: "2026-09-10T20:26:34.000Z",
    created_at_chile: "10/09/2026 17:26:34"
  },
  {
    product_id: 'vodka',
    members: ["Valentina Chacon", "Kerin Soto", "Maria Jose Vargas", "Genesis Barria", "Ramón Segura"],
    member_count: 5,
    created_at: "2026-09-10T20:27:30.000Z",
    created_at_chile: "10/09/2026 17:27:30"
  }
];

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

async function initDb() {
  if (isPostgres) {
    try {
      const { Pool } = require('pg');
      const isInternal = process.env.DATABASE_URL.includes('.render.internal') ||
        (process.env.DATABASE_URL.includes('@dpg-') && !process.env.DATABASE_URL.includes('.render.com'));

      const poolOptions = {
        connectionString: process.env.DATABASE_URL
      };
      if (!isInternal && (process.env.DATABASE_URL.includes('render.com') || process.env.DATABASE_URL.includes('sslmode=require'))) {
        poolOptions.ssl = { rejectUnauthorized: false };
      }

      pgPool = new Pool(poolOptions);

      await pgPool.query(`
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
          id SERIAL PRIMARY KEY,
          group_name TEXT,
          product_id TEXT NOT NULL REFERENCES products(id),
          past_project_name TEXT,
          members TEXT NOT NULL,
          member_count INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          created_at_chile TEXT NOT NULL
        );
      `);

      const { rows } = await pgPool.query('SELECT COUNT(*) as count FROM products');
      if (parseInt(rows[0].count, 10) === 0) {
        for (const prod of defaultProducts) {
          await pgPool.query(`
            INSERT INTO products (id, name, sach, hs6, subproductos, max_cupos, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING;
          `, [prod.id, prod.name, prod.sach, prod.hs6, prod.subproductos, prod.max_cupos, prod.sort_order]);
        }
        console.log('PostgreSQL: Inicializados y sembrados los productos predeterminados.');
      }

      // Seed recovered groups if registrations table is empty
      const { rows: regRows } = await pgPool.query('SELECT COUNT(*) as count FROM registrations');
      if (parseInt(regRows[0].count, 10) === 0) {
        for (const g of initialRecoveredGroups) {
          await pgPool.query(`
            INSERT INTO registrations (product_id, members, member_count, created_at, created_at_chile)
            VALUES ($1, $2, $3, $4, $5);
          `, [g.product_id, JSON.stringify(g.members), g.members.length, g.created_at, g.created_at_chile]);
        }
        console.log('PostgreSQL: Se importaron exitosamente los 5 grupos rescatados de los logs.');
      }

      console.log('PostgreSQL: Conectado y listo para persistencia permanente.');
      return;
    } catch (pgErr) {
      console.error('Error conectando a PostgreSQL, activando respaldo SQLite:', pgErr);
    }
  }

  // Local SQLite fallback
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(__dirname, 'inscripciones.db');
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA synchronous = NORMAL;');

    sqliteDb.exec(`
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

    const checkProducts = sqliteDb.prepare('SELECT COUNT(*) as count FROM products');
    const row = checkProducts.get();

    if (row.count === 0) {
      const insertProduct = sqliteDb.prepare(`
        INSERT INTO products (id, name, sach, hs6, subproductos, max_cupos, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

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
      console.log('SQLite: Inicializados y sembrados los productos.');
    }

    const checkRegs = sqliteDb.prepare('SELECT COUNT(*) as count FROM registrations');
    if (checkRegs.get().count === 0) {
      const insertReg = sqliteDb.prepare(`
        INSERT INTO registrations (product_id, members, member_count, created_at, created_at_chile)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const g of initialRecoveredGroups) {
        insertReg.run(g.product_id, JSON.stringify(g.members), g.members.length, g.created_at, g.created_at_chile);
      }
      console.log('SQLite: Importados los 5 grupos rescatados de la sesion anterior.');
    }
}

// Auto-run initDb
const initPromise = initDb().catch(err => {
  console.error('Error inicializando base de datos:', err);
});

async function getProductsWithStock() {
  await initPromise;
  if (isPostgres) {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.sach,
        p.hs6,
        p.subproductos,
        p.max_cupos,
        p.sort_order,
        COUNT(r.id)::int as registered_count,
        CASE 
          WHEN p.max_cupos >= 999 THEN 999 
          ELSE GREATEST(0, p.max_cupos - COUNT(r.id)::int) 
        END as cupos_disponibles
      FROM products p
      LEFT JOIN registrations r ON p.id = r.product_id
      GROUP BY p.id
      ORDER BY p.sort_order ASC;
    `;
    const { rows } = await pgPool.query(query);
    return rows;
  } else {
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
    return sqliteDb.prepare(query).all();
  }
}

async function getRegistrationsChronological() {
  await initPromise;
  if (isPostgres) {
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
    const { rows } = await pgPool.query(query);
    return rows.map(r => ({
      ...r,
      members: typeof r.members === 'string' ? JSON.parse(r.members) : r.members
    }));
  } else {
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
    const rows = sqliteDb.prepare(query).all();
    return rows.map(r => ({
      ...r,
      members: JSON.parse(r.members)
    }));
  }
}

async function registerGroup({ group_name, product_id, past_project_name, members }) {
  await initPromise;

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
  if (product_id === 'semestre_pasado') {
    if (!past_project_name || past_project_name.trim().length === 0) {
      const err = new Error('Debe indicar el nombre del emprendimiento del semestre pasado.');
      err.statusCode = 400;
      throw err;
    }
  }

  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const { rows: prodRows } = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
      const product = prodRows[0];
      if (!product) {
        const err = new Error('El producto seleccionado no es válido.');
        err.statusCode = 400;
        throw err;
      }

      const { rows: countRows } = await client.query('SELECT COUNT(*)::int as count FROM registrations WHERE product_id = $1', [product_id]);
      const count = countRows[0].count;

      if (product.max_cupos < 999 && count >= product.max_cupos) {
        await client.query('ROLLBACK');
        const err = new Error('producto sin cupos disponibles');
        err.statusCode = 409;
        throw err;
      }

      const now = new Date();
      const createdAtIso = now.toISOString();
      const createdAtChile = getChileTimeFormatted(now);

      const insertQuery = `
        INSERT INTO registrations (group_name, product_id, past_project_name, members, member_count, created_at, created_at_chile)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;
      const { rows: insertRows } = await client.query(insertQuery, [
        group_name && group_name.trim() ? group_name.trim() : null,
        product_id,
        past_project_name ? past_project_name.trim() : null,
        JSON.stringify(cleanedMembers),
        cleanedMembers.length,
        createdAtIso,
        createdAtChile
      ]);

      await client.query('COMMIT');

      const result = {
        success: true,
        id: insertRows[0].id,
        product_name: product.name,
        members: cleanedMembers,
        created_at_chile: createdAtChile
      };

      console.log('>>> [POSTGRESQL PERMANENTE] REGISTRO GUARDADO:', JSON.stringify(result));
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite implementation
    const prodStmt = sqliteDb.prepare('SELECT * FROM products WHERE id = ?');
    const product = prodStmt.get(product_id);
    if (!product) {
      const err = new Error('El producto seleccionado no es válido.');
      err.statusCode = 400;
      throw err;
    }

    sqliteDb.exec('BEGIN IMMEDIATE;');
    try {
      const countStmt = sqliteDb.prepare('SELECT COUNT(*) as count FROM registrations WHERE product_id = ?');
      const { count } = countStmt.get(product_id);

      if (product.max_cupos < 999 && count >= product.max_cupos) {
        sqliteDb.exec('ROLLBACK;');
        const err = new Error('producto sin cupos disponibles');
        err.statusCode = 409;
        throw err;
      }

      const now = new Date();
      const createdAtIso = now.toISOString();
      const createdAtChile = getChileTimeFormatted(now);

      const insertStmt = sqliteDb.prepare(`
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

      sqliteDb.exec('COMMIT;');

      const output = {
        success: true,
        id: result.lastInsertRowid,
        product_name: product.name,
        members: cleanedMembers,
        created_at_chile: createdAtChile
      };

      console.log('>>> [SQLITE LOCAL] REGISTRO GUARDADO:', JSON.stringify(output));
      return output;
    } catch (err) {
      try { sqliteDb.exec('ROLLBACK;'); } catch (_) {}
      throw err;
    }
  }
}

async function deleteRegistration(id) {
  await initPromise;
  if (isPostgres) {
    const { rows } = await pgPool.query('SELECT * FROM registrations WHERE id = $1', [id]);
    if (rows.length === 0) {
      const err = new Error('Inscripción no encontrada.');
      err.statusCode = 404;
      throw err;
    }
    await pgPool.query('DELETE FROM registrations WHERE id = $1', [id]);
    return { success: true, deleted_id: id, product_id: rows[0].product_id };
  } else {
    const checkStmt = sqliteDb.prepare('SELECT * FROM registrations WHERE id = ?');
    const reg = checkStmt.get(id);
    if (!reg) {
      const err = new Error('Inscripción no encontrada.');
      err.statusCode = 404;
      throw err;
    }
    const delStmt = sqliteDb.prepare('DELETE FROM registrations WHERE id = ?');
    delStmt.run(id);
    return { success: true, deleted_id: id, product_id: reg.product_id };
  }
}

module.exports = {
  get db() { return sqliteDb; },
  get sqliteDb() { return sqliteDb; },
  getProductsWithStock,
  getRegistrationsChronological,
  registerGroup,
  deleteRegistration,
  getChileTimeFormatted,
  initPromise
};
