import { loginService } from "./auth.service.js";

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
