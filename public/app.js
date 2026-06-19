// DCR Clothier — Shared JS (Supabase direct, no backend)

// ─── SUPABASE CLIENT ───────────────────────────────────────────────────────────
function supabaseClient(useServiceKey = false) {
  const key = useServiceKey ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
  return {
    async from(table) {
      return new SupabaseQuery(SUPABASE_URL, key, table);
    }
  };
}

class SupabaseQuery {
  constructor(url, key, table) {
    this.url = url;
    this.key = key;
    this.table = table;
    this.params = [];
    this.headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    this._method = 'GET';
    this._body = null;
    this._single = false;
    this._count = false;
  }

  select(cols = '*', opts = {}) {
    this.params.push(`select=${cols}`);
    if (opts.count) { this._count = true; this.headers['Prefer'] = 'count=exact'; }
    return this;
  }

  insert(data) { this._method = 'POST'; this._body = data; return this; }
  update(data) { this._method = 'PATCH'; this._body = data; return this; }
  upsert(data, opts = {}) {
    this._method = 'POST';
    this._body = data;
    this.headers['Prefer'] = `resolution=merge-duplicates,return=representation`;
    if (opts.onConflict) this.params.push(`on_conflict=${opts.onConflict}`);
    return this;
  }
  delete() { this._method = 'DELETE'; return this; }

  eq(col, val) { this.params.push(`${col}=eq.${encodeURIComponent(val)}`); return this; }
  neq(col, val) { this.params.push(`${col}=neq.${encodeURIComponent(val)}`); return this; }
  in(col, vals) { this.params.push(`${col}=in.(${vals.join(',')})`); return this; }
  ilike(col, val) { this.params.push(`${col}=ilike.${encodeURIComponent(val)}`); return this; }
  or(expr) { this.params.push(`or=(${expr})`); return this; }
  order(col, opts = {}) { this.params.push(`order=${col}.${opts.ascending ? 'asc' : 'desc'}`); return this; }
  limit(n) { this.params.push(`limit=${n}`); return this; }
  range(from, to) { this.params.push(`offset=${from}&limit=${to - from + 1}`); return this; }
  single() { this._single = true; this.headers['Accept'] = 'application/vnd.pgrst.object+json'; return this; }

  async execute() {
    const qs = this.params.length ? '?' + this.params.join('&') : '';
    const res = await fetch(`${this.url}/rest/v1/${this.table}${qs}`, {
      method: this._method,
      headers: this.headers,
      body: this._body ? JSON.stringify(this._body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) return { data: null, error: data };
    if (this._count) return { data, count: Number(res.headers.get('content-range')?.split('/')[1]) || 0, error: null };
    return { data: this._single ? data : (Array.isArray(data) ? data : [data]), error: null };
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

// ─── DB HELPERS ────────────────────────────────────────────────────────────────
const db = {
  async getProducts(filters = {}) {
    let q = new SupabaseQuery(SUPABASE_URL, SUPABASE_ANON_KEY, 'products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (filters.category) q.eq('category', filters.category);
    if (filters.featured) q.eq('featured', true);
    if (filters.limit) q.limit(filters.limit);
    const { data, error } = await q;
    return error ? [] : data;
  },

  async getProduct(slug) {
    const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_ANON_KEY, 'products')
      .select('*').eq('slug', slug).eq('active', true).single();
    return error ? null : data;
  },

  async createOrder(order) {
    const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'orders')
      .insert(order).single();
    return { data, error };
  },

  async getOrder(orderNumber) {
    const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_ANON_KEY, 'orders')
      .select('id,order_number,status,items,total,created_at,customer_name')
      .eq('order_number', orderNumber).single();
    return { data, error };
  },

  async subscribe(email) {
    const { error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_ANON_KEY, 'subscribers')
      .upsert({ email }, { onConflict: 'email' });
    return !error;
  },

  // Admin only
  async getAllProducts() {
    const { data } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'products')
      .select('*').order('created_at', { ascending: false });
    return data || [];
  },

  async getAllOrders(status = '') {
    let q = new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'orders')
      .select('*').order('created_at', { ascending: false });
    if (status) q.eq('status', status);
    const { data } = await q;
    return data || [];
  },

