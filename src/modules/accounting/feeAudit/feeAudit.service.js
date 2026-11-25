import FeeAuditLog from "./feeAuditLog.model.js";

/**
 * Compute a list of changed fields between two plain objects.
 * Only fields present in `tracked` are compared; missing fields are skipped.
 */
export const diffTrackedFields = (before = {}, after = {}, tracked = []) => {
  const changes = [];
  for (const field of tracked) {
    const oldRaw = before?.[field];
    const newRaw = after?.[field];
    const oldVal = oldRaw instanceof Date ? oldRaw.toISOString() : oldRaw;
    const newVal = newRaw instanceof Date ? newRaw.toISOString() : newRaw;
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, oldValue: oldVal ?? null, newValue: newVal ?? null });
    }
  }
  return changes;
};

const toPlain = (doc) => {
  if (!doc) return null;
  try {
    if (typeof doc.toObject === "function") {
      const obj = doc.toObject({ depopulate: false });
      return JSON.parse(JSON.stringify(obj));
    }
    return JSON.parse(JSON.stringify(doc));
  } catch {
    if (typeof doc.toObject === "function") return doc.toObject();
    return doc;
  }
};

const isFamilyInvoiceDoc = (doc) => {
  if (!doc) return false;
  if (doc.isFamilyInvoice === true) return true;
  const remarks = String(doc.remarks || "").trim();
  return /\[FAMILY\]/i.test(remarks) || /\bFamily\s*:/i.test(remarks);
};

const fatherNameFromDoc = (doc) => {
  if (!doc) return "";
  const student = doc.studentId;
  if (student && typeof student === "object") {
    const name = String(student?.parents?.father?.name || "").trim();
    if (name) return name;
  }
  const fromRemarks = String(doc.remarks || "").match(
    /(?:\[FAMILY\]\s*)?Family\s*:\s*([^·\n|]+)/i,
  );
  return fromRemarks ? String(fromRemarks[1] || "").trim() : "";
};

const familySuffix = (doc) => {
  if (!isFamilyInvoiceDoc(doc)) return "";
  const fatherName = fatherNameFromDoc(doc);
  return fatherName ? ` — Family (${fatherName})` : " — Family";
};

const formatMoneyInr = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `₹${num.toLocaleString("en-IN")}`;
};

const buildSummary = ({ action, sourceType, changes, snapshot }) => {
  const suffix = familySuffix(snapshot);
  if (action === "created") {
    const amount = snapshot?.amount;
    const paid = snapshot?.paid;
    const moneyBits = [];
    if (amount != null && amount !== "") moneyBits.push(`amount ${formatMoneyInr(amount)}`);
    if (paid != null && Number(paid) > 0) moneyBits.push(`paid ${formatMoneyInr(paid)}`);
    const money = moneyBits.length ? ` (${moneyBits.join(", ")})` : "";
    return `${sourceType} created${money}${suffix}`;
  }
  if (action === "deleted") return `${sourceType} deleted (soft)${suffix}`;
  if (action === "restored") return `${sourceType} restored${suffix}`;
  if (action === "updated") {
    const paidChange = (changes || []).find((c) => c.field === "paid");
    if (paidChange) {
      const delta = Number(paidChange.newValue) - Number(paidChange.oldValue);
      const paidPart = Number.isFinite(delta) && delta > 0
        ? `payment +${formatMoneyInr(delta)} (paid ${formatMoneyInr(paidChange.oldValue)} → ${formatMoneyInr(paidChange.newValue)})`
        : `paid ${formatMoneyInr(paidChange.oldValue)} → ${formatMoneyInr(paidChange.newValue)}`;
      const otherFields = (changes || [])
        .filter((c) => c.field !== "paid")
        .map((c) => c.field)
        .slice(0, 3);
      const extras = otherFields.length ? `; ${otherFields.join(", ")}` : "";
      return `${sourceType} ${paidPart}${extras}${suffix}`;
    }
    if (!changes?.length) return `${sourceType} updated${suffix}`;
    const fields = changes.map((c) => c.field).slice(0, 4).join(", ");
    const more = changes.length > 4 ? ` +${changes.length - 4} more` : "";
    return `${sourceType} updated: ${fields}${more}${suffix}`;
  }
  return `${sourceType} ${action}${suffix}`;
};

const studentRefFromDoc = (doc) => {
  if (!doc) return undefined;
  const student = doc.studentId;
  const fatherName = fatherNameFromDoc(doc);
  if (student && typeof student === "object") {
    return {
      studentId: student._id || student.id,
      studentName: student.name || doc.studentName || "",
      admissionNumber: student.admissionNumber || doc.admissionNumber || "",
      fatherName,
    };
  }
  return {
    studentId: typeof student === "string" || student instanceof Object ? student : undefined,
    studentName: doc.studentName || "",
    admissionNumber: doc.admissionNumber || "",
    fatherName,
  };
};

/**
 * Write an audit log entry. Never throws — failures are logged and swallowed
 * so business logic isn't broken by the audit pipeline.
 */
export const writeFeeAudit = async ({
  schoolId,
  sourceType,
  sourceId,
  action,
  before,
  after,
  changes,
  user,
}) => {
  try {
    const snapshot = toPlain(after) || toPlain(before) || null;
    const studentRef = studentRefFromDoc(snapshot);
    const summary = buildSummary({ action, sourceType, changes, snapshot });

    return await FeeAuditLog.create({
      schoolId,
      sourceType,
      sourceId,
      action,
      changes: changes || [],
      snapshot,
      summary,
      studentRef,
      performedBy: user?._id,
      performedByName: user?.name || "",
      performedByRole: user?.roleId?.name || "",
      performedAt: new Date(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[feeAudit] failed to write audit log", err);
    return null;
  }
};
