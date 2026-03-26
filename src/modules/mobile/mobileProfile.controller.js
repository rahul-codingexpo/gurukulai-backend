import Student from "../student/student.model.js";
import Staff from "../staff/staff.model.js";
import School from "../school/school.model.js";

const roleNameOf = (req) => req.user?.roleId?.name;

const resolveStudentSelf = async (req) => {
  const role = roleNameOf(req);
  if (role === "Student") {
    return Student.findOne({ "studentLogin.userId": req.user._id }).lean();
  }
  if (role === "Parent") {
    return Student.findOne({ "parentLogin.userId": req.user._id }).lean();
  }
  return null;
};

const resolveStaffSelf = async (req) => {
  const role = roleNameOf(req);
  if (!["Teacher", "Staff"].includes(role)) return null;
  return Staff.findOne({ userId: req.user._id }).lean();
};

const toISODateOnly = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
};

/** GET /api/mobile/profile */
export const getMobileProfile = async (req, res, next) => {
  try {
    const role = roleNameOf(req);

    // Student / Parent -> Student profile
    if (role === "Student" || role === "Parent") {
      const student = await resolveStudentSelf(req);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student profile not found",
        });
      }

      const school = await School.findById(student.schoolId)
        .select("name schoolCode")
        .lean();

      const profilePhoto = student?.documents?.studentPhoto || null;

      const fatherName = student?.parents?.father?.name || "";
      const fatherPhone = student?.parents?.father?.phone || "";

      return res.json({
        success: true,
        data: {
          viewer: {
            _id: req.user._id,
            name: req.user.name,
            role,
            profilePhoto: profilePhoto,
          },
          entityType: "student",
          header: {
            displayName: student.name || req.user.name,
            subTitle:
              student.admissionNumber || req.user.username || req.user.phone || "",
            profilePhoto,
          },
          academicDetails: {
            school: school?.name || "",
            schoolCode: school?.schoolCode || "",
            className: student.className || "",
            section: student.section || "",
            rollNumber: student.rollNumber || "",
            admissionNumber: student.admissionNumber || "",
            admissionDate: toISODateOnly(student.admissionDate),
            dateOfBirth: toISODateOnly(student.dob),
          },
          generalInformation: {
            phone: student.phone || req.user.phone || "",
            gender: student.gender || "",
            bloodGroup: "", // not stored in schema yet
            currentAddress: "", // not stored in schema yet
            permanentAddress: "", // not stored in schema yet
          },
          emergencyContact: {
            contactName: fatherName,
            contactRelation: fatherName ? "Father" : "",
            contactPhone: fatherPhone,
          },
        },
      });
    }

    // Teacher / Staff -> Staff profile
    if (role === "Teacher" || role === "Staff") {
      const staff = await resolveStaffSelf(req);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "Staff profile not found",
        });
      }

      const school = await School.findById(staff.schoolId)
        .select("name schoolCode")
        .lean();

      return res.json({
        success: true,
        data: {
          viewer: {
            _id: req.user._id,
            name: req.user.name,
            role,
            profilePhoto: null,
          },
          entityType: "staff",
          header: {
            displayName: staff.name || req.user.name,
            subTitle: req.user.email || req.user.phone || "",
            profilePhoto: null,
          },
          academicDetails: {
            school: school?.name || "",
            schoolCode: school?.schoolCode || "",
            designation: staff.designation || role,
            joiningDate: toISODateOnly(staff.joiningDate),
            staffId: String(staff._id),
          },
          generalInformation: {
            phone: staff.phone || req.user.phone || "",
            email: staff.email || req.user.email || "",
            status: staff.status || "",
            currentAddress: "", // not stored in schema yet
            permanentAddress: "", // not stored in schema yet
          },
          emergencyContact: {
            contactName: "",
            contactRelation: "",
            contactPhone: "",
          },
        },
      });
    }

    return res.status(403).json({
      success: false,
      message: "Only Student, Parent, Teacher, and Staff can access this endpoint",
    });
  } catch (error) {
    next(error);
  }
};

