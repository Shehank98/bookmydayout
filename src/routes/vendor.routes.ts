import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVendor } from '../middleware/vendor.js';
import { asyncHandler, buildListingSlug } from '../lib/utils.js';
import { badRequest, forbidden, notFound, serviceUnavailable } from '../lib/http-error.js';
import { deleteObjectsByUrl, isStorageConfigured, uploadImageBuffer } from '../lib/storage.js';
import { env } from '../config/env.js';

// In-memory upload handling: images are streamed to Firebase Storage, not
// written to disk. Limited to 5MB and image MIME types.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: env.listings.maxImages },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

/**
 * Vendor dashboard API. Every route requires an authenticated user who has a
 * vendor profile. Vendors can only ever touch their OWN profile and listings —
 * ownership is checked against req.vendor.id on every listing operation.
 */
export const vendorRouter = Router();

vendorRouter.use(requireAuth, requireVendor);

// ---------- Vendor profile ----------

vendorRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.vendor!.id },
      include: { subscriptionPlan: true, _count: { select: { listings: true } } },
    });
    res.json({ data: vendor });
  }),
);

const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(160).optional(),
  ownerName: z.string().trim().min(2).max(160).optional(),
  contactNumber: z.string().trim().min(5).max(30).optional(),
  whatsappNumber: z.string().trim().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().trim().max(300).optional(),
  nicOrBusinessDocUrl: z.string().url().optional(),
});

vendorRouter.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    const vendor = await prisma.vendor.update({ where: { id: req.vendor!.id }, data: body });
    res.json({ data: vendor });
  }),
);

// ---------- Subscription ----------

vendorRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
    res.json({ data: plans });
  }),
);

vendorRouter.post(
  '/subscription',
  asyncHandler(async (req, res) => {
    const { planId } = z.object({ planId: z.string().uuid() }).parse(req.body);
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw badRequest('Invalid subscription plan.');

    // Free plans activate immediately; paid plans await admin manual activation
    // (bank transfer flow) — the admin sets status to active later.
    const isFree = Number(plan.price) === 0;
    const vendor = await prisma.vendor.update({
      where: { id: req.vendor!.id },
      data: {
        subscriptionPlanId: plan.id,
        subscriptionStatus: isFree ? 'active' : 'none',
        subscriptionExpiryDate: isFree
          ? new Date(Date.now() + plan.durationDays * 86400_000)
          : null,
      },
      include: { subscriptionPlan: true },
    });

    res.json({
      data: vendor,
      message: isFree
        ? 'Free plan activated.'
        : 'Plan selected. An admin will activate it once payment is confirmed.',
    });
  }),
);

// ---------- Listings ----------

const listingBody = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  address: z.string().trim().max(300).optional(),
  district: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  mapUrl: z.string().url().max(500).optional(),
  price: z.number().nonnegative().optional(),
  priceUnit: z.string().trim().max(30).optional(),
  capacity: z.number().int().positive().optional(),
  contactCall: z.string().trim().max(30).optional(),
  contactWhatsapp: z.string().trim().max(30).optional(),
  amenityIds: z.array(z.string().uuid()).max(50).optional(),
  images: z.array(z.string().url()).max(env.listings.maxImages).optional(),
});

// Load a listing and assert the current vendor owns it.
async function getOwnedListing(vendorId: string, id: string) {
  const listing = await prisma.listing.findUnique({ where: { id }, include: { images: true } });
  if (!listing) throw notFound('Listing not found.');
  if (listing.vendorId !== vendorId) throw forbidden('This listing is not yours.');
  return listing;
}

// GET /api/vendor/listings — all of the vendor's own listings.
vendorRouter.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const listings = await prisma.listing.findMany({
      where: { vendorId: req.vendor!.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        category: { select: { name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { favorites: true } },
      },
    });
    res.json({ data: listings });
  }),
);

// GET /api/vendor/listings/:id — one owned listing with full detail.
vendorRouter.get(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await getOwnedListing(req.vendor!.id, id);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        amenities: { include: { amenity: true } },
        category: true,
      },
    });
    res.json({ data: listing });
  }),
);

// POST /api/vendor/listings — create a new draft listing.
vendorRouter.post(
  '/listings',
  asyncHandler(async (req, res) => {
    const body = listingBody.parse(req.body);
    const { amenityIds = [], images = [], ...fields } = body;

    const listing = await prisma.listing.create({
      data: {
        ...fields,
        vendorId: req.vendor!.id,
        slug: buildListingSlug(body.title),
        status: 'draft',
        images: {
          create: images.map((url, i) => ({ storageUrl: url, sortOrder: i })),
        },
        amenities: {
          create: amenityIds.map((amenityId) => ({ amenityId })),
        },
      },
      include: { images: true, amenities: true },
    });

    res.status(201).json({ data: listing });
  }),
);

// PATCH /api/vendor/listings/:id — edit an owned listing.
vendorRouter.patch(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = listingBody.partial().parse(req.body);
    const existing = await getOwnedListing(req.vendor!.id, id);

    const { amenityIds, images, ...fields } = body;

    // If a live listing is edited and moderation of edits is on, send it back
    // to pending for re-review (configurable via MODERATE_LISTING_EDITS).
    const shouldRemoderate =
      env.listings.moderateEdits && existing.status === 'approved';

    const listing = await prisma.$transaction(async (tx) => {
      if (amenityIds) {
        await tx.listingAmenity.deleteMany({ where: { listingId: id } });
        await tx.listingAmenity.createMany({
          data: amenityIds.map((amenityId) => ({ listingId: id, amenityId })),
        });
      }
      if (images) {
        await tx.listingImage.deleteMany({ where: { listingId: id } });
        await tx.listingImage.createMany({
          data: images.map((url, i) => ({ listingId: id, storageUrl: url, sortOrder: i })),
        });
      }
      return tx.listing.update({
        where: { id },
        data: {
          ...fields,
          ...(shouldRemoderate ? { status: 'pending', rejectionReason: null } : {}),
        },
        include: { images: { orderBy: { sortOrder: 'asc' } }, amenities: true },
      });
    });

    res.json({
      data: listing,
      ...(shouldRemoderate ? { message: 'Listing sent back to pending for re-review.' } : {}),
    });
  }),
);

