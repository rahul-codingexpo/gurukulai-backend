/**
 * One-time backfill for existing FeeInvoice documents:
 *   baseAmount = amount (legacy invoices had no discount)
 *   discountPercent = 0
 *   discountAmount = 0
 *
 * Usage (from project root):
 *   node scripts/backfill-feeinvoice-discount.mjs
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import FeeInvoice from "../src/modules/accounting/feeInvoice.model.js";

dotenv.config();

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set in .env");
  process.exit(1);
}

await mongoose.connect(uri);

const filter = {
  $or: [{ baseAmount: { $exists: false } }, { baseAmount: null }],
};

const count = await FeeInvoice.countDocuments(filter);
console.log(`Found ${count} invoice(s) to backfill.`);

let updated = 0;
const cursor = FeeInvoice.find(filter);
for await (const doc of cursor) {
  doc.baseAmount = doc.amount;
  doc.discountPercent = doc.discountPercent ?? 0;
  doc.discountAmount = doc.discountAmount ?? 0;
  await doc.save();
  updated++;
}

console.log(`Done. Updated ${updated} invoice(s).`);
await mongoose.disconnect();
process.exit(0);
