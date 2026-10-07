const { PrismaClient } = require("@prisma/client");

const globalForPrisma = globalThis;

// --- Production-write safety net --------------------------------------------
// DATABASE_URL points at the live Supabase database, so running this app on a
// developer machine talks to real business records. Outside of an actual
// production deployment we allow reads (handy for debugging against real data)
// but refuse writes, so an experiment can't mutate live bookings.
//
// To write to production deliberately, run the command with ALLOW_PROD_WRITES=1.
// On Vercel NODE_ENV is "production", so this guard is inert there.
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

function pointsAtProductionDb(url) {
  return typeof url === "string" && /supabase\.(co|com)/i.test(url);
}

const guardProductionWrites =
  process.env.NODE_ENV !== "production" &&
  process.env.ALLOW_PROD_WRITES !== "1" &&
  pointsAtProductionDb(process.env.DATABASE_URL);

function refuse(target) {
  throw new Error(
    `[db] Refused ${target} against the LIVE production database from a ` +
      `non-production environment. If this is deliberate, re-run with ALLOW_PROD_WRITES=1.`
  );
}

function createClient() {
  // Demo deployments must be pointed at the demo database, positively, or
  // nothing connects. See lib/demo.js.
  const demo = require("./demo");
  if (demo.isDemo()) {
    // The Supabase -> Vercel integration writes the demo's connection strings
    // as POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING, password included, so
    // nobody hand-assembles them (7 Oct 2026: two hand-typed attempts failed).
    // In demo mode those win; the live site never runs this branch.
    if (process.env.POSTGRES_PRISMA_URL) process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
    if (process.env.POSTGRES_URL_NON_POOLING) process.env.DIRECT_URL = process.env.POSTGRES_URL_NON_POOLING;
    demo.assertDemoDatabase();
  }
  const client = new PrismaClient();
  if (!guardProductionWrites) return client;

  console.warn(
    "\n\x1b[33m[db] Connected to the LIVE production database (Supabase).\x1b[0m\n" +
      "     Reads: allowed.  Writes: BLOCKED while NODE_ENV is not \"production\".\n" +
      "     Set ALLOW_PROD_WRITES=1 to override for a single command.\n"
  );

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) refuse(`${model}.${operation}()`);
          return query(args);
        },
      },
      async $executeRaw({ args, query }) {
        refuse("$executeRaw");
        return query(args);
      },
      async $executeRawUnsafe({ args, query }) {
        refuse("$executeRawUnsafe");
        return query(args);
      },
    },
  });
}

const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
