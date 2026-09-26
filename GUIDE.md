# Shopify Dropship App — Setup Guide

## What this app does

1. **Import products** into your Shopify store from a custom admin panel
2. **Auto-email suppliers** when customers place orders (Shopify webhook → supplier email)
3. **Sync tracking** — when a supplier replies with tracking, enter it here → it pushes to Shopify and notifies your customer
4. **Manage suppliers** — each product is linked to a supplier with their email and lead-time notes

---

## Step 1: Install

```bash
cd ~/dropship-app
npm install
```

## Step 2: Get your Shopify API tokens

Your store URL is something like `your-store.myshopify.com`.

1. Log in to your **Shopify admin** → `https://your-store.myshopify.com/admin`
2. In the search bar at top, type **"Settings"** → click Settings → **"Apps"** (or go to `https://your-store.myshopify.com/admin/apps`)
3. Scroll down and click **"Develop apps"** (or "Develop apps for your store")
4. Click **"Create app"**
5. Name it "Dropship Fulfillment" → click **Create app**
6. Click **"Configuration"** tab → scroll to **"Admin API integration"** → click **Configure**
7. Select **Read and write** for these scopes:
   - `write_products`, `read_products`
   - `read_orders`, `write_orders`
   - `write_fulfillments`, `read_fulfillments`
   - `read_shop` (for connection test)
8. Click **Save**
9. Scroll back up → under **Admin API access token** → click **Install** (or "Reveal token")
10. Copy the token — it starts with `shpat_` — **this is your SHOPIFY_ADMIN_TOKEN**
11. On the same page, copy the **API key** and **API secret key** (for SHOPIFY_API_KEY / SHOPIFY_API_SECRET)

## Step 3: Configure the app

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `SHOPIFY_SHOP_DOMAIN` — your store (e.g. `your-store.myshopify.com`, no https://)
- `SHOPIFY_ADMIN_TOKEN` — the `shpat_...` token from step 2
- `SHOPIFY_API_KEY` — from step 2
- `SHOPIFY_API_SECRET` — from step 2
- `APP_BASE_URL` — needs to be a public URL for webhooks (see Step 4)
- `APP_ADMIN_PASSWORD` — change from `admin123`

## Step 4: Set up a public URL (for webhooks)

Shopify needs to reach your app over the public internet to send order webhooks.

### Option A: ngrok (easiest for local dev)
```bash
# Install ngrok from https://ngrok.com (free account)
ngrok http 3000
```
Copy the HTTPS URL (e.g. `https://abc123.ngrok.app`) and set it as `APP_BASE_URL` in `.env`.

### Option B: Deploy to a server
Deploy this Node app to any host with a public URL (Render, Railway, a VPS, etc.) and use that URL.

## Step 5: Configure email (SMTP)

The app emails suppliers automatically when orders come in.

### Gmail setup (easiest):
1. Go to https://myaccount.google.com → Security → 2-Step Verification
2. Scroll down → **App passwords** → generate one for "Mail"
3. Use that 16-char password (no spaces) as `SMTP_PASS`
4. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`

### Other providers:
- Outlook/Hotmail: `smtp-mail.outlook.com:587` (SECURE=false)
- SendGrid: `smtp.sendgrid.net:587` (USER=apikey, PASS=your_api_key)
- Resend, Postmark, etc. all have standard SMTP

## Step 6: Start the app

```bash
npm start
```

Open http://localhost:3000 → log in with `admin` / (your APP_ADMIN_PASSWORD)

## Step 7: Register the webhook

1. Go to the **Settings** page in the app
2. Click **"Register Order Webhook"**
3. This tells Shopify: "when a new order is created, POST the order to my webhook URL"

## Step 8: Add suppliers and products

1. Go to **Suppliers** → add each supplier (name, email, lead time)
2. Go to **Products** → add products (title, price, cost, SKU, image URL, link to supplier)
   - Check "Push to Shopify immediately" to create the product in your Shopify store
3. Products appear in your Shopify store for customers to buy

## Step 9: The fulfillment flow

1. Customer buys a product on your Shopify store
2. Shopify sends an `orders/create` webhook to your app
3. Your app:
   - Looks up each line item by SKU or Shopify variant ID
   - Finds the linked supplier
   - Emails the supplier with product details + customer shipping address
   - Logs the email in the Fulfillment page
4. Supplier ships the product and replies with tracking number
5. You enter the tracking number in the app's **Fulfillment** page
6. The app pushes the fulfillment + tracking to Shopify
7. Shopify notifies your customer with the tracking info

## Checklist

- [ ] npm install done
- [ ] Shopify custom app created with API tokens
- [ ] .env filled in (domain, token, base URL, SMTP)
- [ ] ngrok running (or app deployed) — APP_BASE_URL set
- [ ] App started — can log in
- [ ] Dashboard shows "Connected to [your store]"
- [ ] Webhook registered (Settings page)
- [ ] SMTP verified (Settings page shows green)
- [ ] At least one supplier added
- [ ] At least one product added and pushed to Shopify
- [ ] Test: place a test order on your Shopify store → check supplier email arrives