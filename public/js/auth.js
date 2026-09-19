/**
 * Firebase Authentication wrapper (uses the Firebase compat SDK loaded via
 * <script> so `firebase` is a global). Exposes a small Auth helper the rest of
 * the app uses. Everything degrades gracefully if Firebase isn't configured yet.
 */
(function () {
  const cfg = window.APP_CONFIG;
  let ready = false;
  let currentUser = null;
  const readyCallbacks = [];

  if (cfg.firebaseReady && window.firebase) {
    try {
      firebase.initializeApp(cfg.FIREBASE_CONFIG);
      ready = true;
    } catch (e) {
      console.error('Firebase init failed', e);
    }
  }

  const authInstance = ready ? firebase.auth() : null;

  if (authInstance) {
    authInstance.onAuthStateChanged((user) => {
      currentUser = user;
      readyCallbacks.splice(0).forEach((cb) => cb(user));
      document.dispatchEvent(new CustomEvent('auth:changed', { detail: { user } }));
    });
  }

  const Auth = {
    isConfigured: () => ready,

    /** Resolve with the current user (or null) once auth state is known. */
    onReady() {
      return new Promise((resolve) => {
        if (!authInstance) return resolve(null);
        if (currentUser !== null) return resolve(currentUser);
        readyCallbacks.push(resolve);
      });
    },

    currentUser: () => currentUser,

    async getToken() {
      if (!authInstance || !currentUser) return null;
      return currentUser.getIdToken();
    },

    async signUpEmail(email, password, displayName) {
      const cred = await authInstance.createUserWithEmailAndPassword(email, password);
      if (displayName) await cred.user.updateProfile({ displayName });
      return cred.user;
    },

    async signInEmail(email, password) {
      const cred = await authInstance.signInWithEmailAndPassword(email, password);
      return cred.user;
    },

    async signInGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      const cred = await authInstance.signInWithPopup(provider);
      return cred.user;
    },

    async signOut() {
      if (authInstance) await authInstance.signOut();
    },

    /** Redirect to login if not signed in; returns the user otherwise. */
    async requireUser(redirect = '/login.html') {
      const user = await this.onReady();
      if (!user) {
        window.location.href = `${redirect}?next=${encodeURIComponent(location.pathname)}`;
        return null;
      }
      return user;
    },
  };

  window.Auth = Auth;
})();
