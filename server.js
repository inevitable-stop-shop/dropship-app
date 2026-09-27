require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const { init } = require('./db');

// Initialize DB tables (async for PostgreSQL)
init().then(() => {
  console.log('[DB] Database initialized');
}).catch(err => {
  console.error('[DB] Init error:', err.message);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dropship-app-fallback-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 },
}));

// Make env values available to templates
app.use((req, res, next) => {
  res.locals.shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || '';
  res.locals.appBaseUrl = process.env.APP_BASE_URL || '';
  next();
});

// Security headers (applied to all responses, before routes)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Routes
const adminRoutes = require('./routes/admin');
app.use('/', adminRoutes.router);

const webhookRoutes = require('./routes/webhooks');
app.use('/webhooks', webhookRoutes);

// OAuth callback handler (for app installation)
app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).send('Missing code or shop');

  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  try {
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenData = await tokenResp.json();

    if (tokenData.access_token) {
      console.log(`[OAuth] Got access token for ${shop}: ${tokenData.access_token.substring(0, 10)}...`);
      // Update .env file with the new token
      const fs = require('fs');
      const envPath = path.join(__dirname, '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/SHOPIFY_ADMIN_TOKEN=.*/, `SHOPIFY_ADMIN_TOKEN=${tokenData.access_token}`);
      envContent = envContent.replace(/SHOPIFY_SHOP_DOMAIN=.*/, `SHOPIFY_SHOP_DOMAIN=${shop}`);
      fs.writeFileSync(envPath, envContent);

      res.send('<h1>App installed successfully!</h1><p>Access token saved. Restart the app to apply changes.</p><p><a href="/">Go to admin panel</a></p>');
    } else {
      res.status(400).send('Failed to get access token: ' + JSON.stringify(tokenData));
    }
  } catch (err) {
    res.status(500).send('OAuth error: ' + err.message);
  }
});

const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
app.listen(PORT, host, () => {
  console.log(`\n  ════════════════════════════════════════════`);
  console.log(`  Shopify Dropship App running`);
  console.log(`  Admin panel:  http://localhost:${PORT}`);
  console.log(`  Webhook URL:  ${process.env.APP_BASE_URL || '(not set)'}/webhooks/orders/create`);
  console.log(`  Login:        admin / ${process.env.APP_ADMIN_PASSWORD || 'admin123'}`);
  console.log(`  ════════════════════════════════════════════\n`);
});