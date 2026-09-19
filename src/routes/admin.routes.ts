import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, slugify } from '../lib/utils.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { sendEmail } from '../lib/notify.js';

/**
 * Admin panel API. Every route requires role === 'admin' (role read from
 * Postgres, not the Firebase token).
 */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

// ---------- Dashboard ----------

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [
      totalListings,
      pendingListings,
      approvedListings,
      totalVendors,
      pendingVendors,
      totalUsers,
      activeSubscriptions,
      openReports,
    ] = await Promise.all([
      prisma.listing.count(),
      prisma.listing.count({ where: { status: 'pending' } }),
      prisma.listing.count({ where: { status: 'approved' } }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { verificationStatus: 'pending' } }),
      prisma.user.count(),
      prisma.vendor.count({ where: { subscriptionStatus: 'active' } }),
      prisma.report.count({ where: { status: 'open' } }),
    ]);

    res.json({
      data: {
        totalListings,
        pendingListings,
        approvedListings,
        totalVendors,
        pendingVendors,
        totalUsers,
        activeSubscriptions,
        openReports,
      },
    });
  }),
);

// ---------- Listing verification & management ----------

const listingListQuery = z.object({
  status: z
    .enum(['draft', 'pending', 'approved', 'rejected', 'suspended', 'expired'])
    .optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

adminRouter.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const { status, q, page, pageSize } = listingListQuery.parse(req.query);
    const where = {
      ...(status ? { status } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          vendor: { select: { id: true, businessName: true, verificationStatus: true } },
        },
      }),
    ]);
    res.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  }),
);

adminRouter.get(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        amenities: { include: { amenity: true } },
        category: true,
        vendor: { include: { user: { select: { email: true, name: true } } } },
      },
    });
    if (!listing) throw notFound('Listing not found.');
    res.json({ data: listing });
  }),
);

// Approve — enforce the image rule again as a safety check.
adminRouter.post(
  '/listings/:id/approve',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { images: true, vendor: { include: { user: true } } },
    });
    if (!listing) throw notFound('Listing not found.');

    const count = listing.images.length;
    if (count < 3 || count > 10) {
      throw badRequest(`Listing must have 3–10 images to approve (has ${count}).`);
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'approved', rejectionReason: null },
    });

    if (listing.vendor.user.email) {
      await sendEmail({
        to: listing.vendor.user.email,
        subject: 'Your listing has been approved',
        body: `Good news! "${listing.title}" is now live on BookMyDayOut.`,
      });
    }
    res.json({ data: updated });
  }),
);

adminRouter.post(
  '/listings/:id/reject',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: { vendor: { include: { user: true } } },
    });
    if (!listing) throw notFound('Listing not found.');

    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'rejected', rejectionReason: reason },
    });

    if (listing.vendor.user.email) {
      await sendEmail({
        to: listing.vendor.user.email,
        subject: 'Your listing needs changes',
        body: `"${listing.title}" was not approved. Reason: ${reason}`,
      });
    }
    res.json({ data: updated });
  }),
);

adminRouter.post(
  '/listings/:id/suspend',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const updated = await prisma.listing.update({ where: { id }, data: { status: 'suspended' } });
    res.json({ data: updated });
  }),
);

adminRouter.post(
  '/listings/:id/feature',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { isFeatured } = z.object({ isFeatured: z.boolean() }).parse(req.body);
    const updated = await prisma.listing.update({ where: { id }, data: { isFeatured } });
    res.json({ data: updated });
  }),
);

adminRouter.delete(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.listing.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------- Vendor management ----------

adminRouter.get(
  '/vendors',
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['pending', 'approved', 'rejected']).optional() })
      .parse(req.query);
    const vendors = await prisma.vendor.findMany({
      where: status ? { verificationStatus: status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
        subscriptionPlan: true,
        _count: { select: { listings: true } },
      },
    });
    res.json({ data: vendors });
  }),
);

adminRouter.post(
  '/vendors/:id/verify',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { status } = z
      .object({ status: z.enum(['pending', 'approved', 'rejected']) })
      .parse(req.body);
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { verificationStatus: status },
    });
    res.json({ data: vendor });
  }),
);

// Manually activate/extend a subscription (bank-transfer flow).
adminRouter.post(
  '/vendors/:id/subscription',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        planId: z.string().uuid().optional(),
        status: z.enum(['none', 'active', 'expired', 'cancelled']).optional(),
        durationDays: z.number().int().positive().optional(),
      })
      .parse(req.body);

    let expiry: Date | undefined;
    if (body.status === 'active') {
      const days =
        body.durationDays ??
        (body.planId
          ? (await prisma.subscriptionPlan.findUnique({ where: { id: body.planId } }))?.durationDays
          : undefined) ??
        30;
      expiry = new Date(Date.now() + days * 86400_000);
    }

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(body.planId ? { subscriptionPlanId: body.planId } : {}),
        ...(body.status ? { subscriptionStatus: body.status } : {}),
        ...(expiry ? { subscriptionExpiryDate: expiry } : {}),
      },
      include: { subscriptionPlan: true },
    });
    res.json({ data: vendor });
  }),
);

