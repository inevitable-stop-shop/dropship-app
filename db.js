const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// Helper: get single row
async function getRow(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

// Helper: get all rows
async function getRows(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

// Helper: get count
async function getCount(text, params) {
  const res = await pool.query(text, params);
  return parseInt(res.rows[0]?.c || 0);
}

async function init() {
  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      default_lead_days INTEGER DEFAULT 3,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      sku TEXT,
      image_url TEXT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      supplier_product_ref TEXT,
      shopify_product_id INTEGER,
      shopify_variant_id INTEGER,
      inventory INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fulfillment_logs (
      id SERIAL PRIMARY KEY,
      shopify_order_id INTEGER,
      order_number TEXT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      email_to TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'sent',
      tracking_number TEXT,
      tracking_carrier TEXT,
      line_items TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Create default admin user
  const adminPass = process.env.APP_ADMIN_PASSWORD || 'admin123';
  const adminExists = await getRow('SELECT id FROM app_users WHERE username = $1', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync(adminPass, 10);
    await query('INSERT INTO app_users (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
  }
}

module.exports = { pool, query, getRow, getRows, getCount, init };