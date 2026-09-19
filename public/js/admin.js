/** Admin panel controller. Requires the signed-in user to have role 'admin'. */
(function () {
  const panel = document.getElementById('panel');
  const tabsEl = document.getElementById('tabs');

  const TABS = [
    ['dashboard', 'Dashboard'],
    ['listings', 'Listings'],
    ['vendors', 'Vendors'],
    ['reports', 'Reports'],
    ['categories', 'Categories'],
    ['amenities', 'Amenities'],
    ['districts', 'Districts'],
    ['plans', 'Plans'],
    ['banners', 'Banners'],
    ['users', 'Users'],
  ];

  const esc = BMD.escape;
  const err = (e) => BMD.toast(e.message || 'Error', true);

  function setTab(key) {
    tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === key));
    location.hash = key;
    (RENDER[key] || RENDER.dashboard)();
  }

  function renderTabs() {
    tabsEl.innerHTML = TABS.map(([k, label]) =>
      `<button class="tab" data-tab="${k}">${label}</button>`).join('');
    tabsEl.querySelectorAll('.tab').forEach((t) => (t.onclick = () => setTab(t.dataset.tab)));
  }

  // ---- Dashboard ----
  async function dashboard() {
    panel.innerHTML = '<div class="spinner"></div>';
    try {
      const { data: s } = await API.get('/admin/stats');
      const cards = [
        ['Total listings', s.totalListings], ['Pending review', s.pendingListings],
        ['Approved (live)', s.approvedListings], ['Total vendors', s.totalVendors],
        ['Pending vendors', s.pendingVendors], ['Total users', s.totalUsers],
        ['Active subscriptions', s.activeSubscriptions], ['Open reports', s.openReports],
      ];
      panel.innerHTML = `<div class="stat-grid">${cards.map(([l, n]) =>
        `<div class="stat"><div class="num">${n}</div><div class="label">${l}</div></div>`).join('')}</div>`;
    } catch (e) { panel.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // ---- Listings verification ----
  async function listings() {
    panel.innerHTML = `
      <div class="panel"><div class="panel-head">
        <h2>Listings</h2>
        <select id="l-status" style="max-width:200px">
          <option value="pending">Pending review</option>
          <option value="">All</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="draft">Draft</option>
        </select>
      </div><div class="panel-body" id="l-body"><div class="spinner"></div></div></div>`;
    const load = async () => {
      const status = document.getElementById('l-status').value;
      const body = document.getElementById('l-body');
      body.innerHTML = '<div class="spinner"></div>';
      try {
        const { data } = await API.get(`/admin/listings?${status ? 'status=' + status : ''}`);
        body.innerHTML = data.length ? `<div style="overflow-x:auto"><table class="data">
          <thead><tr><th>Title</th><th>Vendor</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${data.map((l) => `<tr>
            <td><a href="/listing/${esc(l.slug)}" target="_blank">${esc(l.title)}</a><br>
              <span class="muted" style="font-size:0.8rem">${esc(l.district || '')} · ${l.images.length} img</span></td>
            <td>${esc(l.vendor?.businessName || '—')}</td>
            <td>${BMD.statusBadge(l.status)}</td>
            <td class="row">
              <button class="btn btn-primary btn-sm" data-approve="${l.id}">Approve</button>
              <button class="btn btn-outline btn-sm" data-reject="${l.id}">Reject</button>
              <button class="btn btn-ghost btn-sm" data-feature="${l.id}" data-on="${l.isFeatured}">${l.isFeatured ? 'Unfeature' : 'Feature'}</button>
              <button class="btn btn-danger btn-sm" data-suspend="${l.id}">Suspend</button>
            </td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">No listings.</div>';
        wire(body, load);
      } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    };
    document.getElementById('l-status').onchange = load;
    load();

    function wire(scope, reload) {
      scope.querySelectorAll('[data-approve]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/listings/${b.dataset.approve}/approve`); BMD.toast('Approved'); reload(); } catch (e) { err(e); }
      });
      scope.querySelectorAll('[data-reject]').forEach((b) => b.onclick = async () => {
        const reason = prompt('Rejection reason (sent to vendor):');
        if (!reason) return;
        try { await API.post(`/admin/listings/${b.dataset.reject}/reject`, { reason }); BMD.toast('Rejected'); reload(); } catch (e) { err(e); }
      });
      scope.querySelectorAll('[data-feature]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/listings/${b.dataset.feature}/feature`, { isFeatured: b.dataset.on !== 'true' }); BMD.toast('Updated'); reload(); } catch (e) { err(e); }
      });
      scope.querySelectorAll('[data-suspend]').forEach((b) => b.onclick = async () => {
        if (!confirm('Suspend this listing?')) return;
        try { await API.post(`/admin/listings/${b.dataset.suspend}/suspend`); BMD.toast('Suspended'); reload(); } catch (e) { err(e); }
      });
    }
  }

  // ---- Vendors ----
  async function vendors() {
    panel.innerHTML = '<div class="panel"><div class="panel-head"><h2>Vendors</h2></div><div class="panel-body" id="v-body"><div class="spinner"></div></div></div>';
    const body = document.getElementById('v-body');
    try {
      const [{ data }, plansRes] = await Promise.all([API.get('/admin/vendors'), API.get('/admin/plans')]);
      const plans = plansRes.data;
      body.innerHTML = data.length ? `<div style="overflow-x:auto"><table class="data">
        <thead><tr><th>Business</th><th>Contact</th><th>Verify</th><th>Subscription</th><th></th></tr></thead>
        <tbody>${data.map((v) => `<tr>
          <td><strong>${esc(v.businessName || '—')}</strong><br><span class="muted" style="font-size:0.8rem">${esc(v.user?.email || '')} · ${v._count.listings} listings</span></td>
          <td>${esc(v.contactNumber || '')}</td>
          <td>${BMD.statusBadge(v.verificationStatus === 'approved' ? 'approved' : v.verificationStatus === 'rejected' ? 'rejected' : 'pending')}</td>
          <td>${esc(v.subscriptionPlan?.name || 'None')} · <span class="muted">${esc(v.subscriptionStatus)}</span></td>
          <td class="row">
            <button class="btn btn-primary btn-sm" data-vok="${v.id}">Approve</button>
            <button class="btn btn-outline btn-sm" data-vno="${v.id}">Reject</button>
            <select class="btn-sm" data-plan="${v.id}" style="width:auto">
              <option value="">Activate plan…</option>
              ${plans.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
            </select>
          </td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No vendors.</div>';

      body.querySelectorAll('[data-vok]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/vendors/${b.dataset.vok}/verify`, { status: 'approved' }); BMD.toast('Vendor approved'); vendors(); } catch (e) { err(e); }
      });
      body.querySelectorAll('[data-vno]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/vendors/${b.dataset.vno}/verify`, { status: 'rejected' }); BMD.toast('Vendor rejected'); vendors(); } catch (e) { err(e); }
      });
      body.querySelectorAll('[data-plan]').forEach((s) => s.onchange = async () => {
        if (!s.value) return;
        try {
          await API.post(`/admin/vendors/${s.dataset.plan}/subscription`, { planId: s.value, status: 'active' });
          BMD.toast('Subscription activated'); vendors();
        } catch (e) { err(e); }
      });
    } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // ---- Reports ----
  async function reports() {
    panel.innerHTML = '<div class="panel"><div class="panel-head"><h2>Reported listings</h2></div><div class="panel-body" id="r-body"><div class="spinner"></div></div></div>';
    const body = document.getElementById('r-body');
    try {
      const { data } = await API.get('/admin/reports?status=open');
      body.innerHTML = data.length ? `<table class="data">
        <thead><tr><th>Listing</th><th>Reason</th><th>By</th><th>Actions</th></tr></thead>
        <tbody>${data.map((r) => `<tr>
          <td><a href="/listing/${esc(r.listing?.slug)}" target="_blank">${esc(r.listing?.title || '—')}</a></td>
          <td>${esc(r.reason || '')}</td>
          <td class="muted">${esc(r.reporter?.email || 'guest')}</td>
          <td class="row">
            <button class="btn btn-outline btn-sm" data-dismiss="${r.id}">Dismiss</button>
            <button class="btn btn-danger btn-sm" data-remove="${r.id}">Suspend listing</button>
          </td></tr>`).join('')}</tbody></table>` : '<div class="empty">No open reports.</div>';
      body.querySelectorAll('[data-dismiss]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/reports/${b.dataset.dismiss}/action`, { status: 'dismissed' }); BMD.toast('Dismissed'); reports(); } catch (e) { err(e); }
      });
      body.querySelectorAll('[data-remove]').forEach((b) => b.onclick = async () => {
        try { await API.post(`/admin/reports/${b.dataset.remove}/action`, { status: 'actioned', removeListing: true }); BMD.toast('Listing suspended'); reports(); } catch (e) { err(e); }
      });
    } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  // ---- Generic simple CRUD (categories, amenities, districts, banners) ----
  function crud(cfg) {
    return async function () {
      panel.innerHTML = `<div class="panel"><div class="panel-head"><h2>${cfg.title}</h2></div>
        <div class="panel-body">
          <form class="row mb-2" id="crud-form">${cfg.fields.map((f) =>
            f.type === 'checkbox'
              ? `<label class="row" style="gap:6px"><input type="checkbox" id="cf-${f.key}" style="width:auto"> ${f.label}</label>`
              : `<input id="cf-${f.key}" placeholder="${f.label}" ${f.required ? 'required' : ''} style="max-width:${f.wide ? '320' : '200'}px">`
          ).join('')}<button class="btn btn-primary" type="submit">Add</button></form>
          <div id="crud-list"><div class="spinner"></div></div>
        </div></div>`;
      const list = document.getElementById('crud-list');
      const load = async () => {
        list.innerHTML = '<div class="spinner"></div>';
        try {
          const { data } = await API.get(cfg.path);
          list.innerHTML = data.length ? `<table class="data"><tbody>${data.map((row) => `<tr>
            <td>${cfg.display(row)}</td>
            <td style="text-align:right"><button class="btn btn-danger btn-sm" data-del="${row.id}">${cfg.deleteLabel || 'Delete'}</button></td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty">Nothing yet.</div>';
          list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (!confirm('Are you sure?')) return;
            try { await API.del(`${cfg.path}/${b.dataset.del}`); BMD.toast('Done'); load(); } catch (e) { err(e); }
          });
        } catch (e) { list.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      };
      document.getElementById('crud-form').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {};
        for (const f of cfg.fields) {
          const el = document.getElementById(`cf-${f.key}`);
          const val = f.type === 'checkbox' ? el.checked : (f.number ? Number(el.value) : el.value.trim());
          if (val !== '' && val != null) payload[f.key] = val;
        }
        try { await API.post(cfg.path, payload); BMD.toast('Added'); e.target.reset(); load(); } catch (er) { err(er); }
      };
      load();
    };
  }

  // ---- Plans (has more fields) ----
  const plans = crud({
    title: 'Subscription plans', path: '/admin/plans', deleteLabel: 'Deactivate',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'price', label: 'Price (LKR)', number: true },
      { key: 'durationDays', label: 'Duration (days)', number: true },
      { key: 'listingLimit', label: 'Listing limit', number: true },
      { key: 'featuredIncluded', label: 'Featured', type: 'checkbox' },
    ],
    display: (p) => `<strong>${esc(p.name)}</strong> — LKR ${Number(p.price).toLocaleString()} / ${p.durationDays}d · ${p.listingLimit >= 9999 ? '∞' : p.listingLimit} listings ${p.featuredIncluded ? '· ★' : ''} ${p.isActive ? '' : '<span class="badge badge-draft">inactive</span>'}`,
  });

  // ---- Users ----
  async function users() {
    panel.innerHTML = `<div class="panel"><div class="panel-head"><h2>Users</h2>
      <input id="u-q" placeholder="Search email/name" style="max-width:240px"></div>
      <div class="panel-body" id="u-body"><div class="spinner"></div></div></div>`;
    const body = document.getElementById('u-body');
    const load = async () => {
      const q = document.getElementById('u-q').value.trim();
      body.innerHTML = '<div class="spinner"></div>';
      try {
        const { data } = await API.get(`/admin/users${q ? '?q=' + encodeURIComponent(q) : ''}`);
        body.innerHTML = `<table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>${data.map((u) => `<tr>
            <td>${esc(u.name || '—')}</td><td>${esc(u.email || '')}</td>
            <td><select data-role="${u.id}" style="width:auto">
              ${['user', 'vendor', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select></td></tr>`).join('')}</tbody></table>`;
        body.querySelectorAll('[data-role]').forEach((s) => s.onchange = async () => {
          try { await API.post(`/admin/users/${s.dataset.role}/role`, { role: s.value }); BMD.toast('Role updated'); } catch (e) { err(e); }
        });
      } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    };
    let t; document.getElementById('u-q').oninput = () => { clearTimeout(t); t = setTimeout(load, 300); };
    load();
  }

  const RENDER = {
    dashboard, listings, vendors, reports, plans, users,
    categories: crud({
      title: 'Categories', path: '/admin/categories',
      fields: [{ key: 'name', label: 'Name', required: true }, { key: 'icon', label: 'Icon' }],
      display: (c) => `${esc(c.name)} <span class="muted">(${esc(c.slug)})</span> ${c.isActive ? '' : '<span class="badge badge-draft">inactive</span>'}`,
    }),
    amenities: crud({
      title: 'Amenities', path: '/admin/amenities',
      fields: [{ key: 'name', label: 'Name', required: true }, { key: 'icon', label: 'Icon' }],
      display: (a) => `${esc(a.name)} <span class="muted">(${esc(a.slug)})</span>`,
    }),
    districts: crud({
      title: 'Districts', path: '/admin/districts',
      fields: [{ key: 'name', label: 'District name', required: true }],
      display: (d) => `${esc(d.name)} ${d.isActive ? '' : '<span class="badge badge-draft">inactive</span>'}`,
    }),
    banners: crud({
      title: 'Site banners', path: '/admin/banners',
      fields: [{ key: 'message', label: 'Message', required: true, wide: true }, { key: 'linkUrl', label: 'Link URL (optional)', wide: true }],
      display: (b) => `${esc(b.message)} ${b.isActive ? '' : '<span class="badge badge-draft">inactive</span>'}`,
    }),
  };

  // ---- Boot: gate on admin role ----
  (async () => {
    const user = await Auth.requireUser();
    if (!user) return;
    try {
      const me = await API.get('/auth/me');
      if (!me.data || me.data.role !== 'admin') {
        panel.innerHTML = '<div class="empty">Access denied. This area is for administrators only.</div>';
        return;
      }
    } catch {
      panel.innerHTML = '<div class="empty">Could not verify admin access.</div>';
      return;
    }
    renderTabs();
    const initial = (location.hash || '#dashboard').slice(1);
    setTab(TABS.some((t) => t[0] === initial) ? initial : 'dashboard');
  })();
})();
