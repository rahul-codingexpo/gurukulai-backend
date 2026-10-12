import dotenv from "dotenv";
dotenv.config();

// Initialize environment config manually as standard server start does
import "../src/config/env.js";
import { sendOtpEmail } from "../src/services/email.service.js";

async function main() {
  // Using onboarding@resend.dev as target requires a custom domains or it will succeed/fail depending on the sandbox state.
  // Resend onboarding API key allows sending to the email registered to the API key owner.
  // The user can define TEST_RECEIVER_EMAIL in .env, or we fall back to a placeholder.
  const testEmail = process.env.TEST_RECEIVER_EMAIL || "onboarding@resend.dev";
  const mockOtp = "840792";

  console.log("-----------------------------------------");
  console.log(`Attempting to send OTP email to: ${testEmail}`);
  console.log(`Using sender: ${process.env.RESEND_FROM_EMAIL}`);
  console.log("-----------------------------------------");

  try {
    const response = await sendOtpEmail(testEmail, mockOtp);
    console.log("SUCCESS!");
    console.log("Response from Resend API:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("FAILURE!");
    console.error("Error Details:", error.message);
  }
}

main();
