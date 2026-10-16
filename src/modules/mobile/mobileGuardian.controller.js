import Student from "../student/student.model.js";

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

const parentBlock = (parent, relation, studentAddress) => {
  const p = parent || {};
  return {
    name: p.name || "",
    relation,
    phone: p.phone || "",
    occupation: p.occupation || "",
    qualification: p.qualification || "",
    email: "",
    address: studentAddress || "",
    photo: p.photo || "",
    dob: p.dob || null,
  };
};

/** GET /api/mobile/guardian */
export const getMobileGuardian = async (req, res, next) => {
  try {
    const role = roleNameOf(req);
    if (role !== "Student" && role !== "Parent") {
      return res.status(403).json({
        success: false,
        message: "Only Student and Parent can access guardian details",
      });
    }

    const student = await resolveStudentSelf(req);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const address = student.address || "";
    const father = parentBlock(student.parents?.father, "Father", address);
    const mother = parentBlock(student.parents?.mother, "Mother", address);

    const primary =
      father.name || father.phone
        ? father
        : mother.name || mother.phone
          ? mother
          : {
              name: "",
              relation: "",
              phone: "",
              occupation: "",
              qualification: "",
              email: "",
              address,
              photo: "",
              dob: null,
            };

    res.json({
      success: true,
      data: {
        primary,
        father,
        mother,
        emergencyContact: {
          contactName: primary.name || null,
          contactRelation: primary.relation || null,
          contactPhone: primary.phone || null,
          fatherPhone: father.phone || null,
          motherPhone: mother.phone || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
