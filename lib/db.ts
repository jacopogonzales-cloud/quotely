import { PrismaClient } from '@prisma/client';

// One Prisma client per server process. In development Next.js re-evaluates modules on every
// edit, so the client is parked on globalThis to avoid opening a new connection each time.
// Without DATABASE_URL the local SQLite file prisma/dev.db is used (same default as prisma.config.ts).

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: process.env.DATABASE_URL || 'file:./dev.db' });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
