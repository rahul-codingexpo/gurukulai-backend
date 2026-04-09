import XLSX from "xlsx";
import QuizQuestion from "./quizQuestion.model.js";

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
    }).select("schoolId className");
  } else {
    studentDoc = await Student.findOne({
      "parentLogin.userId": req.user._id,
    }).select("schoolId className");
  }

  if (!studentDoc) {
    const err = new Error("Student profile not found for this user");
    err.statusCode = 404;
    throw err;
  }

  return studentDoc;
};

const mapBodyToQuestion = (body, userIdFallback) => {
  const {
    schoolId,
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

  const mapped = {
    schoolId,
    class: className || quizClass,
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

  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows;
};

export const createQuestion = async (req, res, next) => {
  try {
    const body = mapBodyToQuestion(req.body, req.user?._id);

    if (!body.schoolId) {
      return fail(res, 400, "schoolId is required");
    }
    if (!body.class) {
      return fail(res, 400, "class is required");
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
    const { class: className, quizClass, subject, quizTitle, schoolId } =
      req.body;
    const effectiveClass = className || quizClass;

    if (!effectiveClass || !subject || !quizTitle) {
      return fail(res, 400, "class, subject and quizTitle are required");
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
          schoolId,
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
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listQuestions = async (req, res, next) => {
  try {
    const {
      schoolId,
      class: className,
      subject,
      quizTitle,
      page = 1,
      limit = 20,
    } = req.query;

    if (!schoolId) {
      return fail(res, 400, "schoolId is required");
    }

    const query = { schoolId, isActive: true };
    if (className) query.class = className;
    if (subject) query.subject = subject;
    if (quizTitle) query.quizTitle = quizTitle;

    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.max(1, Math.min(100, Number(limit) || 20));

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

    if (
      body.optionA ||
      body.optionB ||
      body.optionC ||
      body.optionD
    ) {
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

export const listMobileQuizzes = async (req, res, next) => {
  try {
    const studentDoc = await resolveStudentContextForMobileQuiz(req);

    const subjectFilter = req.query.subject;

    const match = {
      schoolId: studentDoc.schoolId,
      class: studentDoc.className,
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
          schoolId: studentDoc.schoolId,
          class: studentDoc.className,
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
          schoolId: studentDoc.schoolId,
          class: studentDoc.className,
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
          questionCount: { $sum: 1 },
          totalMarks: { $sum: "$marks" },
          // Optional description: first non-empty explanation from this topic, if any
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
    await resolveStudentContextForMobileQuiz(req);

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
      schoolId: studentDoc.schoolId,
      class: studentDoc.className,
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
      schoolId: studentDoc.schoolId,
      class: studentDoc.className,
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

