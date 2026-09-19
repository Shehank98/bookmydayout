/**
 * Firebase Storage uploader for listing images.
 *
 * Images go to  listings/{ownerUid}/{listingId}/{file}  so the Storage rules
 * (which match on request.auth.uid) permit only the owning vendor to write.
 * Returns the public download URLs, which the backend stores in Postgres.
 *
 * Requires firebase-storage-compat.js to be loaded on the page.
 */
const Uploader = {
  MAX_BYTES: 5 * 1024 * 1024,

  validate(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) throw new Error(`${f.name} is not an image.`);
      if (f.size > this.MAX_BYTES) throw new Error(`${f.name} is larger than 5MB.`);
    }
  },

  async uploadListingImages(listingId, files, onProgress) {
    if (!window.Auth || !Auth.isConfigured()) throw new Error('Firebase is not configured.');
    const user = Auth.currentUser();
    if (!user) throw new Error('You must be signed in to upload.');
    this.validate(files);

    const storage = firebase.storage();
    const urls = [];
    let done = 0;
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `listings/${user.uid}/${listingId}/${Date.now()}_${safeName}`;
      const ref = storage.ref(path);
      await ref.put(file);
      urls.push(await ref.getDownloadURL());
      done++;
      if (onProgress) onProgress(done, files.length);
    }
    return urls;
  },
};

window.Uploader = Uploader;
