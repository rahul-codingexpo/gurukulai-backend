import ClassModel from "../modules/academic/class.model.js";
import Section from "../modules/academic/section.model.js";
import { classNamesMatch, normalizeClassKey } from "./normalizeClassKey.util.js";

const escapeRegexLiteral = (s) =>
  String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Find Class documents for a school whose name matches a student/class label.
 * Exact match first, then Nursery/NUR/LKG/UKG/Grade aliases via normalizeClassKey.
 */
export const findClassesByLabel = async (schoolId, className) => {
  const label = String(className || "").trim();
  if (!schoolId || !label) return [];

  const exact = await ClassModel.find({
    schoolId,
    name: { $regex: `^${escapeRegexLiteral(label)}$`, $options: "i" },
  }).select("_id name");
  if (exact.length) return exact;

  const wanted = normalizeClassKey(label);
  if (!wanted) return [];

  const all = await ClassModel.find({ schoolId }).select("_id name");
  return all.filter((c) => classNamesMatch(c.name, label));
};

export const findSectionsForClasses = async (schoolId, classIds, sectionName) => {
  if (!schoolId || !classIds?.length) return [];
  const query = { schoolId, classId: { $in: classIds } };
  const label = String(sectionName || "").trim();
  if (label) {
    query.name = { $regex: `^${escapeRegexLiteral(label)}$`, $options: "i" };
  }
  return Section.find(query).select("_id classId");
};

export const resolveStudentClassSectionIds = async (student) => {
  if (!student?.schoolId) return { classIds: [], sectionIds: [] };
  const classes = await findClassesByLabel(student.schoolId, student.className);
  if (!classes.length) return { classIds: [], sectionIds: [] };

  const classIds = classes.map((c) => c._id);
  const sections = await findSectionsForClasses(
    student.schoolId,
    classIds,
    student.section,
  );
  return { classIds, sectionIds: sections.map((s) => s._id) };
};
