// js/auth.js
// Authentication helpers shared by login and dashboard pages.

(function () {
  if (!window.supabaseClient) {
    console.error('auth.js requires supabase-client.js to be loaded first.');
    return;
  }
  const sb = window.supabaseClient;

  const Auth = {
    async signUp(email, password, fullName) {
      return sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || '' } }
      });
    },

    async signIn(email, password) {
      return sb.auth.signInWithPassword({ email, password });
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },

    async getUser() {
      const { data } = await sb.auth.getUser();
      return data.user;
    },

    // Fetch the current user's profile row (contains role).
    async getProfile() {
      const user = await this.getUser();
      if (!user) return null;
      const { data, error } = await sb
        .from('profiles')
        .select('id, email, full_name, phone, role')
        .eq('id', user.id)
        .single();
      if (error) { console.error('getProfile:', error); return null; }
      return data;
    },

    // Redirect helpers
    goToLogin()    { window.location.href = 'client-login.html'; },
    goToClient()   { window.location.href = 'client-dashboard.html'; },
    goToAdmin()    { window.location.href = 'admin-dashboard.html'; },

    // Guard: call at the top of any protected page.
    // mode = 'client' | 'admin' | 'any'
    async requireAuth(mode = 'any') {
      const session = await this.getSession();
      if (!session) { this.goToLogin(); return null; }

      const profile = await this.getProfile();
      if (!profile) { this.goToLogin(); return null; }

      if (mode === 'admin' && profile.role !== 'admin') {
        // Non-admin tried to open admin page. Bounce them to their own dashboard.
        this.goToClient();
        return null;
      }
      return profile;
    },

    // Guard for login page: if already signed in, send to correct dashboard.
    async redirectIfSignedIn() {
      const session = await this.getSession();
      if (!session) return false;
      const profile = await this.getProfile();
      if (!profile) { await this.signOut(); return false; }
      if (profile.role === 'admin') { this.goToAdmin(); }
      else                          { this.goToClient(); }
      return true;
    },

    async sendPasswordReset(email) {
      const redirectTo = window.location.origin + '/reset-password.html';
      return sb.auth.resetPasswordForEmail(email, { redirectTo });
    },

    async updatePassword(newPassword) {
      return sb.auth.updateUser({ password: newPassword });
    }
  };

  window.KaynAuth = Auth;
})();