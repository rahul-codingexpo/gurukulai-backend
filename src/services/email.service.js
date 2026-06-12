import { ENV } from "../config/env.js";

/**
 * HTML Template for the OTP email.
 * Designed with a clean, premium, mobile-responsive corporate identity.
 * @param {string} otp - The 6-digit verification code.
 * @returns {string} The fully constructed HTML template.
 */
const getOtpTemplate = (otp) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); max-width: 500px; width: 100%; overflow: hidden;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 32px 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Gurukul AI</h1>
              <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">Security Verification</p>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 20px; font-weight: 600; line-height: 1.4;">Reset Your Password</h2>
              <p style="color: #475569; margin: 0 0 28px 0; font-size: 15px; line-height: 1.6;">
                We received a request to reset your password for your Gurukul AI account. Use the verification code below to complete the reset process. This code is valid for <strong>10 minutes</strong>.
              </p>
              
              <!-- OTP Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px dashed #cbd5e1;">
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 700; letter-spacing: 8px; color: #1e40af; text-indent: 8px;">
                      ${otp}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="color: #64748b; margin: 0 0 24px 0; font-size: 13px; line-height: 1.5; text-align: center;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
              
              <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; text-align: center;">
                <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                  Securing your education environment.
                </p>
              </div>
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; width: 100%; margin-top: 20px; text-align: center;">
          <tr>
            <td style="color: #94a3b8; font-size: 12px; line-height: 1.5; padding: 0 10px;">
              &copy; 2026 Gurukul AI. All rights reserved.<br>
              This is an automated system email. Please do not reply directly to this message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Sends an OTP email to the specified address.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} otp - The 6-digit OTP code to send.
 * @returns {Promise<object>} The Resend API response JSON.
 */
export const sendOtpEmail = async (toEmail, otp) => {
  if (!ENV.RESEND_MAIL_API_KEY) {
    throw new Error("RESEND_MAIL_API_KEY is not defined in configuration");
  }

  const url = "https://api.resend.com/emails";
  const emailBody = {
    from: ENV.RESEND_FROM_EMAIL,
    to: toEmail,
    subject: `${otp} is your Gurukul AI password reset verification code`,
    html: getOtpTemplate(otp),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.RESEND_MAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  let responseData;
  try {
    responseData = await response.json();
  } catch (err) {
    responseData = { message: await response.text() };
  }

  if (!response.ok) {
    console.error("Resend API sendOtpEmail Error:", responseData);
    throw new Error(
      `Failed to send verification email: ${responseData.message || response.statusText}`
    );
  }

  return responseData;
};

/**
 * HTML Template for the School Onboarding Welcome email.
 * @param {object} school - The school document details.
 * @returns {string} The fully constructed HTML template.
 */
const getWelcomeTemplate = (school) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Medhyx Technology</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); max-width: 600px; width: 100%; overflow: hidden;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 40px 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">MEDHYX TECHNOLOGY</h1>
              <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 15px; font-weight: 500;">Welcome Onboard!</p>
            </td>
          </tr>
          <!-- Content Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <h2 style="color: #0f172a; margin: 0 0 16px 0; font-size: 22px; font-weight: 700; line-height: 1.4;">School Registration Successful</h2>
              <p style="color: #475569; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                Dear Administrator,
              </p>
              <p style="color: #475569; margin: 0 0 24px 0; font-size: 15px; line-height: 1.6;">
                We are thrilled to welcome <strong>${school.name}</strong> to the Medhyx Technology platform! Your school profile has been successfully set up and is now ready for use.
              </p>

              <!-- School Details Box -->
              <h3 style="color: #1e3a8a; font-size: 16px; margin: 0 0 12px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Your Onboarding Profile</h3>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 32px; padding: 20px;">
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500; width: 35%;">School Name</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${school.name}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">School Code</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #2563eb; font-weight: 700; font-family: monospace; font-size: 15px;">${school.schoolCode}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">Email Address</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${school.email || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">Phone Number</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${school.phone || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">Established Year</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${school.yearEstablished || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">Address</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${school.address || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #64748b; font-weight: 500;">Status</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #10b981; font-weight: 700; text-transform: uppercase;">Active</td>
                </tr>
              </table>

              <!-- Call to Action -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td align="center">
                    <a href="https://schoolerp.medhyxtech.com/login" target="_blank" style="background-color: #2563eb; color: #ffffff; display: inline-block; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; box-shadow: 0 4px 14px rgba(37,99,235,0.35);">
                      Launch School Portal
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #475569; margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;">
                <strong>Next Steps:</strong>
              </p>
              <ul style="color: #475569; margin: 0 0 28px 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
                <li style="margin-bottom: 6px;">Log in to the administrator portal using your school code <strong>${school.schoolCode}</strong>.</li>
                <li style="margin-bottom: 6px;">Set up classes, sections, and subjects under the academic settings.</li>
                <li style="margin-bottom: 6px;">Add teacher profiles and allocate class timetables.</li>
              </ul>
              
              <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; text-align: center;">
                <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                  Empowering educational growth with smart technology.
                </p>
              </div>
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; margin-top: 20px; text-align: center;">
          <tr>
            <td style="color: #94a3b8; font-size: 12px; line-height: 1.5; padding: 0 10px;">
              &copy; 2026 MEDHYX TECHNOLOGY. All rights reserved.<br>
              This is an automated system email. Please do not reply directly to this message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * Sends a welcome onboarding email to a newly created school.
 * @param {object} school - The school details.
 * @returns {Promise<object>} The Resend API response JSON.
 */
export const sendSchoolWelcomeEmail = async (school) => {
  if (!school?.email) {
    throw new Error("School email address is required to send welcome email");
  }
  if (!ENV.RESEND_MAIL_API_KEY) {
    throw new Error("RESEND_MAIL_API_KEY is not defined in configuration");
  }

  const url = "https://api.resend.com/emails";
  const emailBody = {
    from: ENV.RESEND_FROM_EMAIL,
    to: school.email,
    subject: `Welcome to MEDHYX TECHNOLOGY - ${school.name}!`,
    html: getWelcomeTemplate(school),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.RESEND_MAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  let responseData;
  try {
    responseData = await response.json();
  } catch (err) {
    responseData = { message: await response.text() };
  }

  if (!response.ok) {
    console.error("Resend API sendSchoolWelcomeEmail Error:", responseData);
    throw new Error(
      `Failed to send welcome email: ${responseData.message || response.statusText}`
    );
  }

  return responseData;
};
