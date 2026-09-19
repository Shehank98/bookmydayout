/**
 * Auth wrapper supporting TWO login methods:
 *
 *   1. Email/password  — handled entirely by our backend (no Firebase). The
 *      backend returns a JWT which we store in localStorage.
 *   2. Google sign-in  — uses Firebase (requires Firebase config). The Firebase
 *      ID token is sent to the backend, which verifies it.
 *
 * The backend accepts either token, so the rest of the app just calls
 * Auth.getToken() / Auth.isLoggedIn() without caring which method was used.
 */
(function () {
  const cfg = window.APP_CONFIG;
  const TOKEN_KEY = 'bmd_token';

  let firebaseReady = false;
  let firebaseUser = null;
  const readyCallbacks = [];
  let firebaseResolved = false;

  // --- Local (email/password) session, stored in localStorage ---
  function getLocalToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function setLocalToken(token) {
    try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  // --- Firebase (Google) init, only if configured ---
  if (cfg.firebaseReady && window.firebase) {
    try {
      firebase.initializeApp(cfg.FIREBASE_CONFIG);
      firebaseReady = true;
    } catch (e) {
      console.error('Firebase init failed', e);
    }
  }
  const authInstance = firebaseReady ? firebase.auth() : null;

  if (authInstance) {
    authInstance.onAuthStateChanged((user) => {
      firebaseUser = user;
      firebaseResolved = true;
      readyCallbacks.splice(0).forEach((cb) => cb());
      document.dispatchEvent(new CustomEvent('auth:changed'));
    });
  } else {
    firebaseResolved = true;
  }

  const Auth = {
    /** Is Firebase (Google sign-in) available? Email/password does not need this. */
    isConfigured: () => firebaseReady,

    /** True if the visitor is logged in by EITHER method. */
    isLoggedIn: () => !!getLocalToken() || !!firebaseUser,

    /** Resolve once auth state is known. Returns true if logged in. */
    onReady() {
      return new Promise((resolve) => {
        if (getLocalToken()) return resolve(true);
        if (firebaseResolved) return resolve(!!firebaseUser);
        readyCallbacks.push(() => resolve(!!firebaseUser));
      });
    },

    /** Best token available: our backend JWT, else the Firebase ID token. */
    async getToken() {
      const local = getLocalToken();
      if (local) return local;
      if (authInstance && firebaseUser) return firebaseUser.getIdToken();
      return null;
    },

    /** Store a backend JWT after email/password login/register. */
    setSession(token) {
      setLocalToken(token);
      document.dispatchEvent(new CustomEvent('auth:changed'));
    },

    // ----- Email/password (backend) -----
    async registerEmail(email, password, name) {
      const res = await API.post('/auth/register', { email, password, name });
      this.setSession(res.token);
      return res.data;
    },
    async loginEmail(email, password) {
      const res = await API.post('/auth/login', { email, password });
      this.setSession(res.token);
      return res.data;
    },

    // ----- Google (Firebase) -----
    async signInGoogle() {
      if (!authInstance) throw new Error('Google sign-in is not configured.');
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await authInstance.signInWithPopup(provider);
      return cred.user;
    },

    async signOut() {
      setLocalToken(null);
      if (authInstance) { try { await authInstance.signOut(); } catch { /* ignore */ } }
      document.dispatchEvent(new CustomEvent('auth:changed'));
    },

    /** Redirect to login if not signed in; returns true otherwise. */
    async requireUser(redirect = '/login.html') {
      const ok = await this.onReady();
      if (!ok) {
        window.location.href = `${redirect}?next=${encodeURIComponent(location.pathname)}`;
        return false;
      }
      return true;
    },
  };

  window.Auth = Auth;
})();
