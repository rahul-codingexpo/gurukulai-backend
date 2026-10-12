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
  if (typeof doc.toObject === "function") return doc.toObject();
  return JSON.parse(JSON.stringify(doc));
};

const buildSummary = ({ action, sourceType, changes }) => {
  if (action === "created") return `${sourceType} created`;
  if (action === "deleted") return `${sourceType} deleted (soft)`;
  if (action === "restored") return `${sourceType} restored`;
  if (action === "updated") {
    if (!changes?.length) return `${sourceType} updated`;
    const fields = changes.map((c) => c.field).slice(0, 4).join(", ");
    const more = changes.length > 4 ? ` +${changes.length - 4} more` : "";
    return `${sourceType} updated: ${fields}${more}`;
  }
  return `${sourceType} ${action}`;
};

const studentRefFromDoc = (doc) => {
  if (!doc) return undefined;
  const student = doc.studentId;
  if (student && typeof student === "object") {
    return {
      studentId: student._id || student.id,
      studentName: student.name || doc.studentName || "",
      admissionNumber: student.admissionNumber || doc.admissionNumber || "",
    };
  }
  return {
    studentId: typeof student === "string" || student instanceof Object ? student : undefined,
    studentName: doc.studentName || "",
    admissionNumber: doc.admissionNumber || "",
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
    const summary = buildSummary({ action, sourceType, changes });

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
