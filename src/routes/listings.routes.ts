import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/http-error.js';

/**
 * PUBLIC listings routes (read-only). Only APPROVED listings are ever exposed
 * here. Vendor/admin write endpoints will live under their own routers in
 * later phases. This exists in Phase 1 to prove the DB wiring end-to-end.
 */
export const listingsRouter = Router();

const browseQuery = z.object({
  q: z.string().trim().min(1).optional(),
  district: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(), // category slug
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(12),
});

const sortMap = {
  newest: [{ createdAt: 'desc' as const }],
  price_asc: [{ price: 'asc' as const }],
  price_desc: [{ price: 'desc' as const }],
  popular: [{ viewCount: 'desc' as const }],
};

// GET /api/listings — browse/search approved listings.
listingsRouter.get('/', async (req, res, next) => {
  try {
    const params = browseQuery.parse(req.query);

    const where = {
      status: 'approved' as const,
      ...(params.district ? { district: params.district } : {}),
      ...(params.category ? { category: { slug: params.category } } : {}),
      ...(params.capacity ? { capacity: { gte: params.capacity } } : {}),
      ...(params.minPrice != null || params.maxPrice != null
        ? {
            price: {
              ...(params.minPrice != null ? { gte: params.minPrice } : {}),
              ...(params.maxPrice != null ? { lte: params.maxPrice } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: 'insensitive' as const } },
              { description: { contains: params.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, ...sortMap[params.sort]],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          category: { select: { name: true, slug: true, icon: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          vendor: { select: { businessName: true, verificationStatus: true } },
        },
      }),
    ]);

    res.json({
      data: items,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/:slug — a single approved listing's detail.
listingsRouter.get('/:slug', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findFirst({
      where: { slug: req.params.slug, status: 'approved' },
      include: {
        category: { select: { name: true, slug: true, icon: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        amenities: { include: { amenity: { select: { name: true, slug: true, icon: true } } } },
        vendor: {
          select: { businessName: true, verificationStatus: true, whatsappNumber: true },
        },
      },
    });

    if (!listing) throw notFound('Listing not found.');
    res.json({ data: listing });
  } catch (err) {
    next(err);
  }
});
