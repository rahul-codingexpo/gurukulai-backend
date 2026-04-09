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

    // Student / Parent -> Student-linked profile
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
      const motherName = student?.parents?.mother?.name || "";
      const motherPhone = student?.parents?.mother?.phone || "";
      const emergencyNumber = fatherPhone || motherPhone || "";

      const isParent = role === "Parent";
      const parentName = req.user?.name || null;
      const parentPhone = req.user?.phone || null;
      const parentEmail = req.user?.email || null;
      const parentProfileDetails = {
        name: parentName,
        phone: parentPhone,
        email: parentEmail,
        relation: "Parent",
        childName: student?.name || null,
        childAdmissionNumber: student?.admissionNumber || null,
        childClassName: student?.className || null,
        childSection: student?.section || null,
        childRollNumber: student?.rollNumber || null,
      };

      return res.json({
        success: true,
        data: {
          viewer: {
            _id: req.user._id,
            name: req.user.name,
            role,
            profilePhoto: profilePhoto,
          },
          entityType: isParent ? "parent" : "student",
          header: {
            displayName: isParent ? req.user.name : student.name || req.user.name,
            subTitle:
              (isParent
                ? req.user.phone || req.user.username || req.user.email
                : student.admissionNumber || req.user.username || req.user.phone || "") || "",
            profilePhoto,
          },
          academicDetails: {
            school: school?.name || null,
            schoolCode: school?.schoolCode || null,
            className: student.className || null,
            section: student.section || null,
            rollNumber: student.rollNumber || null,
            admissionNumber: student.admissionNumber || null,
            admissionDate: toISODateOnly(student.admissionDate),
            dateOfBirth: toISODateOnly(student.dob),
          },
          generalInformation: {
            phone: (isParent ? req.user.phone : student.phone || req.user.phone) || null,
            gender: student.gender || null,
            bloodGroup: null, // not stored in schema yet
            currentAddress: student.address || null,
            permanentAddress: null,
          },
          emergencyContact: {
            contactName: fatherName || motherName || null,
            contactRelation: fatherPhone ? "Father" : motherPhone ? "Mother" : null,
            contactPhone: emergencyNumber || null,
            fatherPhone: fatherPhone || null,
            motherPhone: motherPhone || null,
          },
          ...(isParent ? { parentDetails: parentProfileDetails } : {}),
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

      const profilePhoto = staff?.photoUrl || null;

      return res.json({
        success: true,
        data: {
          viewer: {
            _id: req.user._id,
            name: req.user.name,
            role,
            profilePhoto,
          },
          entityType: "staff",
          header: {
            displayName: staff.name || req.user.name,
            subTitle: req.user.email || req.user.phone || "",
            profilePhoto,
          },
          academicDetails: {
            school: school?.name || "",
            schoolCode: school?.schoolCode || "",
            designation: staff.designation || role,
            joiningDate: toISODateOnly(staff.joiningDate),
            staffId: String(staff._id),
          },
          generalInformation: {
            name: staff.name || req.user.name || "",
            phone: staff.phone || req.user.phone || "",
            email: staff.email || req.user.email || "",
            gender: "",
            dateOfBirth: null,
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