// DELETE /api/vendor/listings/:id — delete an owned listing + its images.
vendorRouter.delete(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const existing = await getOwnedListing(req.vendor!.id, id);
    await prisma.listing.delete({ where: { id } });
    // Best-effort cleanup of Storage objects.
    await deleteObjectsByUrl(existing.images.map((img) => img.storageUrl));
    res.json({ ok: true });
  }),
);

// POST /api/vendor/listings/:id/submit — submit for admin verification.
// Enforces the 3–10 image rule and the plan's active-listing limit.
vendorRouter.post(
  '/listings/:id/submit',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const listing = await getOwnedListing(req.vendor!.id, id);

    const { minImages, maxImages } = env.listings;
    const imageCount = listing.images.length;
    if (imageCount < minImages || imageCount > maxImages) {
      throw badRequest(
        `A listing must have between ${minImages} and ${maxImages} images (has ${imageCount}).`,
      );
    }

    // Enforce the plan's active-listing limit (active = pending or approved).
    const plan = req.vendor!.subscriptionPlanId
      ? await prisma.subscriptionPlan.findUnique({ where: { id: req.vendor!.subscriptionPlanId } })
      : null;
    const limit = plan?.listingLimit ?? 1; // default to Basic (1) with no plan

    const activeCount = await prisma.listing.count({
      where: {
        vendorId: req.vendor!.id,
        status: { in: ['pending', 'approved'] },
        NOT: { id },
      },
    });
    if (activeCount >= limit) {
      throw badRequest(
        `Your plan allows ${limit} active listing(s). Upgrade your plan to submit more.`,
      );
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'pending', rejectionReason: null },
    });
    res.json({ data: updated, message: 'Submitted for verification.' });
  }),
);

// POST /api/vendor/listings/:id/images — append images (respects the max).
vendorRouter.post(
  '/listings/:id/images',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { urls } = z.object({ urls: z.array(z.string().url()).min(1) }).parse(req.body);
    const listing = await getOwnedListing(req.vendor!.id, id);

    if (listing.images.length + urls.length > env.listings.maxImages) {
      throw badRequest(`A listing can have at most ${env.listings.maxImages} images.`);
    }

    const start = listing.images.length;
    await prisma.listingImage.createMany({
      data: urls.map((url, i) => ({ listingId: id, storageUrl: url, sortOrder: start + i })),
    });

    const images = await prisma.listingImage.findMany({
      where: { listingId: id },
      orderBy: { sortOrder: 'asc' },
    });
    res.status(201).json({ data: images });
  }),
);

// POST /api/vendor/listings/:id/upload — multipart image upload (field "images").
// Uploads through the backend to Firebase Storage so it works for both
// email/password and Google vendors. Saves image rows and returns them.
vendorRouter.post(
  '/listings/:id/upload',
  upload.array('images', env.listings.maxImages),
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) throw badRequest('No images uploaded.');
    if (!isStorageConfigured()) {
      throw serviceUnavailable('Image storage is not configured on the server yet.');
    }

    const listing = await getOwnedListing(req.vendor!.id, id);
    if (listing.images.length + files.length > env.listings.maxImages) {
      throw badRequest(`A listing can have at most ${env.listings.maxImages} images.`);
    }

    const ownerRef = req.user!.firebaseUid || req.user!.id;
    const start = listing.images.length;
    const created = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safeName = f.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `listings/${ownerRef}/${id}/${Date.now()}_${i}_${safeName}`;
      const url = await uploadImageBuffer(objectPath, f.buffer, f.mimetype);
      const row = await prisma.listingImage.create({
        data: { listingId: id, storageUrl: url, sortOrder: start + i },
      });
      created.push(row);
    }

    const images = await prisma.listingImage.findMany({
      where: { listingId: id },
      orderBy: { sortOrder: 'asc' },
    });
    res.status(201).json({ data: images, uploaded: created.length });
  }),
);

// DELETE /api/vendor/listings/:id/images/:imageId
vendorRouter.delete(
  '/listings/:id/images/:imageId',
  asyncHandler(async (req, res) => {
    const { id, imageId } = z
      .object({ id: z.string().uuid(), imageId: z.string().uuid() })
      .parse(req.params);
    await getOwnedListing(req.vendor!.id, id);

    const image = await prisma.listingImage.findUnique({ where: { id: imageId } });
    if (!image || image.listingId !== id) throw notFound('Image not found.');

    await prisma.listingImage.delete({ where: { id: imageId } });
    await deleteObjectsByUrl([image.storageUrl]);
    res.json({ ok: true });
  }),
);

// GET /api/vendor/listings/:id/stats — performance metrics.
vendorRouter.get(
  '/listings/:id/stats',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const listing = await getOwnedListing(req.vendor!.id, id);
    res.json({
      data: {
        views: listing.viewCount,
        contactClicks: listing.contactClickCount,
        favorites: listing.favoriteCount,
        status: listing.status,
      },
    });
  }),
);
