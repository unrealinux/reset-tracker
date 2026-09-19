#!/usr/bin/env node
/**
 * Generates a VAPID keypair for Web Push. Paste the output into .env.local
 * and keep the private key secret.
 */

const { generateVapidKeys } = await import("../src/lib/webpush.ts");

const keys = generateVapidKeys();

console.log("Add these to .env.local (or your hosting provider's env):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
console.log("\nThe public key is also served at /api/push/public-key.");
