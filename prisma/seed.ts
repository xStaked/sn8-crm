import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing SEED_USER_EMAIL / SEED_USER_PASSWORD env vars');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded user: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

