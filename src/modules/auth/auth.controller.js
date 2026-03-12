import { loginService } from "./auth.service.js";
import { forgotPasswordService, resetPasswordService } from "./auth.service.js";

export const login = async (req, res, next) => {
  try {
    const data = await loginService(req.body);

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
