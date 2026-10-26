import { PrismaClient } from '@prisma/client';

// One Prisma client per server process, on the PostgreSQL database in DATABASE_URL (see
// env.example). In development Next.js re-evaluates modules on every edit, so the client is
// parked on globalThis to avoid opening a new connection pool each time.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
