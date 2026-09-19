/**
 * Frontend configuration.
 *
 * API_BASE: the backend is served from the same origin (Express serves this
 * static site too), so '/api' works in dev and on Railway with no changes.
 *
 * FIREBASE_CONFIG: paste your Firebase *web app* config here. These values are
 * meant to be public (the apiKey is not a secret) — access is controlled by
 * Firebase Auth + Storage rules, not by hiding this config. Get it from
 * Firebase console > Project settings > Your apps > SDK setup and configuration.
 */
window.APP_CONFIG = {
  API_BASE: '/api',
  FIREBASE_CONFIG: {
    apiKey: 'YOUR_FIREBASE_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
};

// True once real Firebase values are filled in.
window.APP_CONFIG.firebaseReady =
  window.APP_CONFIG.FIREBASE_CONFIG.apiKey !== 'YOUR_FIREBASE_API_KEY';
