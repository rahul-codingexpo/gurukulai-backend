/**
 * One-time backfill: mark FeeInvoice rows as family when remarks
 * contain [FAMILY] or "Family:" (from By-father create).
 *
 * Usage (from gurukulai-backend root):
 *   node scripts/backfill-family-invoice-flag.js
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
  isFamilyInvoice: { $ne: true },
  remarks: { $regex: /\[FAMILY\]|Family\s*:/i },
};

const count = await FeeInvoice.countDocuments(filter);
console.log(`Found ${count} invoice(s) to mark as family.`);

const result = await FeeInvoice.updateMany(filter, {
  $set: { isFamilyInvoice: true },
});

console.log(`Done. Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
await mongoose.disconnect();
process.exit(0);
