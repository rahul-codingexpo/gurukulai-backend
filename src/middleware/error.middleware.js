// export const errorHandler = (err, req, res, next) => {
//   res.status(400).json({
//     success: false,
//     message: err.message,
//   });
// };

export const errorHandler = (err, req, res, next) => {
  console.error("❌ ERROR:", err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",

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
