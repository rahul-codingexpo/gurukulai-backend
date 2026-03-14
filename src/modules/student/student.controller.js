// import Student from "./student.model.js";
// import User from "../user/user.model.js";
// import Role from "../auth/role.model.js";
// import bcrypt from "bcryptjs";

// export const createAdmission = async (req, res, next) => {
//   try {
//     const schoolId = req.user.schoolId;

//     const studentPhoto = req.files?.studentPhoto?.[0]?.path || null;

//     const fatherIdProof = req.files?.fatherIdProof?.[0]?.path || null;

//     const motherIdProof = req.files?.motherIdProof?.[0]?.path || null;

//     const parentSignature = req.files?.parentSignature?.[0]?.path || null;

//     const {
//       name,
//       gender,
//       dob,
//       admissionNumber,
//       rollNumber,
//       className,
//       section,
//       admissionDate,
//       //   photo,
//       parents,
//       previousSchool,
//       //   documents,
//       feeStructure,
//       studentLogin,
//       parentLogin,
//     } = req.body;

//     /* Create Student */

//     const student = await Student.create({
//       schoolId,
//       name,
//       gender,
//       dob,
//       admissionNumber,
//       rollNumber,
//       className,
//       section,
//       admissionDate,
//       photo: studentPhoto,
//       parents,
//       previousSchool,
//       documents: {
//         fatherIdProof: fatherIdProof,
//         motherIdProof: motherIdProof,
//         parentSignature: parentSignature,
//         studentPhoto: studentPhoto,
//       },
//       feeStructure,
//     });

//     /* STUDENT LOGIN */

//     if (studentLogin?.type === "NEW_USER") {
//       const role = await Role.findOne({ name: "Student" });

//       const password = await bcrypt.hash(studentLogin.password, 10);

//       const user = await User.create({
//         name,
//         username: admissionNumber,
//         password,
//         roleId: role._id,
//         schoolId,
//       });

//       student.studentLogin = {
//         enabled: true,
//         userId: user._id,
//       };
//     }

//     /* PARENT LOGIN */

//     if (parentLogin?.type === "NEW_USER") {
//       const role = await Role.findOne({ name: "Parent" });

//       const password = await bcrypt.hash(parentLogin.password, 10);

//       const user = await User.create({
//         name: parents.father.name,
//         username: parents.father.phone,
//         password,
//         roleId: role._id,
//         schoolId,
//       });

//       student.parentLogin = {
//         enabled: true,
//         userId: user._id,
//       };
//     }

//     await student.save();

//     res.status(201).json({
//       success: true,
//       data: student,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

//====improved version with better structure and error handling===
import Student from "./student.model.js";
import User from "../user/user.model.js";
import Role from "../auth/role.model.js";
import bcrypt from "bcryptjs";

const buildPlaceholderEmail = (namespace, uniqueValue) => {
  const safe = String(uniqueValue || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "");
  return `${namespace}.${safe || Date.now()}@local.invalid`;
};

/* Helper function for safe JSON parsing */
const parseJSON = (data, defaultValue) => {
  if (!data) return defaultValue;
  if (typeof data === "string") return JSON.parse(data);
  return data;
};

const resolveSchoolId = (req) => {
  const roleName = req.user?.roleId?.name;
  if (roleName === "SuperAdmin") {
    return req.query.schoolId || req.body.schoolId || req.params.schoolId || null;
  }
  return req.user.schoolId;
};

/* CREATE ADMISSION */