  async updateOrder(id, updates) {
    const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'orders')
      .update(updates).eq('id', id).single();
    return { data, error };
  },

  async saveProduct(product, id = null) {
    if (id) {
      const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'products')
        .update(product).eq('id', id).single();
      return { data, error };
    } else {
      const { data, error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'products')
        .insert(product).single();
      return { data, error };
    }
  },

  async deleteProduct(id) {
    const { error } = await new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'products')
      .update({ active: false }).eq('id', id);
    return !error;
  },

  async getStats() {
    const [ordersRes, prodsRes, subsRes] = await Promise.all([
      new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'orders').select('total,status'),
      new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'products').select('id').eq('active', true),
      new SupabaseQuery(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'subscribers').select('id').eq('active', true),
    ]);
    const orders = ordersRes.data || [];
    const revenue = orders.filter(o => ['paid','delivered'].includes(o.status)).reduce((s,o) => s + o.total, 0);
    return {
      total_orders: orders.length,
      paid_orders: orders.filter(o => ['paid','processing','shipped','delivered'].includes(o.status)).length,
      pending_orders: orders.filter(o => o.status === 'pending').length,
      total_revenue: revenue,
      active_products: (prodsRes.data || []).length,
      subscribers: (subsRes.data || []).length,
    };
  }
};

// ─── PAYSTACK ──────────────────────────────────────────────────────────────────
function paystackPay({ email, amount, orderNumber, onSuccess, onClose }) {
  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email,
    amount: Math.round(amount * 100), // kobo
    ref: orderNumber,
    currency: 'NGN',
    callback: (response) => onSuccess && onSuccess(response),
    onClose: () => onClose && onClose(),
  });
  handler.openIframe();
}

