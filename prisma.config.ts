import { defineConfig } from 'prisma/config';

// With a config file, the Prisma CLI no longer loads .env files. Local development needs no
// DATABASE_URL: it falls back to the SQLite file prisma/dev.db (resolved relative to the schema).
// lib/db.ts applies the same default at runtime.
process.env.DATABASE_URL ||= 'file:./dev.db';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
