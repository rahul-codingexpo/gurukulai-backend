import Wallet from "./wallet.model.js";

const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

/** Get student advance (wallet credit). Returns 0 if no wallet. */
export async function getStudentAdvance(schoolId, studentId) {
  if (!schoolId || !studentId) return 0;
  const wallet = await Wallet.findOne({ schoolId, studentId }).select("credit").lean();
  return roundMoney(Math.max(0, Number(wallet?.credit) || 0));
}

/** Add overpayment excess to student advance balance. */
export async function addStudentAdvance(schoolId, studentId, amount) {
  const credit = roundMoney(amount);
  if (!schoolId || !studentId || !(credit > 0)) {
    return getStudentAdvance(schoolId, studentId);
  }
  const wallet = await Wallet.findOneAndUpdate(
    { schoolId, studentId },
    { $inc: { credit } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return roundMoney(Math.max(0, Number(wallet?.credit) || 0));
}

/**
 * Consume advance toward fees.
 * Returns { used, remaining }.
 */
export async function useStudentAdvance(schoolId, studentId, amount) {
  const requested = roundMoney(amount);
  if (!schoolId || !studentId || !(requested > 0)) {
    const remaining = await getStudentAdvance(schoolId, studentId);
    return { used: 0, remaining };
  }

  const wallet = await Wallet.findOne({ schoolId, studentId });
  if (!wallet) {
    return { used: 0, remaining: 0 };
  }

  const available = roundMoney(Math.max(0, Number(wallet.credit) || 0));
  const used = Math.min(available, requested);
  wallet.credit = roundMoney(Math.max(0, available - used));
  await wallet.save();
  return { used, remaining: wallet.credit };
}
