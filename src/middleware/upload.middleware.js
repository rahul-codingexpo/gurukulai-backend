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

const TEN_MB = 10 * 1024 * 1024;

export const uploadStudyMaterials = multer({
  storage,
  fileFilter: studyMaterialFileFilter,
  limits: { fileSize: TEN_MB },
});

// Bulk student import: allow Excel + CSV files
const excelFileFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/csv", // .csv
  ];
  const ext = path.extname(file.originalname || "").toLowerCase();

  const allowedExt = [".xlsx", ".xls", ".csv"].includes(ext);
  const allowedMime = allowedMimes.includes(file.mimetype);

  if (allowedExt || allowedMime) cb(null, true);
  else cb(new Error("Only .xlsx, .xls or .csv files are allowed"), false);
};

export const uploadExcel = multer({
  storage,
  fileFilter: excelFileFilter,
});

// Quiz bulk upload: allow CSV, JSON, and Excel files
const quizFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = file.mimetype;

  const isExcel =
    ext === ".xlsx" ||
    ext === ".xls" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel";

  const isCsv =
    ext === ".csv" ||
    mime === "text/csv" ||
    mime === "application/vnd.ms-excel";

  const isJson =
    ext === ".json" || mime === "application/json" || mime === "text/json";

  if (isExcel || isCsv || isJson) {
    cb(null, true);
  } else {
    cb(
      new Error("Only .csv, .json, .xlsx or .xls files are allowed"),
      false,
    );
  }
};

export const uploadQuizFile = multer({
  storage,
  fileFilter: quizFileFilter,
});

// Staff documents for Add Staff form (multipart/form-data)
const staffDocumentsFileFilter = (req, file, cb) => {
  const allowed = [
    // photo
    "image/png",
    "image/jpg",
    "image/jpeg",
    "image/webp",
    // documents
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  ];

  if (allowed.includes(file.mimetype)) return cb(null, true);

  // allow images for documents too (if frontend sends images for these fields)
  if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);

  return cb(new Error("Invalid file type for staff documents"), false);
};

export const uploadStaffDocuments = multer({
  storage,
  fileFilter: staffDocumentsFileFilter,
  limits: { fileSize: TEN_MB },
});

export default upload;

