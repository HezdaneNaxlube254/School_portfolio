// js/admin-dashboard.js
// Admin dashboard logic. Requires auth.js, supabase-client.js loaded first.

(function () {
  if (!window.supabaseClient || !window.KaynAuth) return;
  const sb = window.supabaseClient;
  const Auth = window.KaynAuth;

  let me = null;               // current admin profile
  let clientsCache = [];       // cached for selects

  // ============================================================
  // Utilities
  // ============================================================
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const fmtMoney = (n, c='KES') => `${c} ${Number(n||0).toLocaleString('en-KE', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

  const toast = (msg, isError = false) => {
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  const loadingCard = () => `<div class="empty"><span class="loader"></span> Loading…</div>`;
  const emptyCard = (msg) => `<div class="empty">${esc(msg)}</div>`;
  const errorCard = (msg) => `<div class="auth-error">${esc(msg)}</div>`;

  // ============================================================
  // Boot
  // ============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    me = await Auth.requireAuth('admin');
    if (!me) return;  // requireAuth already redirected

    $('#adminName').textContent = me.full_name || me.email;

    $('#btnSignOut').addEventListener('click', async () => {
      await Auth.signOut();
      Auth.goToLogin();
    });

    $$('#dashNav button').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });

    switchTab('overview');
  });

  function switchTab(tab, btnEl) {
    $$('#dashNav button').forEach(b => b.classList.toggle('active', b === btnEl));
    const titles = {
      overview:  ['Overview', 'A snapshot of your clients and their websites.'],
      clients:   ['Clients', 'Invite and manage client accounts.'],
      websites:  ['Websites', 'Every website you manage, assigned to its owner.'],
      plans:     ['Subscription Plans', 'What each client is on, and when it renews.'],
      payments:  ['Payments', 'Manually recorded payments. No automatic verification.'],
      updates:   ['Project Updates', 'Milestones and progress notes for clients.'],
      documents: ['Documents', 'Links and files shared with specific clients.'],
      support:   ['Support Requests', 'Every ticket from every client.']
    };
    const [title, sub] = titles[tab] || ['', ''];
    $('#tabTitle').textContent = title;
    $('#tabSub').textContent   = sub;

    const loaders = {
      overview:  renderOverview,
      clients:   renderClients,
      websites:  renderWebsites,
      plans:     renderPlans,
      payments:  renderPayments,
      updates:   renderUpdates,
      documents: renderDocuments,
      support:   renderSupport
    };
    (loaders[tab] || renderOverview)();
  }

  // ============================================================
  // Overview
  // ============================================================
  async function renderOverview() {
    $('#tabContent').innerHTML = loadingCard();

    const [clients, websites, plans, reqs] = await Promise.all([
      sb.from('profiles').select('id', { count:'exact', head:true }).eq('role','client'),
      sb.from('websites').select('id', { count:'exact', head:true }),
      sb.from('plans').select('id, price, next_renewal, status', { count:'exact' }),
      sb.from('support_requests').select('id, status')
    ]);

    const today = new Date(); today.setHours(0,0,0,0);
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14);

    const plansArr = plans.data || [];
    const activePlans = plansArr.filter(p => p.status === 'active').length;
    const upcoming = plansArr.filter(p =>
      p.next_renewal && new Date(p.next_renewal) >= today && new Date(p.next_renewal) <= in14
    ).length;
    const overdue = plansArr.filter(p =>
      p.next_renewal && new Date(p.next_renewal) < today && p.status === 'active'
    ).length;

    const reqArr = reqs.data || [];
    const openReqs = reqArr.filter(r => r.status === 'open' || r.status === 'in_progress').length;

    const mrr = plansArr
      .filter(p => p.status === 'active')
      .reduce((sum, p) => sum + Number(p.price || 0), 0);

    $('#tabContent').innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><p class="value">${clients.count ?? 0}</p><p class="label">Clients</p></div>
        <div class="stat-box"><p class="value">${websites.count ?? 0}</p><p class="label">Websites</p></div>
        <div class="stat-box"><p class="value">${activePlans}</p><p class="label">Active Plans</p></div>
        <div class="stat-box"><p class="value">${openReqs}</p><p class="label">Open Requests</p></div>
        <div class="stat-box"><p class="value">${upcoming}</p><p class="label">Renewals in 14 days</p></div>
        <div class="stat-box"><p class="value">${overdue}</p><p class="label">Overdue</p></div>
        <div class="stat-box"><p class="value">${fmtMoney(mrr)}</p><p class="label">Active Plan Value</p></div>
      </div>
    `;
  }

  // ============================================================
  // Clients
  // ============================================================
  async function renderClients() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('profiles')
      .select('id, email, full_name, phone, role, created_at')
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    clientsCache = (data || []).filter(p => p.role === 'client');

    const rows = clientsCache.map(c => `
      <tr>
        <td>${esc(c.full_name || '—')}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone || '—')}</td>
        <td>${fmtDate(c.created_at)}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">No clients yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Invite a Client</h2>
        <p class="card-meta">Creates their account and generates a one-time sign-in link. You forward the link by WhatsApp or email — we do not rely on Supabase's free-tier SMTP.</p>
        <form id="inviteForm" class="form-grid">
          <div class="form-row">
            <label><span>Full Name</span><input type="text" id="invName" required></label>
            <label><span>Email</span><input type="email" id="invEmail" required></label>
          </div>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Send Invite</span></button>
          </div>
          <div id="inviteResult" class="invite-result" hidden></div>
        </form>
      </div>

      <div class="card">
        <h2>All Clients (${clientsCache.length})</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    $('#inviteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#inviteForm button[type=submit]');
      const label = btn.querySelector('.btn-label');
      const result = $('#inviteResult');
      btn.disabled = true; label.textContent = 'Creating…';
      result.hidden = true;

      const full_name = $('#invName').value.trim();
      const email     = $('#invEmail').value.trim();

      const session = await Auth.getSession();
      const token = session?.access_token;
      if (!token) { btn.disabled = false; label.textContent = 'Send Invite';
        toast('Session expired. Please sign in again.', true); return; }

      let resp, json;
      try {
        resp = await fetch('/.netlify/functions/admin-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ email, full_name })
        });
        json = await resp.json();
      } catch (err) {
        btn.disabled = false; label.textContent = 'Send Invite';
        toast('Could not reach the invite function.', true); return;
      }

      btn.disabled = false; label.textContent = 'Send Invite';

      if (!resp.ok || !json.ok) {
        result.hidden = false;
        result.style.color = 'var(--color-accent)';
        result.textContent = json.error || 'Invite failed.';
        return;
      }

      result.hidden = false;
      result.style.color = '';
      result.innerHTML = json.login_link
        ? `✅ Account created for <strong>${esc(email)}</strong>.<br>
           Send them this one-time sign-in link (valid ~1 hour):<br>
           <a href="${esc(json.login_link)}" target="_blank" rel="noopener">${esc(json.login_link)}</a>`
        : `✅ Account created for <strong>${esc(email)}</strong>. No link generated — ask them to use "Forgot your password" on the login page.`;

      $('#invName').value = '';
      $('#invEmail').value = '';
      renderClients();  // refresh the table
    });
  }

  // ============================================================
  // Websites
  // ============================================================
  async function renderWebsites() {
    $('#tabContent').innerHTML = loadingCard();

    const [sites, clients] = await Promise.all([
      sb.from('websites').select('*, profiles(email, full_name)').order('created_at', { ascending: false }),
      sb.from('profiles').select('id, email, full_name').eq('role','client').order('full_name')
    ]);

    if (sites.error) { $('#tabContent').innerHTML = errorCard(sites.error.message); return; }
    clientsCache = clients.data || [];

    const clientOpts = clientsCache.map(c =>
      `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('');

    const rows = (sites.data || []).map(s => `
      <tr>
        <td>${esc(s.name)}</td>
        <td>${esc(s.profiles?.full_name || s.profiles?.email || '—')}</td>
        <td>${s.domain ? `<a href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)}</a>` : '—'}</td>
        <td><span class="pill-status ${esc(s.status)}">${esc(s.status)}</span></td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">No websites yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Add Website</h2>
        <form id="siteForm" class="form-grid">
          <div class="form-row">
            <label><span>Client</span>
              <select id="sClient" required>${clientOpts || '<option value="">No clients yet</option>'}</select>
            </label>
            <label><span>Website Name</span><input type="text" id="sName" required></label>
          </div>
          <div class="form-row">
            <label><span>Domain</span><input type="text" id="sDomain" placeholder="example.co.ke"></label>
            <label><span>Deploy URL</span><input type="url" id="sDeploy" placeholder="https://...netlify.app"></label>
          </div>
          <label><span>Description</span><textarea id="sDesc" rows="2"></textarea></label>
          <label><span>Hosting Notes (private)</span><textarea id="sNotes" rows="2" placeholder="Registrar, renewal date, DNS notes…"></textarea></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Save Website</span></button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>All Websites</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Name</th><th>Client</th><th>Domain</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    $('#siteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#siteForm button[type=submit]');
      btn.disabled = true;

      const payload = {
        client_id:     $('#sClient').value,
        name:          $('#sName').value.trim(),
        domain:        $('#sDomain').value.trim() || null,
        deploy_url:    $('#sDeploy').value.trim() || null,
        description:   $('#sDesc').value.trim() || null,
        hosting_notes: $('#sNotes').value.trim() || null
      };

      const { error } = await sb.from('websites').insert(payload);
      btn.disabled = false;

      if (error) { toast(error.message, true); return; }
      toast('Website saved.');
      renderWebsites();
    });
  }

  // ============================================================
  // Plans
  // ============================================================
  async function renderPlans() {
    $('#tabContent').innerHTML = loadingCard();

    const [plans, clients, sites] = await Promise.all([
      sb.from('plans').select('*, profiles(email, full_name), websites(name)').order('created_at', { ascending: false }),
      sb.from('profiles').select('id, email, full_name').eq('role','client').order('full_name'),
      sb.from('websites').select('id, name, client_id').order('name')
    ]);

    if (plans.error) { $('#tabContent').innerHTML = errorCard(plans.error.message); return; }
    clientsCache = clients.data || [];
    const sitesList = sites.data || [];

    const clientOpts = clientsCache.map(c =>
      `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('');
    const siteOpts = sitesList.map(s =>
      `<option value="${s.id}" data-client="${s.client_id}">${esc(s.name)}</option>`).join('');

    const rows = (plans.data || []).map(p => `
      <tr>
        <td>${esc(p.name)}</td>
        <td>${esc(p.profiles?.full_name || p.profiles?.email || '—')}</td>
        <td>${fmtMoney(p.price, p.currency)}</td>
        <td>${esc(p.billing_period)}</td>
        <td>${fmtDate(p.next_renewal)}</td>
        <td><span class="pill-status ${esc(p.status)}">${esc(p.status)}</span></td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted)">No plans yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Create Plan</h2>
        <form id="planForm" class="form-grid">
          <div class="form-row">
            <label><span>Client</span><select id="pClient" required>${clientOpts}</select></label>
            <label><span>Website (optional)</span><select id="pSite"><option value="">—</option>${siteOpts}</select></label>
          </div>
          <div class="form-row">
            <label><span>Plan Name</span><input type="text" id="pName" required placeholder="Maintenance – Monthly"></label>
            <label><span>Price</span><input type="number" id="pPrice" step="0.01" min="0" required></label>
          </div>
          <div class="form-row">
            <label><span>Currency</span><input type="text" id="pCurrency" value="KES"></label>
            <label><span>Billing Period</span>
              <select id="pPeriod">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One Time</option>
              </select>
            </label>
            <label><span>Next Renewal</span><input type="date" id="pRenewal"></label>
          </div>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Create Plan</span></button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>All Plans</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Plan</th><th>Client</th><th>Price</th><th>Period</th><th>Renews</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    $('#planForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#planForm button[type=submit]');
      btn.disabled = true;

      const payload = {
        client_id:      $('#pClient').value,
        website_id:     $('#pSite').value || null,
        name:           $('#pName').value.trim(),
        price:          Number($('#pPrice').value),
        currency:       $('#pCurrency').value.trim() || 'KES',
        billing_period: $('#pPeriod').value,
        next_renewal:   $('#pRenewal').value || null
      };

      const { error } = await sb.from('plans').insert(payload);
      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Plan created.');
      renderPlans();
    });
  }

  // ============================================================
  // Payments
  // ============================================================
  async function renderPayments() {
    $('#tabContent').innerHTML = loadingCard();

    const [payments, clients, plans] = await Promise.all([
      sb.from('payments').select('*, profiles(email, full_name), plans(name)').order('paid_on', { ascending: false }),
      sb.from('profiles').select('id, email, full_name').eq('role','client').order('full_name'),
      sb.from('plans').select('id, name, client_id').order('name')
    ]);

    if (payments.error) { $('#tabContent').innerHTML = errorCard(payments.error.message); return; }
    clientsCache = clients.data || [];
    const plansList = plans.data || [];

    const clientOpts = clientsCache.map(c =>
      `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('');
    const planOpts = plansList.map(p =>
      `<option value="${p.id}" data-client="${p.client_id}">${esc(p.name)}</option>`).join('');

    const rows = (payments.data || []).map(p => `
      <tr>
        <td>${fmtDate(p.paid_on)}</td>
        <td>${esc(p.profiles?.full_name || p.profiles?.email || '—')}</td>
        <td>${esc(p.plans?.name || '—')}</td>
        <td>${fmtMoney(p.amount, p.currency)}</td>
        <td>${esc(p.reference || '—')}</td>
        <td>${p.visible_to_client ? '👁 Visible' : '🔒 Hidden'}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--color-text-muted)">No payments recorded.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Record Payment</h2>
        <p class="card-meta">Records only. This does NOT process any money and does not verify anything automatically.</p>
        <form id="payForm" class="form-grid">
          <div class="form-row">
            <label><span>Client</span><select id="payClient" required>${clientOpts}</select></label>
            <label><span>Plan (optional)</span><select id="payPlan"><option value="">—</option>${planOpts}</select></label>
          </div>
          <div class="form-row">
            <label><span>Amount</span><input type="number" id="payAmount" step="0.01" min="0" required></label>
            <label><span>Currency</span><input type="text" id="payCurrency" value="KES"></label>
            <label><span>Date Paid</span><input type="date" id="payDate" required></label>
          </div>
          <div class="form-row">
            <label><span>Reference</span><input type="text" id="payRef" placeholder="M-Pesa code, receipt no…"></label>
            <label style="display:flex;align-items:center;gap:0.5rem;margin-top:1.75rem;">
              <input type="checkbox" id="payVisible" checked style="width:auto;">
              <span>Visible to client</span>
            </label>
          </div>
          <label><span>Notes</span><textarea id="payNotes" rows="2"></textarea></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Save Payment</span></button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>All Payments</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Client</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Visibility</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    // Default date = today
    $('#payDate').value = new Date().toISOString().slice(0,10);

    $('#payForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#payForm button[type=submit]');
      btn.disabled = true;

      const payload = {
        client_id:         $('#payClient').value,
        plan_id:           $('#payPlan').value || null,
        amount:            Number($('#payAmount').value),
        currency:          $('#payCurrency').value.trim() || 'KES',
        paid_on:           $('#payDate').value,
        reference:         $('#payRef').value.trim() || null,
        notes:             $('#payNotes').value.trim() || null,
        visible_to_client: $('#payVisible').checked
      };

      const { error } = await sb.from('payments').insert(payload);
      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Payment recorded.');
      renderPayments();
    });
  }

  // ============================================================
  // Project Updates
  // ============================================================
  async function renderUpdates() {
    $('#tabContent').innerHTML = loadingCard();

    const [updates, clients, sites] = await Promise.all([
      sb.from('project_updates').select('*, profiles(email, full_name)').order('created_at', { ascending: false }),
      sb.from('profiles').select('id, email, full_name').eq('role','client').order('full_name'),
      sb.from('websites').select('id, name, client_id').order('name')
    ]);

    if (updates.error) { $('#tabContent').innerHTML = errorCard(updates.error.message); return; }
    clientsCache = clients.data || [];
    const sitesList = sites.data || [];

    const clientOpts = clientsCache.map(c =>
      `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('');
    const siteOpts = sitesList.map(s =>
      `<option value="${s.id}" data-client="${s.client_id}">${esc(s.name)}</option>`).join('');

    const rows = (updates.data || []).map(u => `
      <tr>
        <td>${fmtDate(u.created_at)}</td>
        <td>${esc(u.profiles?.full_name || u.profiles?.email || '—')}</td>
        <td>${esc(u.title)}</td>
        <td>${u.is_milestone ? '⭐ Milestone' : '—'}</td>
        <td>${u.visible_to_client ? '👁 Visible' : '🔒 Hidden'}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted)">No updates yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Post Update</h2>
        <form id="updForm" class="form-grid">
          <div class="form-row">
            <label><span>Client</span><select id="uClient" required>${clientOpts}</select></label>
            <label><span>Website (optional)</span><select id="uSite"><option value="">—</option>${siteOpts}</select></label>
          </div>
          <div class="form-row">
            <label><span>Title</span><input type="text" id="uTitle" required></label>
            <label><span>Stage</span><input type="text" id="uStage" placeholder="Design, Build, Review…"></label>
          </div>
          <label><span>Body</span><textarea id="uBody" rows="4" required></textarea></label>
          <div class="form-row">
            <label style="display:flex;align-items:center;gap:0.5rem;"><input type="checkbox" id="uMilestone" style="width:auto;"><span>Mark as milestone</span></label>
            <label style="display:flex;align-items:center;gap:0.5rem;"><input type="checkbox" id="uVisible" checked style="width:auto;"><span>Visible to client</span></label>
          </div>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Post Update</span></button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>Recent Updates</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Client</th><th>Title</th><th>Milestone</th><th>Visibility</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    $('#updForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#updForm button[type=submit]');
      btn.disabled = true;

      const payload = {
        client_id:         $('#uClient').value,
        website_id:        $('#uSite').value || null,
        title:             $('#uTitle').value.trim(),
        body:              $('#uBody').value.trim(),
        stage:             $('#uStage').value.trim() || null,
        is_milestone:      $('#uMilestone').checked,
        visible_to_client: $('#uVisible').checked
      };

      const { error } = await sb.from('project_updates').insert(payload);
      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Update posted.');
      renderUpdates();
    });
  }

  // ============================================================
  // Documents
  // ============================================================
  async function renderDocuments() {
    $('#tabContent').innerHTML = loadingCard();

    const [docs, clients] = await Promise.all([
      sb.from('documents').select('*, profiles(email, full_name)').order('created_at', { ascending: false }),
      sb.from('profiles').select('id, email, full_name').eq('role','client').order('full_name')
    ]);

    if (docs.error) { $('#tabContent').innerHTML = errorCard(docs.error.message); return; }
    clientsCache = clients.data || [];

    const clientOpts = clientsCache.map(c =>
      `<option value="${c.id}">${esc(c.full_name || c.email)}</option>`).join('');

    const rows = (docs.data || []).map(d => `
      <tr>
        <td>${esc(d.title)}</td>
        <td>${esc(d.profiles?.full_name || d.profiles?.email || '—')}</td>
        <td>${d.external_url ? `<a href="${esc(d.external_url)}" target="_blank" rel="noopener">Open</a>` : '(uploaded)'}</td>
        <td>${d.visible_to_client ? '👁 Visible' : '🔒 Hidden'}</td>
        <td>${fmtDate(d.created_at)}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted)">No documents yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Share a Document</h2>
        <p class="card-meta">For now, share a private link (Google Drive with restricted access, Dropbox share link, etc.). Direct file upload will be added later using the private storage bucket already created in your database.</p>
        <form id="docForm" class="form-grid">
          <div class="form-row">
            <label><span>Client</span><select id="dClient" required>${clientOpts}</select></label>
            <label><span>Title</span><input type="text" id="dTitle" required></label>
          </div>
          <label><span>External URL</span><input type="url" id="dUrl" required placeholder="https://drive.google.com/…"></label>
          <label style="display:flex;align-items:center;gap:0.5rem;"><input type="checkbox" id="dVisible" checked style="width:auto;"><span>Visible to client</span></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Share Document</span></button>
          </div>
        </form>
      </div>
      <div class="card">
        <h2>Shared Documents</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Title</th><th>Client</th><th>Link</th><th>Visibility</th><th>Added</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    $('#docForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#docForm button[type=submit]');
      btn.disabled = true;

      const payload = {
        client_id:         $('#dClient').value,
        title:             $('#dTitle').value.trim(),
        external_url:      $('#dUrl').value.trim(),
        visible_to_client: $('#dVisible').checked
      };

      const { error } = await sb.from('documents').insert(payload);
      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Document shared.');
      renderDocuments();
    });
  }

  // ============================================================
  // Support
  // ============================================================
  async function renderSupport() {
    $('#tabContent').innerHTML = loadingCard();

    const { data: reqs, error } = await sb
      .from('support_requests')
      .select('*, profiles(email, full_name)')
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }

    const rows = (reqs || []).map(r => `
      <tr>
        <td>${fmtDate(r.created_at)}</td>
        <td>${esc(r.profiles?.full_name || r.profiles?.email || '—')}</td>
        <td>${esc(r.subject)}</td>
        <td><span class="pill-status ${esc(r.status)}">${esc(r.status.replace('_',' '))}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-open="${r.id}">Open</button></td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted)">No requests yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>All Support Requests</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Client</th><th>Subject</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div id="threadPanel"></div>
    `;

    $$('#tabContent [data-open]').forEach(btn => {
      btn.addEventListener('click', () => openThread(btn.dataset.open));
    });
  }

  async function openThread(requestId) {
    const panel = $('#threadPanel');
    panel.innerHTML = `<div class="card">${loadingCard()}</div>`;

    const [req, replies] = await Promise.all([
      sb.from('support_requests').select('*, profiles(email, full_name)').eq('id', requestId).single(),
      sb.from('support_replies').select('*, profiles(email, full_name)').eq('request_id', requestId).order('created_at')
    ]);

    if (req.error) { panel.innerHTML = `<div class="card">${errorCard(req.error.message)}</div>`; return; }

    const r = req.data;
    const thread = (replies.data || []).map(m => `
      <div style="padding:0.75rem;border-left:3px solid ${m.is_admin_reply ? 'var(--color-primary)' : 'var(--color-border)'};margin-bottom:0.75rem;background:var(--color-bg-3);border-radius:6px;">
        <div style="font-size:0.8rem;color:var(--color-text-muted);margin-bottom:0.35rem;">
          <strong>${esc(m.profiles?.full_name || m.profiles?.email || 'Unknown')}</strong>
          ${m.is_admin_reply ? ' · Admin' : ''} · ${fmtDate(m.created_at)}
        </div>
        <div>${esc(m.body).replace(/\n/g,'<br>')}</div>
      </div>
    `).join('') || '<p class="card-meta">No replies yet.</p>';

    panel.innerHTML = `
      <div class="card">
        <h2>${esc(r.subject)}</h2>
        <p class="card-meta">
          From ${esc(r.profiles?.full_name || r.profiles?.email)} · ${fmtDate(r.created_at)} ·
          <span class="pill-status ${esc(r.status)}">${esc(r.status.replace('_',' '))}</span>
        </p>
        <div style="background:var(--color-bg-3);padding:1rem;border-radius:6px;margin-bottom:1rem;">
          ${esc(r.description).replace(/\n/g,'<br>')}
        </div>

        <h3 style="font-family:var(--font-display);margin:1rem 0 0.75rem;">Conversation</h3>
        <div>${thread}</div>

        <form id="replyForm" class="form-grid" style="margin-top:1rem;">
          <label><span>Reply</span><textarea id="replyBody" rows="3" required></textarea></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Send Reply</span></button>
            <select id="statusSel" style="padding:0.5rem;">
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button type="button" id="btnStatus" class="btn btn-ghost btn-sm">Update Status</button>
          </div>
        </form>
      </div>
    `;

    $('#statusSel').value = r.status;

    $('#replyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#replyForm button[type=submit]');
      btn.disabled = true;

      const { error } = await sb.from('support_replies').insert({
        request_id:     requestId,
        author_id:      me.id,
        body:           $('#replyBody').value.trim(),
        is_admin_reply: true
      });

      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Reply sent.');
      openThread(requestId);
    });

    $('#btnStatus').addEventListener('click', async () => {
      const { error } = await sb.from('support_requests')
        .update({ status: $('#statusSel').value })
        .eq('id', requestId);
      if (error) { toast(error.message, true); return; }
      toast('Status updated.');
      openThread(requestId);
    });
  }

})();