// ─── ORDER NUMBER ──────────────────────────────────────────────────────────────
function genOrderNumber() {
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DCR-${date}-${rand}`;
}

// ─── CART ──────────────────────────────────────────────────────────────────────
const Cart = {
  get() {
    try { return JSON.parse(localStorage.getItem('dcr_cart') || '[]'); }
    catch { return []; }
  },
  save(items) {
    localStorage.setItem('dcr_cart', JSON.stringify(items));
    Cart.updateCount();
    window.dispatchEvent(new Event('cart-updated'));
  },
  add(product, size, quantity = 1) {
    const items = Cart.get();
    const key = `${product.id}_${size}`;
    const existing = items.find(i => i.key === key);
    if (existing) existing.quantity += quantity;
    else items.push({ key, product_id: product.id, name: product.name, price: product.price, image: product.images?.[0] || '', size, quantity });
    Cart.save(items);
    showToast(`${product.name} added to bag`);
  },
  remove(key) { Cart.save(Cart.get().filter(i => i.key !== key)); },
  update(key, qty) {
    const items = Cart.get();
    const item = items.find(i => i.key === key);
    if (item) { if (qty <= 0) return Cart.remove(key); item.quantity = qty; Cart.save(items); }
  },
  total() { return Cart.get().reduce((s, i) => s + i.price * i.quantity, 0); },
  count() { return Cart.get().reduce((s, i) => s + i.quantity, 0); },
  clear() { localStorage.removeItem('dcr_cart'); Cart.updateCount(); },
  updateCount() {
    document.querySelectorAll('.cart-count').forEach(el => {
      const c = Cart.count();
      el.textContent = c;
      el.style.display = c > 0 ? 'flex' : 'none';
    });
  },
};

// ─── UTILS ─────────────────────────────────────────────────────────────────────
function showToast(msg, dur = 3000) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), dur);
}

function formatPrice(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

function productCardHTML(p) {
  const img = p.images?.[0] || 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600';
  return `
    <a href="/product.html?slug=${p.slug}" class="product-card">
      <div class="product-card-img">
        <img src="${img}" alt="${p.name}" loading="lazy">
        ${p.featured ? '<div class="product-card-badge">Featured</div>' : ''}
        <div class="product-card-quick">Quick View</div>
      </div>
      <div class="product-card-info">
        <div>
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-cat">${p.category}</div>
        </div>
        <div class="product-card-price">${formatPrice(p.price)}</div>
      </div>
    </a>`;
}

function initNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  if (nav.classList.contains('has-hero')) {
    const toggle = () => nav.classList.toggle('transparent', window.scrollY < 60);
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
  }
  Cart.updateCount();
}

function renderNav(activePage = '') {
  return `
  <nav class="site-nav${activePage === 'home' ? ' has-hero transparent' : ''}">
    <a href="/index.html" class="nav-logo">DCR<span>Clothier</span></a>
    <ul class="nav-center">
      <li><a href="/shop.html" class="nav-link${activePage === 'shop' ? ' active' : ''}">Shop</a></li>
      <li><a href="/shop.html?cat=outerwear" class="nav-link">Outerwear</a></li>
      <li><a href="/shop.html?cat=tops" class="nav-link">Tops</a></li>
      <li><a href="/shop.html?cat=bottoms" class="nav-link">Bottoms</a></li>
      <li><a href="/shop.html?cat=accessories" class="nav-link">Accessories</a></li>
    </ul>
    <div class="nav-right">
      <a href="/cart.html" class="nav-cart-btn">
        Bag <span class="cart-count" style="display:none">0</span>
      </a>
    </div>
  </nav>`;
}

function renderFooter() {
  return `
  <div class="marquee-bar">
    <div class="marquee-inner">
      <span>DCR Clothier</span><span class="dot">◆</span>
      <span>Lagos, Nigeria</span><span class="dot">◆</span>
      <span>New Arrivals</span><span class="dot">◆</span>
      <span>Premium Streetwear</span><span class="dot">◆</span>
      <span>Limited Drops</span><span class="dot">◆</span>
      <span>Dress With Intent</span><span class="dot">◆</span>
      <span>DCR Clothier</span><span class="dot">◆</span>
      <span>Lagos, Nigeria</span><span class="dot">◆</span>
      <span>New Arrivals</span><span class="dot">◆</span>
      <span>Premium Streetwear</span><span class="dot">◆</span>
      <span>Limited Drops</span><span class="dot">◆</span>
      <span>Dress With Intent</span><span class="dot">◆</span>
    </div>
  </div>
  <footer class="site-footer">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="f-logo">DCR</div>
        <div class="f-sub">Clothier — Lagos</div>
        <p>A curated fashion boutique in Lagos. Every piece is selected with intent — no noise, no compromise.</p>
        <div class="footer-socials">
          <a href="https://instagram.com/dcrclothier" target="_blank">Instagram</a>
          <a href="#">TikTok</a>
          <a href="#">WhatsApp</a>
        </div>
      </div>
      <div class="footer-col">
        <h5>Shop</h5>
        <ul>
          <li><a href="/shop.html">All Pieces</a></li>
          <li><a href="/shop.html?cat=outerwear">Outerwear</a></li>
          <li><a href="/shop.html?cat=tops">Tops</a></li>
          <li><a href="/shop.html?cat=bottoms">Bottoms</a></li>
          <li><a href="/shop.html?cat=accessories">Accessories</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Brand</h5>
        <ul>
          <li><a href="/index.html#about">Our Story</a></li>
          <li><a href="/index.html#store">The Store</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Help</h5>
        <ul>
          <li><a href="#">Sizing Guide</a></li>
          <li><a href="#">Delivery Info</a></li>
          <li><a href="#">Returns</a></li>
          <li><a href="#">Contact Us</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 DCR Clothier. Lagos, Nigeria.</span>
      <span>Built by DCR Agency</span>
    </div>
  </footer>`;
}

document.addEventListener('DOMContentLoaded', initNav);
