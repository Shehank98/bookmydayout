import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/utils.js';
import { signLocalToken } from '../lib/jwt.js';
import { badRequest, unauthorized } from '../lib/http-error.js';

/**
 * Auth / account routes.
 *
 * /register and /login are PUBLIC and use email/password handled entirely by
 * this backend (no Firebase). They return a backend JWT the frontend stores
 * and sends as a Bearer token. Google sign-in is handled on the frontend via
 * Firebase, and those tokens are verified by the auth middleware.
 *
 * Everything below `authRouter.use(requireAuth)` needs a valid token.
 */
export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  name: z.string().trim().min(1).max(120).optional(),
});

// POST /api/auth/register — create an email/password account.
authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, name } = credsSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw badRequest('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: normalizedEmail, passwordHash, name: name ?? null },
    });

    const token = signLocalToken(user.id);
    res.status(201).json({
      token,
      data: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }),
);

// POST /api/auth/login — email/password login.
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) throw unauthorized('Invalid email or password.');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid email or password.');

    const token = signLocalToken(user.id);
    res.json({
      token,
      data: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }),
);

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
