import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/utils.js';
import { notFound } from '../lib/http-error.js';

/**
 * Authenticated end-user features: favorites (wishlist) and contact history.
 */
export const meRouter = Router();

meRouter.use(requireAuth);

// GET /api/me/favorites — the user's saved listings.
meRouter.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
    res.json({ data: favorites.map((f) => f.listing) });
  }),
);

// POST /api/me/favorites/:listingId — add to wishlist.
meRouter.post(
  '/favorites/:listingId',
  asyncHandler(async (req, res) => {
    const { listingId } = z.object({ listingId: z.string().uuid() }).parse(req.params);

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('Listing not found.');

    await prisma.$transaction(async (tx) => {
      const created = await tx.favorite.createMany({
        data: { userId: req.user!.id, listingId },
        skipDuplicates: true,
      });
      if (created.count > 0) {
        await tx.listing.update({
          where: { id: listingId },
          data: { favoriteCount: { increment: 1 } },
        });
      }
    });

    res.status(201).json({ ok: true });
  }),
);

// DELETE /api/me/favorites/:listingId — remove from wishlist.
meRouter.delete(
  '/favorites/:listingId',
  asyncHandler(async (req, res) => {
    const { listingId } = z.object({ listingId: z.string().uuid() }).parse(req.params);

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.favorite.deleteMany({
        where: { userId: req.user!.id, listingId },
      });
      if (deleted.count > 0) {
        await tx.listing.update({
          where: { id: listingId },
          data: { favoriteCount: { decrement: 1 } },
        });
      }
    });

    res.json({ ok: true });
  }),
);

// GET /api/me/contacts — history of vendors the user reached out to.
meRouter.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    const contacts = await prisma.contactEvent.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            slug: true,
            contactCall: true,
            contactWhatsapp: true,
            vendor: { select: { businessName: true } },
          },
        },
      },
    });
    res.json({ data: contacts });
  }),
);
