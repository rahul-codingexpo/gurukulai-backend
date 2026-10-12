// export const errorHandler = (err, req, res, next) => {
//   res.status(400).json({
//     success: false,
//     message: err.message,
//   });
// };

export const errorHandler = (err, req, res, next) => {
  console.error("❌ ERROR:", err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message =
      "Uploaded file exceeds the allowed size limit. On the live server, set Nginx client_max_body_size 0; (unlimited) and reload Nginx.";
  } else if (err.statusCode === 413 || err.status === 413) {
    statusCode = 413;
    message =
      err.message ||
      "Upload rejected: file too large for the reverse proxy (HTTP 413). Set Nginx client_max_body_size 0; and reload Nginx.";
  } else if (err.code === "LIMIT_FILE_COUNT") {
    statusCode = 400;
    message = "Too many files in one upload (maximum 10)";
  } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
    statusCode = 400;
    message = "Unexpected file field in upload";
  }

  res.status(statusCode).json({
    success: false,
    message,

    // show stack only in development
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

export const notFound = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);

  error.statusCode = 404;

  next(error);
};
