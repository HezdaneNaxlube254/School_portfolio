// netlify/functions/admin-invite.js
// Only file in the project that touches the SUPABASE_SERVICE_ROLE_KEY.
// It runs on Netlify's servers, never in the browser.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin':  'https://kayntech.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST')   return json(405, { error: 'Method not allowed' }, cors);

  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return json(500, { error: 'Server is not configured.' }, cors);
  }

  // ---- 1. Verify the caller is an admin ------------------------------
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json(401, { error: 'Missing auth token.' }, cors);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Invalid session.' }, cors);

  const { data: profile, error: profErr } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profErr || profile?.role !== 'admin') {
    return json(403, { error: 'Administrator access required.' }, cors);
  }

  // ---- 2. Parse input ------------------------------------------------
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON.' }, cors); }

  const email    = (body.email || '').trim().toLowerCase();
  const fullName = (body.full_name || '').trim();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return json(400, { error: 'A valid email is required.' }, cors);
  }

  // ---- 3. Create the user (admin rights) -----------------------------
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });

  if (createErr) {
    return json(400, { error: createErr.message || 'Could not create user.' }, cors);
  }

  // ---- 4. Generate a one-time sign-in link ---------------------------
  // We do not send an email. The admin copies this link and forwards
  // it over WhatsApp or Gmail. Free-tier safe.
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email
  });

  if (linkErr) {
    return json(200, {
      ok: true,
      user_id: created.user.id,
      email,
      warning: 'User created, but could not generate a sign-in link. Ask them to use "Forgot password".'
    }, cors);
  }

  return json(200, {
    ok: true,
    user_id: created.user.id,
    email,
    login_link: linkData.properties?.action_link || null
  }, cors);
};

function json(statusCode, obj, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(obj)
  };
}