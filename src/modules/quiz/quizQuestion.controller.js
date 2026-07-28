import XLSX from "xlsx";
import QuizQuestion from "./quizQuestion.model.js";
import { normalizeClassKey } from "../../utils/normalizeClassKey.util.js";

const ok = (res, payload = {}) => res.json({ success: true, ...payload });

const fail = (res, status, message, errors = undefined) =>
  res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });

const resolveStudentContextForMobileQuiz = async (req) => {
  const roleName = req.user?.roleId?.name;
  if (!["Student", "Parent"].includes(roleName)) {
    const err = new Error("Quizzes are available for Student and Parent only");
    err.statusCode = 403;
    throw err;
  }

  const Student = (await import("../student/student.model.js")).default;
  let studentDoc;
  if (roleName === "Student") {
    studentDoc = await Student.findOne({
      "studentLogin.userId": req.user._id,
    }).select("className");
  } else {
    studentDoc = await Student.findOne({
      "parentLogin.userId": req.user._id,
    }).select("className");
  }

  if (!studentDoc) {
    const err = new Error("Student profile not found for this user");
    err.statusCode = 404;
    throw err;
  }

  const classKey = normalizeClassKey(studentDoc.className);
  if (!classKey) {
    const err = new Error("Student class is missing or unrecognized");
    err.statusCode = 400;
    throw err;
  }

  return {
    className: studentDoc.className,
    classKey,
  };
};

const mapBodyToQuestion = (body, userIdFallback) => {
  const {
    class: className,
    quizClass,
    subject,
    quizTitle,
    questionText,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption,
    explanation = "",
    marks = 1,
    difficulty = "medium",
  } = body;

  const displayClass = className || quizClass;
  const classKey = normalizeClassKey(displayClass);

  const mapped = {
    class: displayClass,
    classKey,
    subject,
    quizTitle,
    questionText,
    options: {
      A: optionA,
      B: optionB,
      C: optionC,
      D: optionD,
    },
    correctOption,
    explanation,
    marks: Number(marks) || 1,
    difficulty,
  };

  if (userIdFallback) {
    mapped.createdBy = userIdFallback;
  }

  return mapped;
};

const validateRow = (row, indexZeroBased) => {
  const rowNumber = indexZeroBased + 2;
  const errors = [];

  const requiredFields = [
    "questionText",
    "optionA",
    "optionB",
    "optionC",
    "optionD",
  ];

  for (const field of requiredFields) {
    if (!row[field] || String(row[field]).trim() === "") {
      errors.push(`${field} is required`);
    }
  }

  const correct = (row.correctOption || "").toString().toUpperCase().trim();
  if (!correct || !["A", "B", "C", "D"].includes(correct)) {
    errors.push("correctOption must be one of A/B/C/D");
  }

  let marks = 1;
  if (row.marks !== undefined && row.marks !== null && row.marks !== "") {
    const num = Number(row.marks);
    if (Number.isNaN(num) || num < 1) {
      errors.push("marks must be a number >= 1");
    } else {
      marks = num;
    }
  }

  return {
    ok: errors.length === 0,
    rowNumber,
    errors,
    normalized: {
      questionText: String(row.questionText || "").trim(),
      optionA: String(row.optionA || "").trim(),
      optionB: String(row.optionB || "").trim(),
      optionC: String(row.optionC || "").trim(),
      optionD: String(row.optionD || "").trim(),
      correctOption: correct,
      explanation: row.explanation ? String(row.explanation).trim() : "",
      marks,
    },
  };
};

