/** Shared UI helpers + header/footer injection used across all pages. */
const BMD = {
  DISCLAIMER:
    'BookMyDayOut is a listing platform only. We do not process bookings or ' +
    'payments for stays. Please contact the vendor directly to confirm availability.',

  escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  money(v, unit) {
    if (v == null) return 'Contact for price';
    const n = Number(v).toLocaleString('en-LK', { maximumFractionDigits: 0 });
    return `LKR ${n}${unit ? ` <small>/ ${BMD.escape(unit)}</small>` : ''}`;
  },

  param(name) {
    return new URLSearchParams(location.search).get(name);
  },

  toast(msg, isError = false) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('error', isError);
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3200);
  },

  statusBadge(status) {
    return `<span class="badge badge-${BMD.escape(status)}">${BMD.escape(status)}</span>`;
  },

  // Clean line-icons per category (no emoji). Falls back to a map pin.
  CATEGORY_ICONS: {
    villas: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    dayouts: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M19 5l-1 1M6 18l-1 1"/>',
    pools: '<path d="M2 16c2 0 2 1.5 4 1.5S8 16 10 16s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5"/><path d="M2 20c2 0 2 1.5 4 1.5S8 20 10 20"/><path d="M7 14V5a2 2 0 0 1 4 0M14 14V7"/>',
    camping: '<path d="M12 4l9 16H3z"/><path d="M12 4v16"/>',
    farms: '<path d="M11 20A7 7 0 0 1 4 13c4 0 7 3 7 7z"/><path d="M13 20a7 7 0 0 1 7-7c0 4-3 7-7 7z"/><path d="M12 20V9"/>',
  },
  icon(slug) {
    const p =
      this.CATEGORY_ICONS[slug] ||
      '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  },

  imageUrl(listing) {
    return (listing.images && listing.images[0] && listing.images[0].storageUrl) ||
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="%23e2e8f0"/><text x="50%" y="50%" fill="%2394a3b8" font-family="sans-serif" font-size="20" text-anchor="middle" dy=".3em">No image</text></svg>'
      );
  },

  listingCard(l) {
    const featured = l.isFeatured ? '<span class="badge badge-featured">★ Featured</span>' : '';
    const verified =
      l.vendor && l.vendor.verificationStatus === 'approved'
        ? '<span class="badge badge-verified">✓ Verified</span>'
        : '';
    return `
      <a class="card" href="/listing/${BMD.escape(l.slug)}">
        <img class="card-img" src="${BMD.escape(BMD.imageUrl(l))}" alt="${BMD.escape(l.title)}" loading="lazy">
        <div class="card-body">
          <div class="row between" style="margin-bottom:6px">${featured}${verified}</div>
          <div class="card-title">${BMD.escape(l.title)}</div>
          <div class="card-meta">
            <span>${BMD.escape(l.district || 'Sri Lanka')}</span>
            ${l.category ? `<span>· ${BMD.escape(l.category.name)}</span>` : ''}
            ${l.capacity ? `<span>· Sleeps ${l.capacity}</span>` : ''}
          </div>
          <div class="card-price">${BMD.money(l.price, l.priceUnit)}</div>
        </div>
      </a>`;
  },

  async mountHeader() {
    const mount = document.getElementById('header');
    if (!mount) return;
    mount.innerHTML = `
      <header class="site-header">
        <div class="container bar">
          <a class="brand" href="/">
            <span>Book<b>MyDayOut</b></span>
          </a>
          <button class="nav-toggle" aria-label="Menu">☰</button>
          <nav class="nav" id="nav-links">
            <a href="/browse.html">Browse</a>
            <a href="/browse.html?category=villas">Villas</a>
            <a href="/browse.html?category=dayouts">Dayouts</a>
            <span id="auth-links"><a href="/login.html">Log in</a></span>
          </nav>
        </div>
      </header>`;

    const toggle = mount.querySelector('.nav-toggle');
    const nav = mount.querySelector('#nav-links');
    toggle.addEventListener('click', () => nav.classList.toggle('open'));

    // Update auth-aware links.
    const render = async () => {
      const slot = document.getElementById('auth-links');
      if (!window.Auth) return;
      const loggedIn = await Auth.onReady();
      if (!loggedIn) {
        slot.innerHTML = '<a href="/login.html">Log in</a>';
        return;
      }
      let role = 'user';
      try {
        const me = await API.get('/auth/me');
        role = (me.data && me.data.role) || 'user';
      } catch { /* ignore */ }

      const dash =
        role === 'admin'
          ? '<a href="/admin/index.html">Admin</a>'
          : role === 'vendor'
            ? '<a href="/vendor/index.html">Dashboard</a>'
            : '<a href="/vendor/index.html">Become a vendor</a>';

      slot.innerHTML = `
        <a href="/favorites.html">Favorites</a>
        ${dash}
        <a href="#" id="logout-link">Log out</a>`;
      document.getElementById('logout-link').addEventListener('click', async (e) => {
        e.preventDefault();
        await Auth.signOut();
        location.href = '/';
      });
    };
    document.addEventListener('auth:changed', render);
    render();
  },

  mountFooter() {
    const mount = document.getElementById('footer');
    if (!mount) return;
    mount.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="brand" style="color:#fff;margin-bottom:8px">
                <span>Book<b style="color:#5eead4">MyDayOut</b></span>
              </div>
              <p class="muted" style="color:#94a3b8;max-width:340px">
                Discover villas, dayouts, pools, camping and farm stays across Sri Lanka.
                Browse freely and contact owners directly.
              </p>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li><a href="/browse.html">All listings</a></li>
                <li><a href="/browse.html?category=villas">Villas</a></li>
                <li><a href="/browse.html?category=dayouts">Dayouts</a></li>
                <li><a href="/browse.html?category=camping">Camping</a></li>
              </ul>
            </div>
            <div>
              <h4>For vendors</h4>
              <ul>
                <li><a href="/vendor/index.html">List your property</a></li>
                <li><a href="/login.html">Vendor login</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-disclaimer">${BMD.DISCLAIMER}</div>
        </div>
      </footer>`;
  },

  init() {
    this.mountHeader();
    this.mountFooter();
  },
};

window.BMD = BMD;
document.addEventListener('DOMContentLoaded', () => BMD.init());
