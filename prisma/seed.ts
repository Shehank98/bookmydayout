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

// The 25 administrative districts of Sri Lanka.
const districts = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Monaragala', 'Ratnapura', 'Kegalle',
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

  for (const name of districts) {
    await prisma.district.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Demo listings are on by default; set SEED_SAMPLE_DATA=false to skip them
  // (e.g. once real vendors have signed up).
  const withSamples = process.env.SEED_SAMPLE_DATA !== 'false';
  if (withSamples) await seedSampleListings();

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${categories.length} categories, ${amenities.length} amenities, ` +
      `${plans.length} plans, ${districts.length} districts` +
      (withSamples ? ', and sample listings.' : ' (sample listings skipped).'),
  );
}

/**
 * Demo content so the site looks alive before real vendors sign up.
 * Photos are fetched live from Unsplash's public image CDN (real internet
 * images). Everything is idempotent (keyed by slug / firebase_uid).
 */
async function seedSampleListings() {
  // A demo vendor (approved) to own the sample listings.
  const demoUser = await prisma.user.upsert({
    where: { firebaseUid: 'demo-vendor-seed' },
    update: {},
    create: {
      firebaseUid: 'demo-vendor-seed',
      name: 'Demo Stays LK',
      email: 'demo@bookmydayout.example',
      role: 'vendor',
    },
  });

  const premium = await prisma.subscriptionPlan.findFirst({ where: { name: 'Premium' } });
  const vendor = await prisma.vendor.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      businessName: 'Demo Stays LK',
      ownerName: 'Sample Owner',
      contactNumber: '+94771234567',
      whatsappNumber: '+94771234567',
      email: 'demo@bookmydayout.example',
      address: 'Sri Lanka',
      verificationStatus: 'approved',
      subscriptionPlanId: premium?.id,
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date(Date.now() + 365 * 86400_000),
    },
  });

  const cats = await prisma.category.findMany();
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  const ams = await prisma.amenity.findMany();
  const amBySlug = Object.fromEntries(ams.map((a) => [a.slug, a.id]));

  const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=80&auto=format&fit=crop`;

  const samples = [
    {
      slug: 'seaside-villa-galle-demo',
      title: 'Seaside Infinity Pool Villa',
      district: 'Galle', category: 'villas', price: 45000, capacity: 8, featured: true,
      description: 'A stunning beachfront villa with a private infinity pool overlooking the Indian Ocean. Perfect for family getaways and small groups.',
      amenities: ['pool', 'bbq', 'parking', 'ac', 'wifi', 'kitchen'],
      images: ['1613490493576-7fde63acd811', '1512917774080-9991f1c4c750', '1522708323590-d24dbb6b0267', '1580587771525-78b9dba3b914'],
    },
    {
      slug: 'hill-country-pool-day-kandy-demo',
      title: 'Hill Country Pool Day-Out',
      district: 'Kandy', category: 'pools', price: 3500, capacity: 20, featured: true,
      description: 'Spend the day by a spacious pool surrounded by tea-covered hills. Great for group day-outs and celebrations.',
      amenities: ['pool', 'bbq', 'parking', 'wifi'],
      images: ['1571896349842-33c89424de2d', '1600607687939-ce8a6c25118c', '1499793983690-e29da59ef1c2'],
    },
    {
      slug: 'lakeside-camping-nuwara-eliya-demo',
      title: 'Lakeside Camping Retreat',
      district: 'Nuwara Eliya', category: 'camping', price: 6000, capacity: 12, featured: true,
      description: 'Wake up to misty mornings by the lake. Tents, bonfire and BBQ facilities included for an unforgettable outdoor experience.',
      amenities: ['bbq', 'parking', 'pet-friendly'],
      images: ['1504280390367-361c6d9f38f4', '1537565266759-34bbc16b62a3', '1500382017468-9049fed747ef'],
    },
    {
      slug: 'garden-villa-ella-demo',
      title: 'Cozy Garden Villa in Ella',
      district: 'Badulla', category: 'villas', price: 22000, capacity: 6, featured: false,
      description: 'A peaceful villa surrounded by gardens with mountain views, ideal for couples and small families.',
      amenities: ['parking', 'ac', 'wifi', 'kitchen', 'garden'],
      images: ['1499793983690-e29da59ef1c2', '1522708323590-d24dbb6b0267', '1512917774080-9991f1c4c750'],
    },
    {
      slug: 'organic-farm-stay-ella-demo',
      title: 'Organic Farm Stay Experience',
      district: 'Monaragala', category: 'farms', price: 8000, capacity: 10, featured: false,
      description: 'Stay on a working organic farm, enjoy fresh produce and connect with nature. Family and pet friendly.',
      amenities: ['parking', 'garden', 'pet-friendly', 'kitchen'],
      images: ['1500382017468-9049fed747ef', '1600607687939-ce8a6c25118c', '1504280390367-361c6d9f38f4'],
    },
    {
      slug: 'beach-pool-villa-colombo-demo',
      title: 'Modern Pool Villa near Colombo',
      district: 'Colombo', category: 'villas', price: 38000, capacity: 8, featured: false,
      description: 'Contemporary villa with a large pool, close to the city yet private and quiet. Ideal for weekend escapes.',
      amenities: ['pool', 'ac', 'wifi', 'parking', 'bbq', 'kitchen'],
      images: ['1580587771525-78b9dba3b914', '1613490493576-7fde63acd811', '1571896349842-33c89424de2d'],
    },
  ];

  for (const s of samples) {
    const exists = await prisma.listing.findUnique({ where: { slug: s.slug } });
    if (exists) continue;
    await prisma.listing.create({
      data: {
        vendorId: vendor.id,
        slug: s.slug,
        title: s.title,
        description: s.description,
        categoryId: catBySlug[s.category],
        district: s.district,
        address: `${s.district}, Sri Lanka`,
        price: s.price,
        priceUnit: s.category === 'pools' ? 'person' : 'night',
        capacity: s.capacity,
        contactCall: '+94771234567',
        contactWhatsapp: '+94771234567',
        status: 'approved',
        isFeatured: s.featured,
        images: { create: s.images.map((id, i) => ({ storageUrl: U(id), sortOrder: i })) },
        amenities: {
          create: s.amenities
            .filter((a) => amBySlug[a])
            .map((a) => ({ amenityId: amBySlug[a] })),
        },
      },
    });
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
