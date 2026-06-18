require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const crypto = require('crypto');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Multer (memory storage for Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.static('public'));

// Raw body for Paystack webhook verification
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));

// ─── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', brand: 'DCR Clothier' });
});

// ─── PRODUCTS ──────────────────────────────────────────────────────────────────

// GET all products (with optional filters)
app.get('/api/products', async (req, res) => {
  try {
    const { category, gender, featured, search, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (category) query = query.eq('category', category);
    if (gender && gender !== 'all') query = query.or(`gender.eq.${gender},gender.eq.unisex`);
    if (featured === 'true') query = query.eq('featured', true);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ products: data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product by slug
app.get('/api/products/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ORDERS ────────────────────────────────────────────────────────────────────

// POST create order + initialize Paystack payment
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_email, customer_phone, delivery_address, items, notes } = req.body;

    if (!customer_name || !customer_email || !customer_phone || !items?.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate totals from DB (never trust frontend prices)
    const productIds = items.map(i => i.product_id);
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, price, images, sizes, stock')
      .in('id', productIds);

    if (prodErr) throw prodErr;

    let subtotal = 0;
    const orderItems = items.map(item => {
      const product = products.find(p => p.id === item.product_id);
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      return {
        product_id: item.product_id,
        name: product.name,
        size: item.size,
        quantity: item.quantity,
        price: product.price,
        line_total: lineTotal,
        image: product.images[0] || null,
      };
    });

    // Delivery fee logic (Lagos flat rate)
    const delivery_fee = delivery_address?.city?.toLowerCase().includes('lagos') ? 3000 : 5000;
    const total = subtotal + delivery_fee;

    // Create order in DB
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        customer_name,
        customer_email,
        customer_phone,
        delivery_address,
        items: orderItems,
        subtotal,
        delivery_fee,
        total,
        notes,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Initialize Paystack transaction
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: customer_email,
        amount: Math.round(total * 100), // kobo
        reference: order.order_number,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_name,
        },
        callback_url: `${process.env.FRONTEND_URL}/order-success.html?ref=${order.order_number}`,
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    res.json({
      order_id: order.id,
      order_number: order.order_number,
      payment_url: paystackRes.data.data.authorization_url,
      access_code: paystackRes.data.data.access_code,
      total,
    });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET order status
app.get('/api/orders/:order_number', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, items, total, created_at, customer_name')
      .eq('order_number', req.params.order_number)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────────
app.post('/api/paystack/webhook', async (req, res) => {
  try {
    // Verify signature
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body);

    if (event.event === 'charge.success') {
      const reference = event.data.reference;

      // Update order status
      const { data: order, error } = await supabase
        .from('orders')
        .update({ status: 'paid', paystack_reference: reference, paystack_verified: true })
        .eq('order_number', reference)
        .select()
        .single();

      if (!error && order) {
        // Send confirmation email
        await sendOrderConfirmation(order);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── EMAIL ─────────────────────────────────────────────────────────────────────
async function sendOrderConfirmation(order) {
  try {
    const itemsList = order.items.map(item =>
      `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.name} (${item.size})</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">x${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">₦${item.line_total.toLocaleString()}</td>
      </tr>`
    ).join('');

    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: order.customer_email,
      subject: `Order Confirmed — ${order.order_number} | DCR Clothier`,
      html: `
        <div style="font-family:'Helvetica Neue',sans-serif;max-width:600px;margin:0 auto;background:#fff;">
          <div style="background:#0A0A0A;padding:32px;text-align:center;">
            <h1 style="color:#C9A84C;font-size:28px;letter-spacing:0.2em;margin:0;">DCR CLOTHIER</h1>
          </div>
          <div style="padding:40px 32px;">
            <h2 style="font-size:22px;margin-bottom:8px;">Order Confirmed</h2>
            <p style="color:#666;margin-bottom:24px;">Hi ${order.customer_name}, your order is confirmed. We'll begin processing right away.</p>
            <div style="background:#f9f9f9;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#999;letter-spacing:0.1em;text-transform:uppercase;">Order Number</p>
              <p style="margin:0;font-size:20px;font-weight:600;color:#0A0A0A;">${order.order_number}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <thead>
                <tr style="border-bottom:2px solid #0A0A0A;">
                  <th style="text-align:left;padding-bottom:8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Item</th>
                  <th style="text-align:center;padding-bottom:8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Qty</th>
                  <th style="text-align:right;padding-bottom:8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Price</th>
                </tr>
              </thead>
              <tbody>${itemsList}</tbody>
            </table>
            <div style="border-top:2px solid #0A0A0A;padding-top:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span>Subtotal</span><span>₦${order.subtotal.toLocaleString()}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                <span>Delivery</span><span>₦${order.delivery_fee.toLocaleString()}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;">
                <span>Total</span><span>₦${order.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div style="background:#0A0A0A;padding:24px;text-align:center;">
            <p style="color:#C9A84C;font-size:11px;letter-spacing:0.2em;margin:0;">LAGOS · DCRCLOTHIER.COM</p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ─── NEWSLETTER ────────────────────────────────────────────────────────────────
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { error } = await supabase
      .from('subscribers')
      .upsert({ email }, { onConflict: 'email' });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ─────────────────────────────────────────────────────────────────────

// Middleware: simple admin auth
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST upload image to Cloudinary
app.post('/api/admin/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'dcrclothier/products', quality: 'auto', fetch_format: 'auto' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create product
app.post('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update product
app.patch('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product (soft delete)
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all orders (admin)
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update order status
app.patch('/api/admin/orders/:id', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: req.body.status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET dashboard stats (admin)
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [ordersRes, productsRes, subscribersRes] = await Promise.all([
      supabase.from('orders').select('total, status'),
      supabase.from('products').select('id', { count: 'exact' }).eq('active', true),
      supabase.from('subscribers').select('id', { count: 'exact' }).eq('active', true),
    ]);

    const orders = ordersRes.data || [];
    const revenue = orders.filter(o => o.status === 'paid' || o.status === 'delivered').reduce((sum, o) => sum + o.total, 0);
    const pending = orders.filter(o => o.status === 'pending').length;
    const paid = orders.filter(o => ['paid','processing','shipped','delivered'].includes(o.status)).length;

    res.json({
      total_orders: orders.length,
      paid_orders: paid,
      pending_orders: pending,
      total_revenue: revenue,
      active_products: productsRes.count || 0,
      subscribers: subscribersRes.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`DCR Clothier server running on port ${PORT}`));
