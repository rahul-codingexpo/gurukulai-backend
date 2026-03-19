import { loginService } from "./auth.service.js";
import { forgotPasswordService, resetPasswordService } from "./auth.service.js";

export const login = async (req, res, next) => {
  try {
    const body = req.body;
    // App often sends wrong Content-Type or no body → req.body is {} and causes 500
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        success: false,
        message:
          "Request body must be JSON. Send { \"email\" or \"phone\" or \"username\", \"password\" } with header Content-Type: application/json",
      });
    }

    const data = await loginService(body);

    res.json({
      success: true,
      message: "Login successful",
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const data = await forgotPasswordService(req.body);
    res.json({
      success: true,
      message: data.message,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const data = await resetPasswordService(req.body);
    res.json({
      success: true,
      message: data.message,
      data,
    });
  } catch (err) {
    next(err);
  }
};
