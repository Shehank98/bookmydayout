import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/utils.js';
import { badRequest } from '../lib/http-error.js';

/**
 * Auth / account routes. All require a valid Firebase token (requireAuth),
 * which also provisions the local users row on first login.
 */
export const authRouter = Router();

authRouter.use(requireAuth);

// GET /api/auth/me — the current user, plus their vendor profile if any.
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { vendor: { include: { subscriptionPlan: true } } },
    });
    res.json({ data: user });
  }),
);

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

// PATCH /api/auth/me — update basic profile fields.
authRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = updateMeSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: body });
    res.json({ data: user });
  }),
);

const becomeVendorSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  ownerName: z.string().trim().min(2).max(160).optional(),
  contactNumber: z.string().trim().min(5).max(30),
  whatsappNumber: z.string().trim().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().trim().max(300).optional(),
  nicOrBusinessDocUrl: z.string().url().optional(),
});

// POST /api/auth/become-vendor — upgrade the current user to a vendor.
// The vendor account starts as "pending" until an admin approves it.
authRouter.post(
  '/become-vendor',
  asyncHandler(async (req, res) => {
    const body = becomeVendorSchema.parse(req.body);

    const existing = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (existing) throw badRequest('You already have a vendor profile.');

    const [vendor] = await prisma.$transaction([
      prisma.vendor.create({
        data: { userId: req.user!.id, ...body },
      }),
      prisma.user.update({ where: { id: req.user!.id }, data: { role: 'vendor' } }),
    ]);

    res.status(201).json({ data: vendor });
  }),
);
