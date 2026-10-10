// js/client-dashboard.js
// Client dashboard. Every query relies on RLS: the database only
// returns rows where client_id = auth.uid(). The client cannot see
// anyone else's data, no matter what the browser sends.

(function () {
  if (!window.supabaseClient || !window.KaynAuth) return;
  const sb = window.supabaseClient;
  const Auth = window.KaynAuth;

  let me = null;

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

  const statusPill = (s) => `<span class="pill-status ${esc(s)}">${esc(String(s||'').replace('_',' '))}</span>`;

  // ============================================================
  // Boot
  // ============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    me = await Auth.requireAuth('client');
    if (!me) return;   // requireAuth redirected; admin gets bounced to admin-dashboard

    $('#clientName').textContent = me.full_name || me.email;

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
      overview:     ['Overview', 'Your website and account at a glance.'],
      website:      ['My Website', 'Details about the site we manage for you.'],
      subscription: ['Subscription', 'Your current plan and renewal date.'],
      payments:     ['Payments', 'Payments we have recorded on your account.'],
      progress:     ['Project Progress', 'Milestones and updates from our team.'],
      documents:    ['Documents', 'Files and links we have shared with you.'],
      support:      ['Support', 'Ask a question or report an issue.'],
      account:      ['Account Settings', 'Your profile information.']
    };
    const [title, sub] = titles[tab] || ['', ''];
    $('#tabTitle').textContent = title;
    $('#tabSub').textContent   = sub;

    const loaders = {
      overview:     renderOverview,
      website:      renderWebsite,
      subscription: renderSubscription,
      payments:     renderPayments,
      progress:     renderProgress,
      documents:    renderDocuments,
      support:      renderSupport,
      account:      renderAccount
    };
    (loaders[tab] || renderOverview)();
  }

  // ============================================================
  // Overview
  // ============================================================
  async function renderOverview() {
    $('#tabContent').innerHTML = loadingCard();

    const [sites, plans, reqs, updates] = await Promise.all([
      sb.from('websites').select('*').eq('client_id', me.id),
      sb.from('plans').select('*').eq('client_id', me.id).eq('status','active'),
      sb.from('support_requests').select('id, status').eq('client_id', me.id),
      sb.from('project_updates').select('id, title, created_at')
        .eq('client_id', me.id).eq('visible_to_client', true)
        .order('created_at', { ascending: false }).limit(3)
    ]);

    const site  = (sites.data || [])[0];
    const plan  = (plans.data || [])[0];
    const open  = (reqs.data || []).filter(r => r.status === 'open' || r.status === 'in_progress').length;
    const latest = updates.data || [];

    $('#tabContent').innerHTML = `
      <div class="stat-grid">
        <div class="stat-box">
          <p class="value">${site ? esc(site.status) : '—'}</p>
          <p class="label">Website Status</p>
        </div>
        <div class="stat-box">
          <p class="value">${plan ? fmtMoney(plan.price, plan.currency) : '—'}</p>
          <p class="label">Current Plan</p>
        </div>
        <div class="stat-box">
          <p class="value">${plan?.next_renewal ? fmtDate(plan.next_renewal) : '—'}</p>
          <p class="label">Next Renewal</p>
        </div>
        <div class="stat-box">
          <p class="value">${open}</p>
          <p class="label">Open Support Tickets</p>
        </div>
      </div>

      ${site ? `
        <div class="card">
          <h2>${esc(site.name)}</h2>
          <p class="card-meta">${esc(site.description || 'Your managed website.')}</p>
          ${site.deploy_url ? `<a class="btn btn-primary btn-sm" href="${esc(site.deploy_url)}" target="_blank" rel="noopener">Visit Live Site →</a>` : ''}
        </div>
      ` : emptyCard('No website is currently linked to your account.')}

      <div class="card">
        <h2>Latest from Kayn Tech</h2>
        ${latest.length
          ? latest.map(u => `
              <div style="padding:0.75rem 0;border-bottom:1px solid var(--color-border);">
                <div style="font-size:0.8rem;color:var(--color-text-muted);">${fmtDate(u.created_at)}</div>
                <div style="font-family:var(--font-display);font-weight:500;">${esc(u.title)}</div>
              </div>`).join('')
          : `<p class="card-meta">No updates yet.</p>`}
      </div>
    `;
  }

  // ============================================================
  // My Website
  // ============================================================
  async function renderWebsite() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('websites')
      .select('*')
      .eq('client_id', me.id)
      .order('created_at', { ascending: true });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const sites = data || [];

    if (!sites.length) {
      $('#tabContent').innerHTML = emptyCard('No website linked to your account yet. Contact Kayn Tech if this looks wrong.');
      return;
    }

    $('#tabContent').innerHTML = sites.map(s => `
      <div class="card">
        <h2>${esc(s.name)}</h2>
        <p class="card-meta">${esc(s.description || '')}</p>

        <div style="display:grid;gap:0.5rem;margin-top:1rem;">
          <div><strong>Status:</strong> ${statusPill(s.status)}</div>
          ${s.domain     ? `<div><strong>Domain:</strong> <a href="https://${esc(s.domain)}" target="_blank" rel="noopener">${esc(s.domain)}</a></div>` : ''}
          ${s.deploy_url ? `<div><strong>Deploy URL:</strong> <a href="${esc(s.deploy_url)}" target="_blank" rel="noopener">${esc(s.deploy_url)}</a></div>` : ''}
          ${s.hosting_notes ? `<div><strong>Hosting notes:</strong> ${esc(s.hosting_notes)}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // ============================================================
  // Subscription
  // ============================================================
  async function renderSubscription() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('plans')
      .select('*, websites(name)')
      .eq('client_id', me.id)
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const plans = data || [];

    if (!plans.length) {
      $('#tabContent').innerHTML = emptyCard('No subscription plan is set up on your account yet.');
      return;
    }

    $('#tabContent').innerHTML = plans.map(p => `
      <div class="card">
        <h2>${esc(p.name)}</h2>
        <p class="card-meta">${p.websites?.name ? 'For: ' + esc(p.websites.name) : ''}</p>
        <div class="stat-grid" style="margin-top:1rem;">
          <div class="stat-box">
            <p class="value">${fmtMoney(p.price, p.currency)}</p>
            <p class="label">Price</p>
          </div>
          <div class="stat-box">
            <p class="value" style="text-transform:capitalize;">${esc(p.billing_period.replace('_',' '))}</p>
            <p class="label">Billing period</p>
          </div>
          <div class="stat-box">
            <p class="value">${fmtDate(p.next_renewal)}</p>
            <p class="label">Next renewal</p>
          </div>
          <div class="stat-box">
            <p class="value">${statusPill(p.status)}</p>
            <p class="label">Status</p>
          </div>
        </div>
      </div>
    `).join('');
  }

  // ============================================================
  // Payments
  // ============================================================
  async function renderPayments() {
    $('#tabContent').innerHTML = loadingCard();

    // RLS only returns rows where visible_to_client = true
    const { data, error } = await sb
      .from('payments')
      .select('*, plans(name)')
      .eq('client_id', me.id)
      .order('paid_on', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const pays = data || [];

    if (!pays.length) {
      $('#tabContent').innerHTML = emptyCard('No payments recorded yet.');
      return;
    }

    const total = pays.reduce((s, p) => s + Number(p.amount || 0), 0);

    $('#tabContent').innerHTML = `
      <div class="stat-grid">
        <div class="stat-box">
          <p class="value">${pays.length}</p>
          <p class="label">Payments on record</p>
        </div>
        <div class="stat-box">
          <p class="value">${fmtMoney(total, pays[0].currency)}</p>
          <p class="label">Total recorded</p>
        </div>
      </div>

      <div class="card">
        <h2>Payment History</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Notes</th></tr></thead>
            <tbody>
              ${pays.map(p => `
                <tr>
                  <td>${fmtDate(p.paid_on)}</td>
                  <td>${esc(p.plans?.name || '—')}</td>
                  <td>${fmtMoney(p.amount, p.currency)}</td>
                  <td>${esc(p.reference || '—')}</td>
                  <td>${esc(p.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="card-meta" style="margin-top:1rem;">These are records of payments received outside this platform. Contact Kayn Tech if something looks incorrect.</p>
      </div>
    `;
  }

  // ============================================================
  // Project Progress
  // ============================================================
  async function renderProgress() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('project_updates')
      .select('*, websites(name)')
      .eq('client_id', me.id)
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const updates = data || [];

    if (!updates.length) {
      $('#tabContent').innerHTML = emptyCard('No project updates yet.');
      return;
    }

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Updates from Kayn Tech</h2>
        ${updates.map(u => `
          <div style="padding:1rem 0;border-bottom:1px solid var(--color-border);">
            <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
              <div style="font-family:var(--font-display);font-weight:600;">${esc(u.title)}</div>
              <div style="font-size:0.8rem;color:var(--color-text-muted);">${fmtDate(u.created_at)}</div>
            </div>
            ${u.stage ? `<div style="font-size:0.8rem;color:var(--color-primary);margin:0.35rem 0;">Stage: ${esc(u.stage)}</div>` : ''}
            ${u.is_milestone ? `<span class="pill-status active" style="margin-bottom:0.5rem;display:inline-block;">⭐ Milestone</span>` : ''}
            <div style="margin-top:0.5rem;line-height:1.6;">${esc(u.body).replace(/\n/g,'<br>')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ============================================================
  // Documents
  // ============================================================
  async function renderDocuments() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('documents')
      .select('*')
      .eq('client_id', me.id)
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const docs = data || [];

    if (!docs.length) {
      $('#tabContent').innerHTML = emptyCard('No documents have been shared with you yet.');
      return;
    }

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Shared Documents</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Title</th><th>Added</th><th></th></tr></thead>
            <tbody>
              ${docs.map(d => `
                <tr>
                  <td>${esc(d.title)}</td>
                  <td>${fmtDate(d.created_at)}</td>
                  <td>${d.external_url ? `<a class="btn btn-ghost btn-sm" href="${esc(d.external_url)}" target="_blank" rel="noopener">Open →</a>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ============================================================
  // Support
  // ============================================================
  async function renderSupport() {
    $('#tabContent').innerHTML = loadingCard();

    const { data, error } = await sb
      .from('support_requests')
      .select('*')
      .eq('client_id', me.id)
      .order('created_at', { ascending: false });

    if (error) { $('#tabContent').innerHTML = errorCard(error.message); return; }
    const reqs = data || [];

    const rows = reqs.map(r => `
      <tr>
        <td>${fmtDate(r.created_at)}</td>
        <td>${esc(r.subject)}</td>
        <td>${statusPill(r.status)}</td>
        <td><button class="btn btn-ghost btn-sm" data-open="${r.id}">Open</button></td>
      </tr>
    `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted)">No requests yet.</td></tr>`;

    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Submit a Support Request</h2>
        <form id="supForm" class="form-grid">
          <label><span>Subject</span><input type="text" id="sSubject" required maxlength="120"></label>
          <label><span>Describe the issue</span><textarea id="sDesc" rows="4" required></textarea></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Submit Request</span></button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>My Requests</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Date</th><th>Subject</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div id="threadPanel"></div>
    `;

    $('#supForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#supForm button[type=submit]');
      const label = btn.querySelector('.btn-label');
      btn.disabled = true; label.textContent = 'Submitting…';

      const { error } = await sb.from('support_requests').insert({
        client_id:   me.id,
        subject:     $('#sSubject').value.trim(),
        description: $('#sDesc').value.trim()
      });

      btn.disabled = false; label.textContent = 'Submit Request';
      if (error) { toast(error.message, true); return; }
      toast('Support request submitted.');
      renderSupport();
    });

    $$('#tabContent [data-open]').forEach(btn => {
      btn.addEventListener('click', () => openThread(btn.dataset.open));
    });
  }

  async function openThread(requestId) {
    const panel = $('#threadPanel');
    panel.innerHTML = `<div class="card">${loadingCard()}</div>`;

    const [req, replies] = await Promise.all([
      sb.from('support_requests').select('*').eq('id', requestId).single(),
      sb.from('support_replies').select('*, profiles(email, full_name)')
        .eq('request_id', requestId).order('created_at')
    ]);

    if (req.error) { panel.innerHTML = `<div class="card">${errorCard(req.error.message)}</div>`; return; }
    const r = req.data;

    const thread = (replies.data || []).map(m => `
      <div style="padding:0.75rem;border-left:3px solid ${m.is_admin_reply ? 'var(--color-primary)' : 'var(--color-border)'};margin-bottom:0.75rem;background:var(--color-bg-3);border-radius:6px;">
        <div style="font-size:0.8rem;color:var(--color-text-muted);margin-bottom:0.35rem;">
          <strong>${m.is_admin_reply ? 'Kayn Tech Support' : 'You'}</strong> · ${fmtDate(m.created_at)}
        </div>
        <div>${esc(m.body).replace(/\n/g,'<br>')}</div>
      </div>
    `).join('') || '<p class="card-meta">No replies yet. We will respond soon.</p>';

    panel.innerHTML = `
      <div class="card">
        <h2>${esc(r.subject)}</h2>
        <p class="card-meta">${fmtDate(r.created_at)} · ${statusPill(r.status)}</p>
        <div style="background:var(--color-bg-3);padding:1rem;border-radius:6px;margin-bottom:1rem;">
          ${esc(r.description).replace(/\n/g,'<br>')}
        </div>

        <h3 style="font-family:var(--font-display);margin:1rem 0 0.75rem;">Conversation</h3>
        ${thread}

        <form id="replyForm" class="form-grid" style="margin-top:1rem;">
          <label><span>Reply</span><textarea id="replyBody" rows="3" required></textarea></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Send Reply</span></button>
          </div>
        </form>
      </div>
    `;

    $('#replyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#replyForm button[type=submit]');
      btn.disabled = true;

      const { error } = await sb.from('support_replies').insert({
        request_id:     requestId,
        author_id:      me.id,
        body:           $('#replyBody').value.trim(),
        is_admin_reply: false
      });

      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      toast('Reply sent.');
      openThread(requestId);
    });
  }

  // ============================================================
  // Account Settings
  // ============================================================
  async function renderAccount() {
    $('#tabContent').innerHTML = loadingCard();

    // Also expose the change-password flow inline
    $('#tabContent').innerHTML = `
      <div class="card">
        <h2>Profile</h2>
        <form id="profForm" class="form-grid">
          <div class="form-row">
            <label><span>Full Name</span><input type="text" id="pName" value="${esc(me.full_name || '')}"></label>
            <label><span>Phone</span><input type="tel" id="pPhone" value="${esc(me.phone || '')}"></label>
          </div>
          <label><span>Email (read-only)</span><input type="email" value="${esc(me.email)}" disabled></label>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Save Profile</span></button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Change Password</h2>
        <p class="card-meta">Choose a strong password you have not used before.</p>
        <form id="pwForm" class="form-grid">
          <div class="form-row">
            <label><span>New Password</span><input type="password" id="pwNew" minlength="8" required></label>
            <label><span>Confirm New Password</span><input type="password" id="pwConfirm" minlength="8" required></label>
          </div>
          <div class="action-row">
            <button type="submit" class="btn btn-primary btn-sm"><span class="btn-label">Update Password</span></button>
          </div>
        </form>
      </div>
    `;

    $('#profForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#profForm button[type=submit]');
      btn.disabled = true;

      const { error } = await sb
        .from('profiles')
        .update({
          full_name: $('#pName').value.trim() || null,
          phone:     $('#pPhone').value.trim() || null
        })
        .eq('id', me.id);

      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      me.full_name = $('#pName').value.trim();
      me.phone     = $('#pPhone').value.trim();
      $('#clientName').textContent = me.full_name || me.email;
      toast('Profile updated.');
    });

    $('#pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter || $('#pwForm button[type=submit]');
      btn.disabled = true;

      const pw1 = $('#pwNew').value;
      const pw2 = $('#pwConfirm').value;

      if (pw1.length < 8) { btn.disabled = false; toast('Password must be at least 8 characters.', true); return; }
      if (pw1 !== pw2)    { btn.disabled = false; toast('Passwords do not match.', true); return; }

      const { error } = await Auth.updatePassword(pw1);
      btn.disabled = false;
      if (error) { toast(error.message, true); return; }
      $('#pwNew').value = ''; $('#pwConfirm').value = '';
      toast('Password updated.');
    });
  }

})();