import fs from "fs/promises";
import path from "path";
import Homework from "../homework/homework.model.js";
import HomeworkSubmission from "../homework/homeworkSubmission.model.js";
import HomeworkQuestion from "../homework/homeworkQuestion.model.js";
import Student from "../student/student.model.js";
import ClassModel from "../academic/class.model.js";
import Section from "../academic/section.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const parseBoolean = (v) => {
  if (v === true || v === "true" || v === "1" || v === 1) return true;
  if (v === false || v === "false" || v === "0" || v === 0) return false;
  return undefined;
};

const parseOptionalMaxScore = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
};

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).select(
      "_id schoolId className section name admissionNumber",
    );
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).select(
      "_id schoolId className section name admissionNumber",
    );
  }
  return null;
};

/** Map student's className/section strings to Class/Section ObjectIds (same idea as mobile timetable). */
const resolveStudentClassSectionIds = async (student) => {
  const schoolId = student.schoolId;
  const classes = await ClassModel.find({
    schoolId,
    name: student.className,
  }).select("_id");

  if (!classes.length) {
    return { classIds: [], sectionIds: [] };
  }

  const classIds = classes.map((c) => c._id);
  const sections = await Section.find({
    schoolId,
    classId: { $in: classIds },
    name: student.section,
  }).select("_id");

  return { classIds, sectionIds: sections.map((s) => s._id) };
};

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const extFromStored = (p) => path.extname(p || "").toLowerCase();

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const inferMime = (storedPath) =>
  MIME_BY_EXT[extFromStored(storedPath)] || "application/octet-stream";

const kindFromMime = (mime) => {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("word")) return "document";
  return "other";
};

const studentHomeworkStatus = (submitted, due, now) => {
  if (submitted) return "SUBMITTED";
  if (due && now > due) return "OVERDUE";
  return "PENDING";
};

const statusLabel = (status) => {
  if (status === "SUBMITTED") return "Submitted";
  if (status === "OVERDUE") return "Overdue";
  return "Pending";
};

