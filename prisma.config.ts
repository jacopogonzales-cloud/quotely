import nextEnv from '@next/env';
import { defineConfig } from 'prisma/config';

// With a config file the Prisma CLI no longer reads .env files itself, so load them the way
// Next.js does (.env.local, .env): `npx prisma db push` and `npm run db:seed` then use the same
// DATABASE_URL as the app. On Render the variable comes from the service environment instead.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
