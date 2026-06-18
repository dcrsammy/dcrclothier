// DCR Clothier — Shared JS
const API = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : '/api';

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
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        key,
        product_id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || '',
        size,
        quantity,
      });
    }
    Cart.save(items);
    showToast(`${product.name} added to cart`);
  },
  remove(key) {
    Cart.save(Cart.get().filter(i => i.key !== key));
  },
  update(key, quantity) {
    const items = Cart.get();
    const item = items.find(i => i.key === key);
    if (item) {
      if (quantity <= 0) return Cart.remove(key);
      item.quantity = quantity;
      Cart.save(items);
    }
  },
  total() {
    return Cart.get().reduce((sum, i) => sum + i.price * i.quantity, 0);
  },
  count() {
    return Cart.get().reduce((sum, i) => sum + i.quantity, 0);
  },
  clear() {
    localStorage.removeItem('dcr_cart');
    Cart.updateCount();
  },
  updateCount() {
    document.querySelectorAll('.cart-count').forEach(el => {
      const count = Cart.count();
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },
};

// ─── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ─── FORMAT PRICE ──────────────────────────────────────────────────────────────
function formatPrice(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

// ─── PRODUCT CARD HTML ─────────────────────────────────────────────────────────
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
    </a>
  `;
}

// ─── NAV SCROLL BEHAVIOR ───────────────────────────────────────────────────────
function initNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;
  const isHero = nav.classList.contains('has-hero');
  if (isHero) {
    const toggle = () => {
      nav.classList.toggle('transparent', window.scrollY < 60);
    };
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
  }
  Cart.updateCount();
}

// ─── SHARED FOOTER + NAV RENDER ───────────────────────────────────────────────
function renderNav(activePage = '') {
  return `
  <nav class="site-nav${activePage === 'home' ? ' has-hero transparent' : ''}">
    <a href="/index.html" class="nav-logo">DCR<span>Clothier</span></a>
    <ul class="nav-center">
      <li><a href="/shop.html" class="nav-link${activePage === 'shop' ? ' active' : ''}">Shop</a></li>
      <li><a href="/shop.html?cat=new" class="nav-link">New In</a></li>
      <li><a href="/shop.html?cat=outerwear" class="nav-link">Outerwear</a></li>
      <li><a href="/shop.html?cat=tops" class="nav-link">Tops</a></li>
      <li><a href="/shop.html?cat=bottoms" class="nav-link">Bottoms</a></li>
    </ul>
    <div class="nav-right">
      <a href="/cart.html" class="nav-cart-btn">
        Bag
        <span class="cart-count" style="display:none">0</span>
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
          <a href="#">Instagram</a>
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
          <li><a href="/shop.html?featured=true">Lookbook</a></li>
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

// Init on DOM ready
document.addEventListener('DOMContentLoaded', initNav);
