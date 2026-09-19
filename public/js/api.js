/**
 * Tiny API client. Attaches the Firebase ID token as a Bearer header when the
 * user is signed in, and normalises error handling.
 */
const API = {
  async _token() {
    // Auth.getToken is defined in auth.js once Firebase is initialised.
    try {
      return window.Auth ? await window.Auth.getToken() : null;
    } catch {
      return null;
    }
  },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = await this._token();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${window.APP_CONFIG.API_BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    if (!res.ok) {
      const message = (data && (data.error || data.message)) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },
};

window.API = API;