async function fileSizeBytes(storedPath) {
  const rel = String(storedPath || "").replace(/^\/+/, "");
  if (!rel) return null;
  const diskPath = path.join(process.cwd(), ...rel.split(/[/\\]/));
  try {
    const st = await fs.stat(diskPath);
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

async function buildFileResource(storedPath, downloadable, withSize) {
  const fileName = path.basename(storedPath);
  const mimeType = inferMime(storedPath);
  const sizeBytes = withSize ? await fileSizeBytes(storedPath) : null;
  const ext = extFromStored(storedPath).replace(".", "");
  const url = storedPath.startsWith("/") ? storedPath : `/${storedPath}`;
  return {
    id: storedPath,
    type: "file",
    url,
    fileName,
    extension: ext || null,
    mimeType,
    kind: kindFromMime(mimeType),
    sizeBytes,
    downloadable,
  };
}

function buildLinkResource(linkUrl) {
  return {
    id: "link",
    type: "link",
    url: String(linkUrl).trim(),
    fileName: "Link",
    extension: null,
    mimeType: null,
    kind: "link",
    sizeBytes: null,
    downloadable: true,
  };
}

async function buildTeacherResourcesList(hw, withSize) {
  const downloadable = hw.downloadable !== false;
  const out = [];
  for (const p of hw.files || []) {
    out.push(await buildFileResource(p, downloadable, withSize));
  }
  if (hw.url?.trim()) out.push(buildLinkResource(hw.url));
  return out;
}

function firstPreviewImage(files) {
  if (!files?.length) return null;
  const hit = files.find((p) => IMAGE_EXT.has(extFromStored(p)));
  return hit || null;
}

function buildStudentListItem(hw, submission, now = new Date()) {
  const due = hw.dueDate ? new Date(hw.dueDate) : null;
  const submitted = !!submission;
  const status = studentHomeworkStatus(submitted, due, now);
  const subj = hw.subjectId;
  const files = hw.files || [];
  return {
    _id: hw._id,
    title: hw.title,
    description: hw.description,
    date: hw.date,
    dueDate: hw.dueDate,
    url: hw.url,
    files,
    downloadable: hw.downloadable,
    classId: hw.classId,
    sectionId: hw.sectionId,
    subjectId: hw.subjectId,
    createdBy: hw.createdBy,
    createdAt: hw.createdAt,
    updatedAt: hw.updatedAt,
    topic: hw.topic || "",
    maxScore: hw.maxScore ?? null,
    subjectName: subj?.name ?? null,
    subjectCode: subj?.code ?? null,
    status,
    statusLabel: statusLabel(status),
    hasSubmission: submitted,
    isOverdue: status === "OVERDUE",
    previewImageUrl: firstPreviewImage(files),
    resourceCount: files.length + (hw.url?.trim() ? 1 : 0),
    submission: submission
      ? {
          _id: submission._id,
          note: submission.note,
          files: submission.files || [],
          submittedAt: submission.submittedAt,
          updatedAt: submission.updatedAt,
        }
      : null,
  };
}

function summaryFromStudentItems(items) {
  let pending = 0;
  let overdue = 0;
  let completed = 0;
  for (const i of items) {
    if (i.status === "SUBMITTED") completed += 1;
    else if (i.status === "OVERDUE") overdue += 1;
    else pending += 1;
  }
  return { pending, overdue, completed };
}

const teacherHomeworkStatus = (dueDate, submissionPercent, now = new Date()) => {
  const due = dueDate ? new Date(dueDate) : null;
  if (submissionPercent >= 100) return "COMPLETED";
  if (due && now > due) return "OVERDUE";
  return "ACTIVE";
};

const teacherStatusLabel = (status) => {
  if (status === "COMPLETED") return "Completed";
  if (status === "OVERDUE") return "Overdue";
  return "Active";
};

const pctFloor = (n, d) => (d > 0 ? Math.floor((n / d) * 100) : 0);

const studentCountCacheKey = (schoolId, className, section) =>
  `${String(schoolId)}::${String(className || "")}::${String(section || "")}`;

async function resolveTotalStudentsForHomework(hw, cache) {
  const className = hw.classId?.name || null;
  const sectionName = hw.sectionId?.name || null;
  if (!className || !sectionName) return 0;
  const key = studentCountCacheKey(hw.schoolId, className, sectionName);
  if (cache.has(key)) return cache.get(key);
  const total = await Student.countDocuments({
    schoolId: hw.schoolId,
    className,
    section: sectionName,
    status: "ACTIVE",
  });
  cache.set(key, total);
  return total;
}

function buildTeacherListItem(hw, submittedCount, totalStudents, now = new Date()) {
  const submissionPercent = pctFloor(submittedCount, totalStudents);
  const status = teacherHomeworkStatus(hw.dueDate, submissionPercent, now);
  return {
    _id: hw._id,
    title: hw.title,
    description: hw.description,
    subjectName: hw.subjectId?.name || null,
    subjectCode: hw.subjectId?.code || null,
    className: hw.classId?.name || null,
    section: hw.sectionId?.name || null,
    assignedDate: hw.date || null,
    dueDate: hw.dueDate || null,
    status,
    statusLabel: teacherStatusLabel(status),
    submissionStats: {
      submitted: submittedCount,
      totalStudents,
      percentage: submissionPercent,
    },
    attachmentsCount: (hw.files || []).length,
  };
}

async function serializeStudentHomeworkDetail(hw, submission, now = new Date()) {
  const due = hw.dueDate ? new Date(hw.dueDate) : null;
  const submitted = !!submission;
  const status = studentHomeworkStatus(submitted, due, now);
  const subj = hw.subjectId;
  const resources = await buildTeacherResourcesList(hw, true);

  let submissionOut = null;
  if (submission) {
    const subFiles = await Promise.all(
      (submission.files || []).map((p) => buildFileResource(p, true, true)),
    );
    submissionOut = {
      _id: submission._id,
      note: submission.note,
      files: subFiles,
      submittedAt: submission.submittedAt,
      updatedAt: submission.updatedAt,
    };
  }

  return {
    _id: hw._id,
    title: hw.title,
    description: hw.description,
    date: hw.date,
    dueDate: hw.dueDate,
    url: hw.url,
    files: hw.files || [],
    downloadable: hw.downloadable,
    classId: hw.classId,
    sectionId: hw.sectionId,
    subjectId: hw.subjectId,
    createdBy: hw.createdBy,
    createdAt: hw.createdAt,
    updatedAt: hw.updatedAt,
    topic: hw.topic || "",
    maxScore: hw.maxScore ?? null,
    subjectName: subj?.name ?? null,
    subjectCode: subj?.code ?? null,
    status,
    statusLabel: statusLabel(status),
    hasSubmission: submitted,
    isOverdue: status === "OVERDUE",
    previewImageUrl: firstPreviewImage(hw.files || []),
    resourceCount: resources.length,
    resources,
    submission: submissionOut,
  };
}

/** GET /api/mobile/homework — Student/Parent: class homework; Teacher: assignments they created */
export const listMobileHomework = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      if (!classIds.length || !sectionIds.length) {
        return res.json({
          success: true,
          summary: { pending: 0, overdue: 0, completed: 0 },
          data: [],
        });
      }

      const filter = {
        schoolId: student.schoolId,
        classId: { $in: classIds },
        sectionId: { $in: sectionIds },
      };

      const { subjectId, subject, filter: statusFilter } = req.query;
      if (subjectId) filter.subjectId = subjectId;
      if (subject) {
        const subjectRegex = new RegExp(`^${String(subject).trim()}$`, "i");
        const classesFilter = {
          schoolId: student.schoolId,
          classId: { $in: classIds },
          sectionId: { $in: sectionIds },
        };
        if (subjectId) classesFilter._id = subjectId;

        const matchedSubjectIds = await Homework.find(classesFilter)
          .populate({
            path: "subjectId",
            select: "_id name",
            match: { name: subjectRegex },
          })
          .select("subjectId")
          .lean();
        const ids = matchedSubjectIds
          .map((x) => x.subjectId?._id)
          .filter(Boolean);
        if (!ids.length) {
          return res.json({
            success: true,
            summary: { pending: 0, overdue: 0, completed: 0 },
            data: [],
          });
        }
        filter.subjectId = { $in: ids };
      }

      const list = await Homework.find(filter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .populate("createdBy", "name")
        .sort({ dueDate: 1, createdAt: -1 });

      const hwIds = list.map((h) => h._id);
      const submissions = await HomeworkSubmission.find({
        studentId: student._id,
        homeworkId: { $in: hwIds },
      }).lean();

      const subByHw = new Map(
        submissions.map((s) => [String(s.homeworkId), s]),
      );

      const now = new Date();
      let items = list.map((hw) =>
        buildStudentListItem(hw, subByHw.get(String(hw._id)) || null, now),
      );

      const summary = summaryFromStudentItems(items);

      if (statusFilter === "pending") {
        items = items.filter((i) => i.status === "PENDING");
      } else if (statusFilter === "submitted" || statusFilter === "completed") {
        items = items.filter((i) => i.status === "SUBMITTED");
      } else if (statusFilter === "overdue") {
        items = items.filter((i) => i.status === "OVERDUE");
      }

      return res.json({ success: true, summary, data: items });
    }

    if (role === "Teacher") {
      if (!schoolId) {
        return res.status(400).json({
          success: false,
          message: "School context missing",
        });
      }

      const filter = { schoolId, createdBy: req.user._id };
      if (req.query.classId) filter.classId = req.query.classId;
      if (req.query.sectionId) filter.sectionId = req.query.sectionId;
      if (req.query.subjectId) filter.subjectId = req.query.subjectId;
      if (req.query.search) {
        filter.title = { $regex: String(req.query.search).trim(), $options: "i" };
      }

      const list = await Homework.find(filter)
        .populate("classId", "name")
        .populate("sectionId", "name")
        .populate("subjectId", "name code")
        .populate("createdBy", "name")
        .sort({ dueDate: -1, createdAt: -1 });

      const hwIds = list.map((h) => h._id);
      const submissionRows = hwIds.length
        ? await HomeworkSubmission.aggregate([
            { $match: { homeworkId: { $in: hwIds } } },
            { $group: { _id: "$homeworkId", count: { $sum: 1 } } },
          ])
        : [];
      const submittedByHw = new Map(
        submissionRows.map((r) => [String(r._id), r.count || 0]),
      );

      const now = new Date();
      const cache = new Map();
      let items = [];
      for (const hw of list) {
        const submittedCount = submittedByHw.get(String(hw._id)) || 0;
        const totalStudents = await resolveTotalStudentsForHomework(hw, cache);
        items.push(buildTeacherListItem(hw, submittedCount, totalStudents, now));
      }

      const summary = {
        active: items.filter((i) => i.status === "ACTIVE").length,
        completed: items.filter((i) => i.status === "COMPLETED").length,
        overdue: items.filter((i) => i.status === "OVERDUE").length,
      };

      const statusFilter = String(req.query.status || "").toUpperCase();
      if (["ACTIVE", "COMPLETED", "OVERDUE"].includes(statusFilter)) {
        items = items.filter((i) => i.status === statusFilter);
      }

      return res.json({ success: true, summary, data: items });
    }

    return res.status(403).json({
      success: false,
      message: "Homework list is available for Student, Parent, or Teacher",
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/mobile/homework/subjects — Student/Parent subject tabs */
export const listMobileHomeworkSubjects = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only students and parents can access homework subjects",
      });
    }

    const student = await resolveStudentSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
    if (!classIds.length || !sectionIds.length) {
      return res.json({ success: true, data: [] });
    }

    const rows = await Homework.aggregate([
      {
        $match: {
          schoolId: student.schoolId,
          classId: { $in: classIds },
          sectionId: { $in: sectionIds },
        },
      },
      {
        $group: {
          _id: "$subjectId",
          totalHomework: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "subjects",
          localField: "_id",
          foreignField: "_id",
          as: "subject",
        },
      },
      { $unwind: "$subject" },
      {
        $project: {
          _id: 0,
          subjectId: "$subject._id",
          subjectName: "$subject.name",
          subjectCode: "$subject.code",
          totalHomework: 1,
        },
      },
      { $sort: { subjectName: 1 } },
    ]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/** GET /api/mobile/homework/:id */
export const getMobileHomeworkById = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;

    const homework = await Homework.findById(req.params.id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code type")
      .populate("createdBy", "name");

    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found for this user",
        });
      }

      if (String(homework.schoolId) !== String(student.schoolId)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this homework",
        });
      }

      const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
      const okClass = classIds.some((id) => String(id) === String(homework.classId));
      const okSection = sectionIds.some((id) => String(id) === String(homework.sectionId));
      if (!okClass || !okSection) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this homework",
        });
      }

      const submission = await HomeworkSubmission.findOne({
        homeworkId: homework._id,
        studentId: student._id,
      }).lean();

      const now = new Date();
      const data = await serializeStudentHomeworkDetail(
        homework,
        submission,
        now,
      );
      return res.json({
        success: true,
        data,
      });
    }

    if (role === "Teacher") {
      if (!schoolId || String(homework.schoolId) !== String(schoolId)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to view this homework",
        });
      }
      if (String(homework.createdBy?._id ?? homework.createdBy) !== String(req.user._id)) {
        return res.status(403).json({
          success: false,
          message: "You can only open homework you assigned",
        });
      }

      const totalStudents = await Student.countDocuments({
        schoolId: homework.schoolId,
        className: homework.classId?.name || "",
        section: homework.sectionId?.name || "",
        status: "ACTIVE",
      });
      const submitted = await HomeworkSubmission.countDocuments({
        homeworkId: homework._id,
      });
      const percentage = pctFloor(submitted, totalStudents);
      const attachments = await Promise.all(
        (homework.files || []).map((p) => buildFileResource(p, true, true)),
      );

      return res.json({
        success: true,
        data: {
          _id: homework._id,
          subjectName: homework.subjectId?.name || null,
          className: homework.classId?.name || null,
          section: homework.sectionId?.name || null,
          title: homework.title,
          description: homework.description,
          assignedDate: homework.date || null,
          dueDate: homework.dueDate || null,
          submissionStatus: {
            submitted,
            totalStudents,
            percentage,
          },
          attachedDocuments: attachments,
        },
      });
    }

    return res.status(403).json({
      success: false,
      message: "Not allowed",
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/mobile/homework — Teacher assigns (multipart + fields, same as web) */
export const createMobileHomework = async (req, res, next) => {
  try {
    if (roleNameOf(req) !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can assign homework from the app",
      });
    }

    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const body = req.body || {};
    const classId = body.classId;
    const sectionId = body.sectionId;
    const subjectId = body.subjectId;
    const title = body.title;
    const topic =
      body.topic !== undefined ? String(body.topic).trim() : "";
    const maxScoreParsed = parseOptionalMaxScore(body.maxScore);
    const description = body.description || "";
    const date = body.date ? new Date(body.date) : new Date();
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const url = body.url || "";

    if (!classId || !sectionId || !subjectId || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        message:
          "classId, sectionId, subjectId, title and dueDate are required",
      });
    }

    if (new Date(dueDate) < date) {
      return res.status(400).json({
        success: false,
        message: "dueDate must be on or after date",
      });
    }

    const downloadable = parseBoolean(body.downloadable);
    const sendSmsToStudents = parseBoolean(body.sendSmsToStudents);
    const sendSmsToParents = parseBoolean(body.sendSmsToParents);

    const filePaths = [];
    if (req.files && req.files.files && Array.isArray(req.files.files)) {
      req.files.files.forEach((f) => {
        filePaths.push(`/uploads/${f.filename}`);
      });
    } else if (req.files && req.files.files) {
      filePaths.push(`/uploads/${req.files.files.filename}`);
    }

    const homework = await Homework.create({
      schoolId,
      classId,
      sectionId,
      subjectId,
      title,
      topic,
      ...(maxScoreParsed !== undefined ? { maxScore: maxScoreParsed } : {}),
      description,
      date,
      dueDate,
      url,
      files: filePaths,
      downloadable: downloadable !== false,
      sendSmsToStudents: sendSmsToStudents === true,
      sendSmsToParents: sendSmsToParents === true,
      createdBy: req.user._id,
    });

    const populated = await Homework.findById(homework._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name");

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/mobile/homework/:id — Teacher updates own assignment */
export const updateMobileHomework = async (req, res, next) => {
  try {
    if (roleNameOf(req) !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can update homework from the app",
      });
    }

    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const homework = await Homework.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    if (String(homework.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit homework you assigned",
      });
    }

    const body = req.body || {};
    if (body.classId !== undefined) homework.classId = body.classId;
    if (body.sectionId !== undefined) homework.sectionId = body.sectionId;
    if (body.subjectId !== undefined) homework.subjectId = body.subjectId;
    if (body.title !== undefined) homework.title = body.title;
    if (body.topic !== undefined) homework.topic = String(body.topic).trim();
    if (body.maxScore !== undefined) {
      if (body.maxScore === null || body.maxScore === "") {
        homework.set("maxScore", undefined);
      } else {
        const n = parseOptionalMaxScore(body.maxScore);
        if (n !== undefined) homework.maxScore = n;
      }
    }
    if (body.description !== undefined) homework.description = body.description;
    if (body.date !== undefined) homework.date = new Date(body.date);
    if (body.dueDate !== undefined) homework.dueDate = new Date(body.dueDate);
    if (body.url !== undefined) homework.url = body.url;
    if (parseBoolean(body.downloadable) !== undefined)
      homework.downloadable = parseBoolean(body.downloadable);
    if (parseBoolean(body.sendSmsToStudents) !== undefined)
      homework.sendSmsToStudents = parseBoolean(body.sendSmsToStudents);
    if (parseBoolean(body.sendSmsToParents) !== undefined)
      homework.sendSmsToParents = parseBoolean(body.sendSmsToParents);

    if (req.files && req.files.files) {
      const newPaths = Array.isArray(req.files.files)
        ? req.files.files.map((f) => `/uploads/${f.filename}`)
        : [`/uploads/${req.files.files.filename}`];
      homework.files = [...(homework.files || []), ...newPaths];
    }

    if (homework.dueDate < homework.date) {
      return res.status(400).json({
        success: false,
        message: "dueDate must be on or after date",
      });
    }

    await homework.save();

    const populated = await Homework.findById(homework._id)
      .populate("classId", "name")
      .populate("sectionId", "name")
      .populate("subjectId", "name code")
      .populate("createdBy", "name");

    res.json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/mobile/homework/:id */