const parseUploadFile = (file) => {
  const ext = (file.originalname || "").split(".").pop()?.toLowerCase();
  const isJson = ext === "json";

  if (isJson) {
    const raw = file.buffer?.toString("utf-8");
    if (!raw) {
      throw new Error("JSON file is empty");
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON must be an array of question objects");
    }
    return parsed;
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  return rows;
};

export const createQuestion = async (req, res, next) => {
  try {
    const body = mapBodyToQuestion(req.body, req.user?._id);

    if (!body.class) {
      return fail(res, 400, "class is required");
    }
    if (!body.classKey) {
      return fail(res, 400, "class could not be normalized (use Grade 1, 1st, Class 1, etc.)");
    }
    if (!body.subject) {
      return fail(res, 400, "subject is required");
    }
    if (!body.quizTitle) {
      return fail(res, 400, "quizTitle is required");
    }

    const doc = await QuizQuestion.create(body);

    return res.status(201).json({
      success: true,
      message: "Question created successfully",
      data: {
        id: doc._id,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const bulkUpload = async (req, res, next) => {
  try {
    const { class: className, quizClass, subject, quizTitle } = req.body;
    const effectiveClass = className || quizClass;
    const classKey = normalizeClassKey(effectiveClass);

    if (!effectiveClass || !subject || !quizTitle) {
      return fail(res, 400, "class, subject and quizTitle are required");
    }
    if (!classKey) {
      return fail(res, 400, "class could not be normalized (use Grade 1, 1st, Class 1, etc.)");
    }

    if (!req.file) {
      return fail(res, 400, "file is required");
    }

    const file = req.file;
    if (!file.buffer) {
      const fs = await import("fs");
      file.buffer = fs.readFileSync(file.path);
    }

    let rawRows;
    try {
      rawRows = parseUploadFile(file);
    } catch (err) {
      return fail(res, 400, err.message || "Failed to parse upload file");
    }

    const validDocs = [];
    const errors = [];

    rawRows.forEach((row, index) => {
      const result = validateRow(row, index);
      if (!result.ok) {
        errors.push({
          row: result.rowNumber,
          message: result.errors.join(", "),
        });
        return;
      }

      const mapped = mapBodyToQuestion(
        {
          class: effectiveClass,
          subject,
          quizTitle,
          ...result.normalized,
        },
        req.user?._id,
      );

      validDocs.push(mapped);
    });

    let created = [];
    if (validDocs.length) {
      created = await QuizQuestion.insertMany(validDocs);
    }

    return ok(res, {
      message: "Bulk upload processed",
      data: {
        createdCount: created.length,
        errorCount: errors.length,
        errors,
        classKey,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listQuestions = async (req, res, next) => {
  try {
    const {
      class: className,
      classKey: classKeyQuery,
      subject,
      quizTitle,
      page = 1,
      limit = 20,
    } = req.query;

    const query = { isActive: true };

    const classKey =
      (classKeyQuery && String(classKeyQuery).trim()) ||
      (className ? normalizeClassKey(className) : null);

    if (classKey) query.classKey = classKey;
    if (subject) query.subject = subject;
    if (quizTitle) query.quizTitle = quizTitle;

    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.max(1, Math.min(100, Number(limit) || 25));

    const [items, total] = await Promise.all([
      QuizQuestion.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * lim)
        .limit(lim),
      QuizQuestion.countDocuments(query),
    ]);

    return ok(res, {
      data: {
        questions: items,
        total,
        page: pageNum,
        limit: lim,
        classKey: classKey || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = { ...req.body };

    if (body.optionA || body.optionB || body.optionC || body.optionD) {
      body.options = {
        ...(body.options || {}),
        ...(body.optionA ? { A: body.optionA } : {}),
        ...(body.optionB ? { B: body.optionB } : {}),
        ...(body.optionC ? { C: body.optionC } : {}),
        ...(body.optionD ? { D: body.optionD } : {}),
      };
      delete body.optionA;
      delete body.optionB;
      delete body.optionC;
      delete body.optionD;
    }

    if (body.class || body.quizClass) {
      const displayClass = body.class || body.quizClass;
      body.class = displayClass;
      body.classKey = normalizeClassKey(displayClass);
      delete body.quizClass;
      if (!body.classKey) {
        return fail(res, 400, "class could not be normalized");
      }
    }

    // Do not allow setting schoolId on updates for global bank
    delete body.schoolId;

    const updated = await QuizQuestion.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return fail(res, 404, "Question not found");
    }

    return ok(res, {
      message: "Question updated successfully",
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const doc = await QuizQuestion.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );

    if (!doc) {
      return fail(res, 404, "Question not found");
    }

    return ok(res, { message: "Question deleted successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * Soft-delete many questions. Requires SuperAdmin password confirmation.
 * Body: { ids: string[], password: string }
 */
export const bulkDeleteQuestions = async (req, res, next) => {
  try {
    const { ids, password } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return fail(res, 400, "ids array is required");
    }
    if (!password || !String(password).trim()) {
      return fail(res, 400, "password is required to confirm delete");
    }

    const User = (await import("../user/user.model.js")).default;
    const { comparePassword } = await import("../../utils/hash.js");

    const userWithPass = await User.findById(req.user._id).select("+password");
    if (!userWithPass?.password) {
      return fail(res, 401, "Unable to verify password");
    }

    const match = await comparePassword(String(password), userWithPass.password);
    if (!match) {
      return fail(res, 401, "Incorrect password");
    }

    const uniqueIds = [...new Set(ids.map((id) => String(id)).filter(Boolean))];
    const result = await QuizQuestion.updateMany(
      { _id: { $in: uniqueIds }, isActive: true },
      { $set: { isActive: false } },
    );

    return ok(res, {
      message: "Selected questions deleted successfully",
      data: {
        requested: uniqueIds.length,
        deletedCount: result.modifiedCount ?? result.nModified ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listMobileQuizzes = async (req, res, next) => {
  try {
    const studentDoc = await resolveStudentContextForMobileQuiz(req);

    const subjectFilter = req.query.subject;

    const match = {
      classKey: studentDoc.classKey,
      isActive: true,
    };
    if (subjectFilter) {
      match.subject = subjectFilter;
    }

    const quizzes = await QuizQuestion.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            quizTitle: "$quizTitle",
            subject: "$subject",
          },
          quizTitle: { $first: "$quizTitle" },
          subject: { $first: "$subject" },
          class: { $first: "$class" },
          classKey: { $first: "$classKey" },
          questionCount: { $sum: 1 },
          totalMarks: { $sum: "$marks" },
        },
      },
      { $sort: { quizTitle: 1 } },
    ]);

    return ok(res, { data: quizzes });
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/mobile/quiz/subjects */
export const listMobileQuizSubjects = async (req, res, next) => {
  try {
    const studentDoc = await resolveStudentContextForMobileQuiz(req);

    const subjects = await QuizQuestion.aggregate([
      {
        $match: {
          classKey: studentDoc.classKey,
          isActive: true,
        },
      },
      {
        $group: {
          _id: "$subject",
          subject: { $first: "$subject" },
          topicsCount: { $addToSet: "$quizTitle" },
          questionsCount: { $sum: 1 },
          totalMarks: { $sum: "$marks" },
        },
      },
      {
        $project: {
          _id: 0,
          subject: 1,
          topicsAvailable: { $size: "$topicsCount" },
          questionsCount: 1,
          totalMarks: 1,
        },
      },
      { $sort: { subject: 1 } },
    ]);

    return ok(res, { data: subjects });
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/mobile/quiz/topics?subject=Biology */
export const listMobileQuizTopicsBySubject = async (req, res, next) => {
  try {
    const studentDoc = await resolveStudentContextForMobileQuiz(req);
    const { subject } = req.query;
    if (!subject) {
      return fail(res, 400, "subject query param is required");
    }

    const topics = await QuizQuestion.aggregate([
      {
        $match: {
          classKey: studentDoc.classKey,
          subject: String(subject),
          isActive: true,
        },
      },
      {
        $group: {
          _id: "$quizTitle",
          quizTitle: { $first: "$quizTitle" },
          subject: { $first: "$subject" },
          class: { $first: "$class" },
          classKey: { $first: "$classKey" },
          questionCount: { $sum: 1 },
          totalMarks: { $sum: "$marks" },
          descriptions: { $addToSet: "$explanation" },
          difficultySet: { $addToSet: "$difficulty" },
        },
      },
      {
        $project: {
          _id: 0,
          quizTitle: 1,
          subject: 1,
          class: 1,
          classKey: 1,
          questionCount: 1,
          totalMarks: 1,
          description: {
            $let: {
              vars: {
                filtered: {
                  $filter: {
                    input: "$descriptions",
                    as: "d",
                    cond: { $gt: [{ $strLenCP: { $ifNull: ["$$d", ""] } }, 0] },
                  },
                },
              },
              in: {
                $ifNull: [{ $arrayElemAt: ["$$filtered", 0] }, null],
              },
            },
          },
          difficulty: {
            $ifNull: [{ $arrayElemAt: ["$difficultySet", 0] }, "medium"],
          },
        },
      },
      { $sort: { quizTitle: 1 } },
    ]);

    return ok(res, {
      data: {
        subject: String(subject),
        class: studentDoc.className,
        classKey: studentDoc.classKey,
        topics,
      },
    });
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    next(err);
  }
};

export const getMobileQuizQuestions = async (req, res, next) => {
  try {
    const { quizTitle, subject } = req.query;

    if (!quizTitle || !subject) {
      return fail(
        res,
        400,
        "quizTitle and subject query params are required",
      );
    }

    const studentDoc = await resolveStudentContextForMobileQuiz(req);

    const questions = await QuizQuestion.find({
      classKey: studentDoc.classKey,
      subject,
      quizTitle,
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean();

    const sanitized = questions.map((q) => ({
      id: q._id,
      questionText: q.questionText,
      options: q.options,
      marks: q.marks,
    }));

    return ok(res, {
      data: {
        quizTitle,
        subject,
        class: studentDoc.className,
        classKey: studentDoc.classKey,
        totalQuestions: sanitized.length,
        totalMarks: sanitized.reduce((sum, q) => sum + (q.marks || 1), 0),
        questions: sanitized,
      },
    });
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    next(err);
  }
};

export const submitMobileQuiz = async (req, res, next) => {
  try {
    const { quizTitle, subject, answers } = req.body;

    if (!quizTitle || !subject || !Array.isArray(answers)) {
      return fail(
        res,
        400,
        "quizTitle, subject and answers array are required",
      );
    }

    const studentDoc = await resolveStudentContextForMobileQuiz(req);

    const questions = await QuizQuestion.find({
      classKey: studentDoc.classKey,
      subject,
      quizTitle,
      isActive: true,
    }).lean();

    if (!questions.length) {
      return fail(res, 404, "No questions found for this quiz");
    }

    let totalMarks = 0;
    let obtainedMarks = 0;
    const detailed = [];

    for (const q of questions) {
      totalMarks += q.marks || 1;
      const ans = answers.find(
        (a) => String(a.questionId) === String(q._id),
      );
      const chosen = (ans?.selectedOption || "").toString().toUpperCase();
      const correct = q.correctOption;
      const isCorrect = chosen === correct;
      if (isCorrect) {
        obtainedMarks += q.marks || 1;
      }
      detailed.push({
        questionId: q._id,
        isCorrect,
        correctOption: correct,
        selectedOption: chosen || null,
        marks: q.marks || 1,
        earnedMarks: isCorrect ? q.marks || 1 : 0,
      });
    }

    return ok(res, {
      data: {
        quizTitle,
        subject,
        class: studentDoc.className,
        classKey: studentDoc.classKey,
        totalQuestions: questions.length,
        totalMarks,
        obtainedMarks,
        percentage:
          totalMarks > 0
            ? Math.round((obtainedMarks / totalMarks) * 100)
            : 0,
        details: detailed,
      },
    });
  } catch (err) {
    if (err.statusCode) return fail(res, err.statusCode, err.message);
    next(err);
  }
};
