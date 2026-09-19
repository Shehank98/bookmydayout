import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed baseline reference data: categories, amenities and subscription plans.
 * Safe to run repeatedly — everything upserts by unique slug/name.
 */

const categories = [
  { name: 'Villas', slug: 'villas', icon: 'home' },
  { name: 'Dayouts', slug: 'dayouts', icon: 'sun' },
  { name: 'Pools', slug: 'pools', icon: 'waves' },
  { name: 'Camping', slug: 'camping', icon: 'tent' },
  { name: 'Farms', slug: 'farms', icon: 'tractor' },
];

const amenities = [
  { name: 'Swimming Pool', slug: 'pool', icon: 'waves' },
  { name: 'BBQ', slug: 'bbq', icon: 'flame' },
  { name: 'Parking', slug: 'parking', icon: 'car' },
  { name: 'Air Conditioning', slug: 'ac', icon: 'snowflake' },
  { name: 'WiFi', slug: 'wifi', icon: 'wifi' },
  { name: 'Kitchen', slug: 'kitchen', icon: 'utensils' },
  { name: 'Pet Friendly', slug: 'pet-friendly', icon: 'paw-print' },
  { name: 'Garden', slug: 'garden', icon: 'trees' },
];

const plans = [
  { name: 'Basic', price: 0, durationDays: 3650, listingLimit: 1, featuredIncluded: false },
  { name: 'Standard', price: 2500, durationDays: 30, listingLimit: 5, featuredIncluded: false },
  { name: 'Premium', price: 6000, durationDays: 30, listingLimit: 9999, featuredIncluded: true },
];

async function main() {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
  }
  for (const a of amenities) {
    await prisma.amenity.upsert({ where: { slug: a.slug }, update: a, create: a });
  }
  for (const p of plans) {
    // Plans have no natural unique key besides id; use name to avoid dupes.
    const existing = await prisma.subscriptionPlan.findFirst({ where: { name: p.name } });
    if (existing) {
      await prisma.subscriptionPlan.update({ where: { id: existing.id }, data: p });
    } else {
      await prisma.subscriptionPlan.create({ data: p });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${categories.length} categories, ${amenities.length} amenities, ${plans.length} plans.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
