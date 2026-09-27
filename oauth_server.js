
const express = require('express');
const app = express();
const PORT = 3000;

// Load env
const env = require('fs').readFileSync('.env', 'utf8');
const envVars = {};
env.split('\n').forEach(line => {
  line = line.trim();
  if (line && !line.startsWith('#') && line.includes('=')) {
    const [k, ...v] = line.split('=');
    envVars[k] = v.join('=');
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, shop } = req.query;
  if (!code || !shop) return res.status(400).send('Missing code or shop');

  try {
    const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
    const tokenResp = await (await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: envVars.SHOPIFY_API_KEY,
        client_secret: envVars.SHOPIFY_API_SECRET,
        code
      }),
    })).json();

    if (tokenResp.access_token) {
      console.log('Got token:', tokenResp.access_token.substring(0, 15) + '...');
      console.log('Scopes:', tokenResp.scope);
      
      // Update .env
      const fs = require('fs');
      let envContent = fs.readFileSync('.env', 'utf8');
      envContent = envContent.replace(/SHOPIFY_ADMIN_TOKEN=.*/, `SHOPIFY_ADMIN_TOKEN=${tokenResp.access_token}`);
      envContent = envContent.replace(/SHOPIFY_SHOP_DOMAIN=.*/, `SHOPIFY_SHOP_DOMAIN=${shop}`);
      fs.writeFileSync('.env', envContent);
      
      res.send('<h1>Token saved!</h1><p>Scopes: ' + tokenResp.scope + '</p>');
    } else {
      res.status(400).send('Failed: ' + JSON.stringify(tokenResp));
    }
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

app.get('/', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log(`OAuth server on port ${PORT}`));
