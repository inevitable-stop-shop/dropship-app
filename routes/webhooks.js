const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { processOrderFulfillment } = require('./admin');

// Shopify webhook: orders/create
// Shopify sends X-Shopify-Hmac-SHA256 header for verification.
// We use express.raw() to access the raw request body (Buffer) needed for HMAC,
// then parse the JSON ourselves after verifying the signature.
router.post('/orders/create', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify Shopify HMAC signature using the raw body (Buffer)
    const hmac = req.get('X-Shopify-Hmac-SHA256');
    const secret = process.env.SHOPIFY_API_SECRET;
    if (secret && hmac) {
      const digest = crypto.createHmac('sha256', secret).update(req.body).digest('base64');
      if (digest !== hmac) {
        console.error('[Webhook] HMAC verification failed');
        return res.status(401).send('HMAC verification failed');
      }
    }

    const order = JSON.parse(req.body.toString('utf8'));
    console.log(`[Webhook] Received order ${order.name} (${order.id}) — ${order.line_items?.length || 0} items`);

    await processOrderFulfillment(order);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    res.status(200).json({ ok: false, error: err.message }); // 200 so Shopify doesn't retry bomb
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

module.exports = router;