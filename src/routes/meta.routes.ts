import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/utils.js';

/**
 * Public read-only reference data used to build filters and the homepage:
 * categories, amenities, districts, active banners, and featured listings.
 */
export const metaRouter = Router();

// GET /api/meta/categories — active categories only.
metaRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  }),
);

// GET /api/meta/amenities
metaRouter.get(
  '/amenities',
  asyncHandler(async (_req, res) => {
    const amenities = await prisma.amenity.findMany({ orderBy: { name: 'asc' } });
    res.json({ data: amenities });
  }),
);

// GET /api/meta/districts — active districts for the location filter.
metaRouter.get(
  '/districts',
  asyncHandler(async (_req, res) => {
    const districts = await prisma.district.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: districts });
  }),
);

// GET /api/meta/banners — active site-wide announcements.
metaRouter.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    const banners = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: banners });
  }),
);

// GET /api/meta/featured — featured approved listings for the homepage.
metaRouter.get(
  '/featured',
  asyncHandler(async (_req, res) => {
    const listings = await prisma.listing.findMany({
      where: { status: 'approved', isFeatured: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
      include: {
        category: { select: { name: true, slug: true, icon: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        vendor: { select: { businessName: true, verificationStatus: true } },
      },
    });
    res.json({ data: listings });
  }),
);
