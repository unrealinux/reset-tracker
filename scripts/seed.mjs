#!/usr/bin/env node
/**
 * Seeds the SQLite database from src/data/seed.ts.
 *
 *   node scripts/seed.mjs            # seed only when the table is empty
 *   node scripts/seed.mjs --force    # wipe reset rows and re-seed everything
 */

import { loadEnv } from "./_env.mjs";

loadEnv();

const force = process.argv.includes("--force");
const { openDatabase, seedDatabase } = await import("../src/lib/db.ts");
const { config } = await import("../src/lib/config.ts");

// Open directly rather than through getDb(), which seeds on first use and would
// make the reported counts meaningless.
const db = openDatabase(config.dbFile);

if (force) {
  db.exec("DELETE FROM resets");
  console.log("Cleared existing records.");
}

const result = seedDatabase(db, force);
const total = db.prepare("SELECT COUNT(*) AS n FROM resets").get().n;

console.log(`Database: ${config.dbFile}`);
console.log(
  result.seeded
    ? `Inserted ${result.inserted} record(s); ${total} total.`
    : `Already seeded (${total} records). Use --force to rebuild.`,
);
db.close();
