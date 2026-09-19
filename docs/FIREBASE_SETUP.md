# Firebase setup guide — BookMyDayOut

Firebase powers **two** things in this project:

1. **Google sign-in** (email/password login does NOT use Firebase — it's handled
   by our own backend).
2. **Listing image storage** (uploads go through the backend to Firebase Storage).

If you don't set up Firebase, the site still works — people can register/log in
with email + password and browse listings. Vendors just can't use Google sign-in
or upload photos until Firebase is configured.

Two sides need configuring:

- **Frontend** — a public web-app config pasted into `public/js/config.js`.
- **Backend** — a private service-account credential set as environment variables.

---

## Step 1 — Create a Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Add project**, name it (e.g. `bookmydayout`), continue.
3. Google Analytics is optional — you can turn it off. Click **Create project**.

---

## Step 2 — Register a Web App (frontend config)

1. In the project, click the **`</>`** (Web) icon on the overview page
   ("Add an app" → Web).
2. Give it a nickname (e.g. `BookMyDayOut Web`). You do **not** need Firebase
   Hosting. Click **Register app**.
3. Firebase shows a `firebaseConfig` object. Copy those values.
4. Open `public/js/config.js` in the repo and paste them into `FIREBASE_CONFIG`:

   ```js
   window.APP_CONFIG = {
     API_BASE: '/api',
     FIREBASE_CONFIG: {
       apiKey: 'AIza....',
       authDomain: 'bookmydayout.firebaseapp.com',
       projectId: 'bookmydayout',
       storageBucket: 'bookmydayout.appspot.com',   // copy EXACTLY what Firebase shows
       messagingSenderId: '1234567890',
       appId: '1:1234567890:web:abcdef',
     },
   };
   ```

   > These values are **public by design** — the `apiKey` is not a secret.
   > Access is controlled by Auth + Storage rules, not by hiding this config.
   > It's fine that this file is committed to the repo.

5. Commit and redeploy so the frontend picks up the new config.

---

## Step 3 — Enable Google sign-in

1. In the Firebase console: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab.
3. Click **Google**, toggle **Enable**, pick a support email, and **Save**.
   (You can ignore Email/Password here — our backend handles that.)
4. Go to **Authentication → Settings → Authorized domains** and **Add domain**:
   - `localhost` (usually already there, for local testing)
   - your Railway domain, e.g. `bookmydayout-production.up.railway.app`
   - your custom domain later, if you add one

   Google sign-in only works from domains in this list.

---

## Step 4 — Enable Storage

1. **Build → Storage → Get started**.
2. Choose a location (pick one close to Sri Lanka, e.g. `asia-south1`).
3. Note the **bucket name** shown at the top, e.g. `bookmydayout.appspot.com`
   (newer projects may show `bookmydayout.firebasestorage.app`). Use this exact
   value for `FIREBASE_STORAGE_BUCKET` in Step 5 and `storageBucket` in Step 2.
4. Uploads in this app go **through the backend** (Admin SDK), so you don't
   strictly need to edit client rules. If you also want public read / direct
   client access, deploy the included rules:

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase deploy --only storage    # uses storage.rules in the repo root
   ```

---

## Step 5 — Service account (backend credentials)

The backend verifies Google tokens and uploads images using a **service
account** — a private credential. Never commit it; set it as env vars.

1. Firebase console → **⚙ Project settings → Service accounts** tab.
2. Click **Generate new private key** → confirm → a JSON file downloads.
   Keep this file safe; treat it like a password.
3. Set the backend environment variables. On Railway: your service →
   **Variables** tab. Two options — pick ONE:

   **Option A — one variable (simplest on Railway):**
   Open the downloaded JSON, copy its ENTIRE contents, and set:

   | Variable                         | Value                                             |
   | -------------------------------- | ------------------------------------------------- |
   | `FIREBASE_SERVICE_ACCOUNT_JSON`  | *(paste the whole JSON file contents)*            |
   | `FIREBASE_STORAGE_BUCKET`        | `bookmydayout.appspot.com` (from Step 4)          |

   **Option B — three separate variables:**
   From the JSON file, take `project_id`, `client_email`, `private_key`:

   | Variable                 | Value (from the JSON file)                                  |
   | ------------------------ | ---------------------------------------------------------- |
   | `FIREBASE_PROJECT_ID`    | the `project_id` value                                     |
   | `FIREBASE_CLIENT_EMAIL`  | the `client_email` value                                   |
   | `FIREBASE_PRIVATE_KEY`   | the `private_key` value (keep the `\n` sequences as-is)    |
   | `FIREBASE_STORAGE_BUCKET`| `bookmydayout.appspot.com` (from Step 4)                   |

   > The backend automatically converts the `\n` sequences in the private key
   > into real line breaks, so pasting the value exactly as it appears in the
   > JSON works.

4. While you're in Variables, also make sure these are set (unrelated to
   Firebase but required):
   - `DATABASE_URL` — provided automatically by the Railway Postgres plugin
   - `JWT_SECRET` — a long random string (e.g. run `openssl rand -hex 32`)
   - `CORS_ORIGINS` — your frontend origin(s), e.g.
     `https://bookmydayout-production.up.railway.app`

5. **Redeploy.**

---

## Step 6 — Verify it works

1. Open your site. In the browser console, run `APP_CONFIG.firebaseReady` —
   it should print `true` (means the frontend config is filled in).
2. Call `GET /api/health/ready` — the `firebase` check should be `true`:
   ```json
   { "status": "ready", "checks": { "database": true, "firebase": true } }
   ```
3. On the login page, **Continue with Google** should open the Google popup and
   sign you in.
4. As a vendor, create a listing and upload photos — they should save and appear.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| ------- | ------------------ |
| Google button is disabled on login page | `firebaseReady` is false — `public/js/config.js` still has placeholder values. Fill in the web config (Step 2) and redeploy. |
| `auth/unauthorized-domain` popup error | The current domain isn't in **Authentication → Settings → Authorized domains** (Step 3.4). Add it. |
| Google popup blocked | Allow popups for the site, or it will retry. |
| Image upload returns 503 | Backend Firebase not configured — set the service-account vars + `FIREBASE_STORAGE_BUCKET` (Step 5) and redeploy. |
| Upload fails with a bucket error | `FIREBASE_STORAGE_BUCKET` doesn't match the real bucket. Copy the exact name from **Storage** (Step 4). |
| `firebase` check is false in `/api/health/ready` | Service-account vars missing/incorrect on the backend. |
| Email/password login fails but Google works | That's unrelated to Firebase — check `JWT_SECRET` is set and the DB migrations ran. |

---

## What each piece is for (quick recap)

- **`public/js/config.js` (public web config)** → lets the browser open the
  Google sign-in popup.
- **Service account (private, backend env vars)** → lets the server verify those
  Google tokens and upload images to Storage.
- **`storage.rules`** → who can read/write Storage objects directly (optional,
  since uploads are backend-mediated).
- **Email/password** → 100% our backend (bcrypt + JWT). No Firebase involved.
