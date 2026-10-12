import dotenv from "dotenv";
dotenv.config();

import "../src/config/env.js";
import { sendSchoolWelcomeEmail } from "../src/services/email.service.js";

async function main() {
  const testEmail = process.env.TEST_RECEIVER_EMAIL || "medhyxtechnology@gmail.com";
  const mockSchool = {
    schoolCode: "MTECH",
    name: "Medhyx Tech Academy",
    email: testEmail,
    phone: "+91 98765 43210",
    yearEstablished: 2026,
    address: "123 Technology Lane, Sector 5",
  };

  console.log("-----------------------------------------");
  console.log(`Attempting to send School Welcome email to: ${testEmail}`);
  console.log(`Using sender: ${process.env.RESEND_FROM_EMAIL}`);
  console.log("-----------------------------------------");

  try {
    const response = await sendSchoolWelcomeEmail(mockSchool);
    console.log("SUCCESS!");
    console.log("Response from Resend API:", JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("FAILURE!");
    console.error("Error Details:", error.message);
  }
}

main();
