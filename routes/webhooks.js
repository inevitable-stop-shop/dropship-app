const express = require('express');
const router = express.Router();
const { processOrderFulfillment } = require('./admin');

// Shopify webhook: orders/create
// Shopify sends X-Shopify-Hmac-SHA256 header for verification.
// In production you MUST verify this signature. For local dev it's optional.
router.post('/orders/create', express.json(), async (req, res) => {
  try {
    const order = req.body;
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