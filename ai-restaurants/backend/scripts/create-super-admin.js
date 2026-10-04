/**
 * Creates or updates the super admin user.
 * Delegates to seedAdminUser in src/db/seedAdmin.js.
 */
import "../src/loadEnv.js";
import { seedAdminUser } from "../src/db/seedAdmin.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.error("Set DATABASE_URL in backend/.env or the environment.");
    process.exit(1);
  }

  const result = await seedAdminUser(url);
  if (result) {
    console.log("Super admin seeded:", result);
  }
}

main().catch((err) => {
  console.error("Super admin seed failed:", err.message || err);
  process.exit(1);
});