export const createAdmission = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    /* FILES */

    const studentPhoto = req.files?.studentPhoto?.[0]?.path || null;
    const fatherIdProof = req.files?.fatherIdProof?.[0]?.path || null;
    const motherIdProof = req.files?.motherIdProof?.[0]?.path || null;
    const parentSignature = req.files?.parentSignature?.[0]?.path || null;

    /* PARSE BODY SAFELY */

    const parents = parseJSON(req.body.parents, {});
    const previousSchool = parseJSON(req.body.previousSchool, {});
    const feeStructure = parseJSON(req.body.feeStructure, []);
    const studentLogin = parseJSON(req.body.studentLogin, {});
    const parentLogin = parseJSON(req.body.parentLogin, {});

    const {
      name,
      gender,
      dob,
      phone, // optional: student phone (if you want phone login for student)
      admissionNumber,
      rollNumber,
      className,
      section,
      admissionDate,
    } = req.body;

    /* CHECK DUPLICATE ADMISSION */

    const existing = await Student.findOne({
      admissionNumber,
      schoolId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Admission number already exists",
      });
    }

    /* CREATE STUDENT */

    const student = await Student.create({
      schoolId,
      name,
      gender,
      dob,
      admissionNumber,
      rollNumber,
      className,
      section,
      admissionDate,
      parents,
      previousSchool,
      documents: {
        fatherIdProof,
        motherIdProof,
        parentSignature,
        studentPhoto,
      },
      feeStructure,
    });

    /* STUDENT LOGIN */

    // if (studentLogin?.type === "NEW_USER") {
    //   const role = await Role.findOne({ name: "Student" });

    //   const password = await bcrypt.hash(studentLogin.password, 10);

    //   const user = await User.create({
    //     name,
    //     username: admissionNumber,
    //     password,
    //     roleId: role._id,
    //     schoolId,
    //   });

    //   student.studentLogin = {
    //     enabled: true,
    //     userId: user._id,
    //   };
    // }

    if (studentLogin?.type === "NEW_USER") {
      const role = await Role.findOne({ name: "Student" });

      if (!role) {
        return res.status(500).json({
          success: false,
          message: "Student role not found",
        });
      }

      const password = await bcrypt.hash(studentLogin.password, 10);

      // If you want students to login using phone, send `phone` in body.
      // Fallback to admissionNumber login if phone is not provided.
      const studentPhone = phone || undefined;
      const studentUsername = studentPhone || admissionNumber;
      const studentEmail =
        req.body.email ||
        buildPlaceholderEmail("student", studentPhone || admissionNumber);

      const user = await User.create({
        name,
        username: studentUsername,
        phone: studentPhone,
        email: studentEmail,
        password,
        roleId: role._id,
        schoolId,
      });

      student.studentLogin = {
        enabled: true,
        userId: user._id,
      };
    }

    /* PARENT LOGIN */

    // if (parentLogin?.type === "NEW_USER" && parents?.father?.phone) {
    //   const role = await Role.findOne({ name: "Parent" });

    //   let user = await User.findOne({
    //     username: parents.father.phone,
    //     schoolId,
    //   });

    //   if (!user) {
    //     const password = await bcrypt.hash(parentLogin.password, 10);

    //     user = await User.create({
    //       name: parents.father.name,
    //       username: parents.father.phone,
    //       password,
    //       roleId: role._id,
    //       schoolId,
    //     });
    //   }

    //   student.parentLogin = {
    //     enabled: true,
    //     userId: user._id,
    //   };
    // }

    if (parentLogin?.type === "NEW_USER" && parents?.father?.phone) {
      const role = await Role.findOne({ name: "Parent" });

      if (!role) {
        return res.status(500).json({
          success: false,
          message: "Parent role not found",
        });
      }

      let user = await User.findOne({
        $or: [{ phone: parents.father.phone }, { username: parents.father.phone }],
        schoolId,
      });

      if (!user) {
        const password = await bcrypt.hash(parentLogin.password, 10);
        const parentEmail =
          parents?.father?.email ||
          buildPlaceholderEmail("parent", parents.father.phone);

        user = await User.create({
          name: parents.father.name,
          username: parents.father.phone,
          phone: parents.father.phone,
          email: parentEmail,
          password,
          roleId: role._id,
          schoolId,
        });
      }

      student.parentLogin = {
        enabled: true,
        userId: user._id,
      };
    }

    await student.save();

    res.status(201).json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* GET ALL STUDENTS */

export const getStudents = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);

    const students = await Student.find({ schoolId });

    res.json({
      success: true,
      data: students,
    });
  } catch (error) {
    next(error);
  }
};

/* GET SINGLE STUDENT */

export const getStudentById = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* UPDATE STUDENT */

export const updateStudent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const parents = parseJSON(req.body.parents);
    const previousSchool = parseJSON(req.body.previousSchool);
    const feeStructure = parseJSON(req.body.feeStructure);

    const { name, gender, dob, rollNumber, className, section } = req.body;

    if (name) student.name = name;
    if (gender) student.gender = gender;
    if (dob) student.dob = dob;
    if (rollNumber) student.rollNumber = rollNumber;
    if (className) student.className = className;
    if (section) student.section = section;
    if (parents) student.parents = parents;
    if (previousSchool) student.previousSchool = previousSchool;
    if (feeStructure) student.feeStructure = feeStructure;

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* UPDATE STATUS */

export const updateStudentStatus = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const { status } = req.body;
    const suspension = parseJSON(req.body.suspension);

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (status) student.status = status;
    if (suspension) student.suspension = suspension;

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* SUSPEND STUDENT */

export const updateStudentSuspension = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const suspension = parseJSON(req.body.suspension);

    const student = await Student.findOne({ _id: studentId, schoolId });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    student.suspension = suspension;

    await student.save();

    res.json({
      success: true,
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

/* DELETE STUDENT */

export const deleteStudent = async (req, res, next) => {
  try {
    const schoolId = resolveSchoolId(req);
    const studentId = req.params.id;

    const student = await Student.findOneAndDelete({
      _id: studentId,
      schoolId,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
