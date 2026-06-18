# DCR Clothier — E-commerce Setup Guide

## Stack
- **Frontend**: Plain HTML/CSS/JS (no framework needed)
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **Payments**: Paystack
- **Images**: Cloudinary
- **Email**: Resend
- **Hosting**: Railway (backend) + Netlify (frontend)

---

## Step 1 — Supabase

1. Go to supabase.com → New project
2. Copy the SQL in `schema.sql` and run it in the SQL Editor
3. Get your **Project URL** and **service_role key** from Settings → API

---

## Step 2 — Cloudinary

1. Login to cloudinary.com
2. Create a folder called `dcrclothier/products`
3. Get Cloud Name, API Key, API Secret from Dashboard

---

## Step 3 — Paystack

1. Login to paystack.com
2. Get your **Live Secret Key** and **Live Public Key**
3. Add webhook URL in Dashboard → Settings → Webhooks:
   `https://your-railway-url.railway.app/api/paystack/webhook`

---

## Step 4 — Resend

1. Login to resend.com
2. Add and verify domain: `dcrclothier.com`
3. Get API key
4. Set FROM_EMAIL to `orders@dcrclothier.com`

---

## Step 5 — Backend on Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Set environment variables in Railway dashboard (copy from `.env.example`):
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- PAYSTACK_SECRET_KEY
- PAYSTACK_PUBLIC_KEY
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET
- RESEND_API_KEY
- FROM_EMAIL=orders@dcrclothier.com
- FRONTEND_URL=https://dcrclothier.com
- ADMIN_PASSWORD=your_secure_password

---

## Step 6 — Frontend on Netlify

1. Push the `public/` folder to a GitHub repo
2. Connect repo to Netlify
3. Set publish directory: `public`
4. Add custom domain: `dcrclothier.com`

**Update the API URL in `app.js`:**
```js
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : 'https://your-railway-url.railway.app/api';  // ← update this
```

---

## Step 7 — Product Images

Upload your actual store photos to Cloudinary:
- Go to Cloudinary → Media Library → dcrclothier/products
- Upload each product photo
- Copy the URL and add it when creating products in /admin.html

---

## Admin Access

Go to: `https://dcrclothier.com/admin.html`
Password: whatever you set as `ADMIN_PASSWORD`

From admin you can:
- Add / edit / delete products
- View and update order statuses
- See revenue stats

---

## Local Dev

```bash
npm install
cp .env.example .env
# fill in your .env values
npm run dev
# open http://localhost:3000
```
