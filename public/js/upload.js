/**
 * Listing image uploader.
 *
 * Files are sent to the BACKEND (multipart), which stores them in Firebase
 * Storage via the Admin SDK and saves the image records. This works for both
 * login methods — email/password (backend JWT) and Google (Firebase) — because
 * it only needs our Bearer token, not a Firebase client session.
 */
const Uploader = {
  MAX_BYTES: 5 * 1024 * 1024,

  validate(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) throw new Error(`${f.name} is not an image.`);
      if (f.size > this.MAX_BYTES) throw new Error(`${f.name} is larger than 5MB.`);
    }
  },

  /** Upload files for a listing. Returns the listing's full image list. */
  async uploadListingImages(listingId, files) {
    this.validate(files);
    const token = window.Auth ? await Auth.getToken() : null;
    if (!token) throw new Error('You must be signed in to upload.');

    const form = new FormData();
    for (const f of files) form.append('images', f);

    const res = await fetch(`${window.APP_CONFIG.API_BASE}/vendor/listings/${listingId}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // no Content-Type: browser sets the boundary
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    return data.data; // full image list
  },
};

window.Uploader = Uploader;