// ---------- Categories ----------

const categoryBody = z.object({
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().max(60).optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.category.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

adminRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const body = categoryBody.parse(req.body);
    const category = await prisma.category.create({
      data: { ...body, slug: slugify(body.name) },
    });
    res.status(201).json({ data: category });
  }),
);

adminRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = categoryBody.partial().parse(req.body);
    const category = await prisma.category.update({
      where: { id },
      data: { ...body, ...(body.name ? { slug: slugify(body.name) } : {}) },
    });
    res.json({ data: category });
  }),
);

adminRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.category.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------- Amenities ----------

const amenityBody = z.object({
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().max(60).optional(),
});

adminRouter.get(
  '/amenities',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.amenity.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

adminRouter.post(
  '/amenities',
  asyncHandler(async (req, res) => {
    const body = amenityBody.parse(req.body);
    const amenity = await prisma.amenity.create({ data: { ...body, slug: slugify(body.name) } });
    res.status(201).json({ data: amenity });
  }),
);

adminRouter.patch(
  '/amenities/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = amenityBody.partial().parse(req.body);
    const amenity = await prisma.amenity.update({
      where: { id },
      data: { ...body, ...(body.name ? { slug: slugify(body.name) } : {}) },
    });
    res.json({ data: amenity });
  }),
);

adminRouter.delete(
  '/amenities/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.amenity.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------- Districts ----------

adminRouter.get(
  '/districts',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.district.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

adminRouter.post(
  '/districts',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().trim().min(2).max(80), isActive: z.boolean().optional() })
      .parse(req.body);
    const district = await prisma.district.create({ data: body });
    res.status(201).json({ data: district });
  }),
);

adminRouter.patch(
  '/districts/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ name: z.string().trim().min(2).max(80).optional(), isActive: z.boolean().optional() })
      .parse(req.body);
    const district = await prisma.district.update({ where: { id }, data: body });
    res.json({ data: district });
  }),
);

adminRouter.delete(
  '/districts/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.district.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------- Banners ----------

adminRouter.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.banner.findMany({ orderBy: { createdAt: 'desc' } }) });
  }),
);

adminRouter.post(
  '/banners',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        message: z.string().trim().min(2).max(300),
        linkUrl: z.string().url().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const banner = await prisma.banner.create({ data: body });
    res.status(201).json({ data: banner });
  }),
);

adminRouter.patch(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        message: z.string().trim().min(2).max(300).optional(),
        linkUrl: z.string().url().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const banner = await prisma.banner.update({ where: { id }, data: body });
    res.json({ data: banner });
  }),
);

adminRouter.delete(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.banner.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------- Subscription plans ----------

const planBody = z.object({
  name: z.string().trim().min(2).max(80),
  price: z.number().nonnegative(),
  durationDays: z.number().int().positive(),
  listingLimit: z.number().int().positive(),
  featuredIncluded: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

adminRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } }) });
  }),
);

adminRouter.post(
  '/plans',
  asyncHandler(async (req, res) => {
    const body = planBody.parse(req.body);
    const plan = await prisma.subscriptionPlan.create({ data: body });
    res.status(201).json({ data: plan });
  }),
);

adminRouter.patch(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = planBody.partial().parse(req.body);
    const plan = await prisma.subscriptionPlan.update({ where: { id }, data: body });
    res.json({ data: plan });
  }),
);

adminRouter.delete(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true, message: 'Plan deactivated.' });
  }),
);

// ---------- Reports / moderation ----------

adminRouter.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['open', 'dismissed', 'actioned']).default('open') })
      .parse(req.query);
    const reports = await prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, title: true, slug: true, status: true } },
        reporter: { select: { email: true } },
      },
    });
    res.json({ data: reports });
  }),
);

adminRouter.post(
  '/reports/:id/action',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { status, removeListing } = z
      .object({
        status: z.enum(['dismissed', 'actioned']),
        removeListing: z.boolean().optional(),
      })
      .parse(req.body);

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('Report not found.');

    await prisma.$transaction(async (tx) => {
      await tx.report.update({ where: { id }, data: { status } });
      if (removeListing) {
        await tx.listing.update({ where: { id: report.listingId }, data: { status: 'suspended' } });
      }
    });
    res.json({ ok: true });
  }),
);

// ---------- Users ----------

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(1).optional() }).parse(req.query);
    const users = await prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
    res.json({ data: users });
  }),
);

adminRouter.post(
  '/users/:id/role',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { role } = z.object({ role: z.enum(['user', 'vendor', 'admin']) }).parse(req.body);
    const user = await prisma.user.update({ where: { id }, data: { role } });
    res.json({ data: { id: user.id, role: user.role } });
  }),
);
