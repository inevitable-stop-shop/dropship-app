const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query, getRow, getRows, getCount, init } = require('../db');
const shopify = require('../lib/shopify');
const fulfillment = require('../lib/fulfillment');

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  res.redirect('/login');
}

// ---- Login / Logout ----
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getRow('SELECT * FROM app_users WHERE username = $1', [username]);
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.authed = true;
    res.redirect('/');
  } else {
    res.render('login', { title: 'Login', error: 'Invalid credentials' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ---- Dashboard ----
router.get('/', requireAuth, async (req, res) => {
  const stats = {
    suppliers: await getCount('SELECT COUNT(*) as c FROM suppliers'),
    products: await getCount('SELECT COUNT(*) as c FROM products'),
    activeProducts: await getCount('SELECT COUNT(*) as c FROM products WHERE is_active = 1'),
    fulfillmentLogs: await getCount('SELECT COUNT(*) as c FROM fulfillment_logs'),
    pendingTracking: await getCount("SELECT COUNT(*) as c FROM fulfillment_logs WHERE status = 'sent' AND tracking_number IS NULL"),
  };

  let shopConnected = null;
  try {
    const shop = await shopify.getShopInfo();
    shopConnected = { name: shop.name, domain: shop.domain, plan: shop.plan_name };
  } catch (e) {
    shopConnected = { error: e.message };
  }

  const recentLogs = await getRows(`
    SELECT fl.*, s.name as supplier_name
    FROM fulfillment_logs fl
    JOIN suppliers s ON fl.supplier_id = s.id
    ORDER BY fl.created_at DESC
    LIMIT 10
  `);

  res.render('dashboard', { title: 'Dashboard', activeNav: 'dashboard', stats, shopConnected, recentLogs });
});

// ---- Suppliers ----
router.get('/suppliers', requireAuth, async (req, res) => {
  const suppliers = await getRows(`
    SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) as product_count
    FROM suppliers s ORDER BY s.created_at DESC
  `);
  res.render('suppliers', { title: 'Suppliers', activeNav: 'suppliers', suppliers });
});

router.post('/suppliers', requireAuth, async (req, res) => {
  const { name, email, phone, default_lead_days, notes } = req.body;
  await query('INSERT INTO suppliers (name, email, phone, default_lead_days, notes) VALUES ($1, $2, $3, $4, $5)',
    [name, email, phone || null, parseInt(default_lead_days) || 3, notes || null]);
  res.redirect('/suppliers');
});

router.post('/suppliers/:id/delete', requireAuth, async (req, res) => {
  await query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
  res.redirect('/suppliers');
});

// ---- Products ----
router.get('/products', requireAuth, async (req, res) => {
  const products = await getRows(`
    SELECT p.*, s.name as supplier_name
    FROM products p
    JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.created_at DESC
  `);
  const suppliers = await getRows('SELECT id, name FROM suppliers');
  res.render('products', { title: 'Products', activeNav: 'products', products, suppliers, error: req.query.error });
});

router.post('/products', requireAuth, async (req, res) => {
  const { title, description, price, cost, sku, image_url, supplier_id, inventory, push_to_shopify } = req.body;
  try {
    const result = await query(`
      INSERT INTO products (title, description, price, cost, sku, image_url, supplier_id, inventory, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1) RETURNING id
    `, [title, description || null, parseFloat(price), parseFloat(cost) || 0,
        sku || null, image_url || null, parseInt(supplier_id), parseInt(inventory) || 0]);

    const localId = result.rows[0].id;

    if (push_to_shopify === 'on') {
      try {
        const shopifyData = await shopify.createProduct({
          title, description: description || '', price: parseFloat(price),
          sku: sku || '', image_url: image_url || '', inventory: parseInt(inventory) || 0,
        });
        await query('UPDATE products SET shopify_product_id = $1, shopify_variant_id = $2 WHERE id = $3',
          [shopifyData.shopify_product_id, shopifyData.shopify_variant_id, localId]);
      } catch (e) {
        res.redirect('/products?error=' + encodeURIComponent('Saved locally but Shopify push failed: ' + e.message));
        return;
      }
    }
    res.redirect('/products');
  } catch (e) {
    res.redirect('/products?error=' + encodeURIComponent(e.message));
  }
});

router.post('/products/:id/push', requireAuth, async (req, res) => {
  const product = await getRow('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!product) return res.redirect('/products');

  try {
    if (product.shopify_product_id) {
      await shopify.updateProduct(product.shopify_product_id, product);
    } else {
      const shopifyData = await shopify.createProduct({
        title: product.title, description: product.description, price: product.price,
        sku: product.sku, image_url: product.image_url, inventory: product.inventory,
      });
      await query('UPDATE products SET shopify_product_id = $1, shopify_variant_id = $2 WHERE id = $3',
        [shopifyData.shopify_product_id, shopifyData.shopify_variant_id, product.id]);
    }
    res.redirect('/products');
  } catch (e) {
    res.redirect('/products?error=' + encodeURIComponent(e.message));
  }
});

router.post('/products/:id/delete', requireAuth, async (req, res) => {
  const product = await getRow('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (product?.shopify_product_id) {
    try { await shopify.deleteProduct(product.shopify_product_id); } catch {}
  }
  await query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.redirect('/products');
});

// ---- Orders / Fulfillment ----
router.get('/orders', requireAuth, async (req, res) => {
  const logs = await getRows(`
    SELECT fl.*, s.name as supplier_name
    FROM fulfillment_logs fl
    JOIN suppliers s ON fl.supplier_id = s.id
    ORDER BY fl.created_at DESC
  `);
  res.render('orders', { title: 'Fulfillment', activeNav: 'orders', logs });
});

router.post('/orders/:logId/tracking', requireAuth, async (req, res) => {
  const { tracking_number, tracking_carrier } = req.body;
  const log = await getRow('SELECT * FROM fulfillment_logs WHERE id = $1', [req.params.logId]);
  if (!log) return res.redirect('/orders');

  await query('UPDATE fulfillment_logs SET tracking_number = $1, tracking_carrier = $2, status = $3 WHERE id = $4',
    [tracking_number, tracking_carrier || null, 'fulfilled', log.id]);

  try {
    const lineItems = JSON.parse(log.line_items || '[]');
    await shopify.createFulfillment(log.shopify_order_id, tracking_number, tracking_carrier, lineItems);
    await query('UPDATE fulfillment_logs SET status = $1 WHERE id = $2', ['synced', log.id]);
  } catch (e) {
    res.redirect('/orders?error=' + encodeURIComponent('Tracking saved but Shopify fulfillment sync failed: ' + e.message));
    return;
  }
  res.redirect('/orders');
});

// ---- Settings ----
router.get('/settings', requireAuth, async (req, res) => {
  let webhooks = [];
  let webhookError = null;
  try {
    const result = await shopify.listWebhooks();
    webhooks = result.webhooks || [];
  } catch (e) {
    webhookError = e.message;
  }

  let mailStatus = null;
  try {
    mailStatus = await fulfillment.verifyConnection();
  } catch (e) {
    mailStatus = { ok: false, error: e.message };
  }

  res.render('settings', { title: 'Settings', activeNav: 'settings', webhooks, webhookError, mailStatus });
});

router.post('/settings/webhooks/register', requireAuth, async (req, res) => {
  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) return res.redirect('/settings?error=' + encodeURIComponent('APP_BASE_URL not set'));

  try {
    await shopify.registerWebhook('orders/create', `${baseUrl}/webhooks/orders/create`);
    res.redirect('/settings?ok=' + encodeURIComponent('Order webhook registered'));
  } catch (e) {
    res.redirect('/settings?error=' + encodeURIComponent(e.message));
  }
});

router.post('/settings/webhooks/:id/delete', requireAuth, async (req, res) => {
  try { await shopify.deleteWebhook(req.params.id); } catch {}
  res.redirect('/settings');
});

// ---- Update password (temp endpoint, will be removed after use) ----
router.post('/update-password', requireAuth, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    await query('UPDATE app_users SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
    res.json({ ok: true, message: 'Password updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Manual test ----
router.post('/orders/test', requireAuth, async (req, res) => {
  const { shopify_order_id } = req.body;
  try {
    const order = await shopify.getOrder(shopify_order_id);
    await processOrderFulfillment(order);
    res.redirect('/orders?ok=' + encodeURIComponent('Fulfillment emails sent for order ' + order.name));
  } catch (e) {
    res.redirect('/orders?error=' + encodeURIComponent(e.message));
  }
});

// Shared fulfillment processing
async function processOrderFulfillment(order) {
  const lineItems = order.line_items || [];

  for (const item of lineItems) {
    const product = await getRow(
      'SELECT p.*, s.email as supplier_email, s.name as supplier_name, s.notes, s.default_lead_days FROM products p JOIN suppliers s ON p.supplier_id = s.id WHERE p.sku = $1 OR p.shopify_variant_id = $2',
      [item.sku, item.variant_id]
    );

    if (!product) continue;

    const supplier = {
      name: product.supplier_name,
      email: product.supplier_email,
      notes: product.notes,
      default_lead_days: product.default_lead_days,
    };

    const existing = await getRow(
      'SELECT id FROM fulfillment_logs WHERE shopify_order_id = $1 AND supplier_id = $2',
      [order.id, product.supplier_id]
    );
    if (existing) continue;

    const result = await fulfillment.emailSupplier(order, supplier, [item]);

    await query(`
      INSERT INTO fulfillment_logs (shopify_order_id, order_number, supplier_id, email_to, subject, body, line_items, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')
    `, [order.id, order.name, product.supplier_id, supplier.email,
        result.subject, result.body, JSON.stringify([{ id: item.id, quantity: item.quantity }])]);
  }
}

module.exports = { router, processOrderFulfillment };
