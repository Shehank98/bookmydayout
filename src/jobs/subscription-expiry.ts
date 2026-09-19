import { prisma } from '../lib/prisma.js';

/**
 * Scheduled maintenance for subscriptions (spec §6):
 *  - Mark vendors whose subscription has passed its expiry date as `expired`.
 *  - Hide (suspend) approved listings that exceed the vendor's allowed limit
 *    once they drop to the free tier — newest-first are kept.
 *
 * Runs on an interval from src/index.ts. Idempotent and safe to run often.
 */

const FREE_TIER_LIMIT = 1;

export async function runSubscriptionExpiry(): Promise<void> {
  const now = new Date();

  // 1) Expire lapsed subscriptions.
  const expired = await prisma.vendor.findMany({
    where: {
      subscriptionStatus: 'active',
      subscriptionExpiryDate: { lt: now },
    },
    select: { id: true },
  });

  for (const { id } of expired) {
    await prisma.vendor.update({ where: { id }, data: { subscriptionStatus: 'expired' } });
  }

  // 2) For vendors no longer on an active plan, enforce the free-tier limit by
  //    suspending the oldest approved listings beyond the limit.
  const downgraded = await prisma.vendor.findMany({
    where: { subscriptionStatus: { in: ['expired', 'cancelled', 'none'] } },
    select: { id: true },
  });

  for (const { id } of downgraded) {
    const approved = await prisma.listing.findMany({
      where: { vendorId: id, status: 'approved' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const toSuspend = approved.slice(FREE_TIER_LIMIT).map((l) => l.id);
    if (toSuspend.length > 0) {
      await prisma.listing.updateMany({
        where: { id: { in: toSuspend } },
        data: { status: 'suspended' },
      });
    }
  }

  if (expired.length || downgraded.length) {
    // eslint-disable-next-line no-console
    console.log(
      `[subscription-expiry] expired=${expired.length} vendors, checked ${downgraded.length} downgraded vendors.`,
    );
  }
}
