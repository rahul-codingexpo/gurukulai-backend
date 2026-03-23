import multer from "multer";
import path from "path";

// storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },

  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "_");

    cb(null, uniqueName);
  },
});

// file filter (only images)
const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
});

// Study materials: allow PDFs and images
const studyMaterialFileFilter = (req, file, cb) => {
  const allowed = [
    "image/png",
    "image/jpg",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, Word and image files allowed"), false);
  }
};

export const uploadStudyMaterials = multer({
  storage,
  fileFilter: studyMaterialFileFilter,
});

// Bulk student import: allow Excel files
const excelFileFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
  ];
  const ext = path.extname(file.originalname || "").toLowerCase();

  const allowedExt = [".xlsx", ".xls"].includes(ext);
  const allowedMime = allowedMimes.includes(file.mimetype);

  if (allowedExt || allowedMime) cb(null, true);
  else cb(new Error("Only .xlsx or .xls Excel files are allowed"), false);
};

export const uploadExcel = multer({
  storage,
  fileFilter: excelFileFilter,
});

export default upload;
