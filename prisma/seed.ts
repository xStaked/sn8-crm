import { PrismaClient, WorkspaceMemberRole } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  const workspaceName = process.env.SEED_WORKSPACE_NAME ?? 'SN8 Labs';
  const workspaceSlug = process.env.SEED_WORKSPACE_SLUG ?? 'sn8-labs';

  if (!email || !password) {
    throw new Error('Missing SEED_USER_EMAIL / SEED_USER_PASSWORD env vars');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });

    const workspace = await prisma.workspace.upsert({
      where: { slug: workspaceSlug },
      update: { name: workspaceName },
      create: { name: workspaceName, slug: workspaceSlug },
    });

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
      update: { role: WorkspaceMemberRole.owner },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceMemberRole.owner,
      },
    });

    // eslint-disable-next-line no-console
    console.log(`Seeded user: ${email}`);
    // eslint-disable-next-line no-console
    console.log(`Seeded workspace: ${workspace.name} (${workspace.slug})`);
    // eslint-disable-next-line no-console
    console.log(`Ensured membership: ${email} -> ${workspace.slug} as owner`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