export const deleteMobileHomework = async (req, res, next) => {
  try {
    if (roleNameOf(req) !== "Teacher") {
      return res.status(403).json({
        success: false,
        message: "Only teachers can delete homework from the app",
      });
    }

    const schoolId = req.user?.schoolId?._id ?? req.user?.schoolId ?? null;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School context missing",
      });
    }

    const homework = await Homework.findOne({
      _id: req.params.id,
      schoolId,
    });

    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    if (String(homework.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete homework you assigned",
      });
    }

    await HomeworkSubmission.deleteMany({ homeworkId: homework._id });
    await homework.deleteOne();

    res.json({ success: true, message: "Homework deleted" });
  } catch (err) {
    next(err);
  }
};

const collectUploadedPaths = (req) => {
  const filePaths = [];
  if (req.files && req.files.files && Array.isArray(req.files.files)) {
    req.files.files.forEach((f) => {
      filePaths.push(`/uploads/${f.filename}`);
    });
  } else if (req.files && req.files.files) {
    filePaths.push(`/uploads/${req.files.files.filename}`);
  }
  return filePaths;
};

/** POST /api/mobile/homework/:id/submit — Student/Parent uploads work */
export const submitMobileHomework = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only students (or parent on behalf of child) can submit homework",
      });
    }

    const student = await resolveStudentSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const homework = await Homework.findById(req.params.id);
    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    if (String(homework.schoolId) !== String(student.schoolId)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to submit for this homework",
      });
    }

    const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
    const okClass = classIds.some((id) => String(id) === String(homework.classId));
    const okSection = sectionIds.some((id) => String(id) === String(homework.sectionId));
    if (!okClass || !okSection) {
      return res.status(403).json({
        success: false,
        message: "This homework is not for your class/section",
      });
    }

    const body = req.body || {};
    const note = (body.note !== undefined ? String(body.note) : "").trim();
    const filePaths = collectUploadedPaths(req);

    const existing = await HomeworkSubmission.findOne({
      homeworkId: homework._id,
      studentId: student._id,
    });

    const nextFiles =
      filePaths.length > 0
        ? filePaths
        : existing?.files?.length
          ? [...existing.files]
          : [];

    if (!nextFiles.length && !note) {
      return res.status(400).json({
        success: false,
        message: "Add at least one file or a text note for your submission",
      });
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homeworkId: homework._id, studentId: student._id },
      {
        $set: {
          schoolId: student.schoolId,
          note,
          files: nextFiles,
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    res.status(201).json({
      success: true,
      data: {
        _id: submission._id,
        homeworkId: submission.homeworkId,
        note: submission.note,
        files: submission.files,
        submittedAt: submission.submittedAt,
        updatedAt: submission.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/** POST /api/mobile/homework/:id/questions — Ask teacher question on homework */
export const askTeacherOnHomework = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only students (or parent on behalf of child) can ask questions",
      });
    }

    const student = await resolveStudentSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found for this user",
      });
    }

    const homework = await Homework.findById(req.params.id);
    if (!homework) {
      return res.status(404).json({
        success: false,
        message: "Homework not found",
      });
    }

    if (String(homework.schoolId) !== String(student.schoolId)) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to ask on this homework",
      });
    }

    const { classIds, sectionIds } = await resolveStudentClassSectionIds(student);
    const okClass = classIds.some((id) => String(id) === String(homework.classId));
    const okSection = sectionIds.some((id) => String(id) === String(homework.sectionId));
    if (!okClass || !okSection) {
      return res.status(403).json({
        success: false,
        message: "This homework is not for your class/section",
      });
    }

    const question = String(req.body?.question || "").trim();
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "question is required",
      });
    }
    if (question.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "question must be <= 1000 characters",
      });
    }

    const doc = await HomeworkQuestion.create({
      schoolId: student.schoolId,
      homeworkId: homework._id,
      studentId: student._id,
      askedByUserId: req.user._id,
      question,
      status: "OPEN",
    });

    return res.status(201).json({
      success: true,
      message: "Question sent to teacher",
      data: {
        _id: doc._id,
        homeworkId: doc.homeworkId,
        question: doc.question,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};