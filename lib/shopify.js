require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION = '2024-10'; // Stable release candidate

function baseUrl() {
  return `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}`;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': ADMIN_TOKEN,
  };
}

async function shopifyFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl()}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = typeof body === 'object' && body?.errors
      ? JSON.stringify(body.errors)
      : res.statusText;
    throw new Error(`Shopify API ${res.status}: ${msg}`);
  }
  return body;
}

// ---- Products ----
async function createProduct(productData) {
  const payload = {
    product: {
      title: productData.title,
      body_html: productData.description || '',
      vendor: 'Dropship',
      variants: [{
        price: productData.price.toFixed(2),
        sku: productData.sku || '',
        inventory_management: 'shopify',
        inventory_quantity: productData.inventory || 0,
      }],
    },
  };
  if (productData.image_url) {
    payload.product.images = [{ src: productData.image_url }];
  }
  const result = await shopifyFetch('/products.json', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    shopify_product_id: result.product.id,
    shopify_variant_id: result.product.variants[0].id,
  };
}

async function updateProduct(shopifyProductId, productData) {
  const payload = {
    product: {
      id: shopifyProductId,
      title: productData.title,
      body_html: productData.description || '',
      variants: [{
        price: productData.price.toFixed(2),
        sku: productData.sku || '',
      }],
    },
  };
  if (productData.image_url) {
    payload.product.images = [{ src: productData.image_url }];
  }
  return shopifyFetch(`/products/${shopifyProductId}.json`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

async function deleteProduct(shopifyProductId) {
  return shopifyFetch(`/products/${shopifyProductId}.json`, { method: 'DELETE' });
}

// ---- Orders ----
async function getOrder(orderId) {
  const result = await shopifyFetch(`/orders/${orderId}.json?fields=id,name,email,shipping_address,line_items,customer`);
  return result.order;
}

// ---- Fulfillment ----
async function createFulfillment(orderId, trackingNumber, trackingCarrier, lineItems) {
  const payload = {
    fulfillment: {
      order_id: orderId,
      tracking_number: trackingNumber || '',
      tracking_company: trackingCarrier || '',
      line_items: lineItems,
      notify_customer: true,
    },
  };
  return shopifyFetch('/fulfillments.json', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---- Webhooks ----
async function registerWebhook(topic, address) {
  const payload = {
    webhook: { topic, address, format: 'json' },
  };
  return shopifyFetch('/webhooks.json', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function listWebhooks() {
  return shopifyFetch('/webhooks.json');
}

async function deleteWebhook(webhookId) {
  return shopifyFetch(`/webhooks/${webhookId}.json`, { method: 'DELETE' });
}

// ---- Shop info ----
async function getShopInfo() {
  const result = await shopifyFetch('/shop.json');
  return result.shop;
}

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  getOrder,
  createFulfillment,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  getShopInfo,
};