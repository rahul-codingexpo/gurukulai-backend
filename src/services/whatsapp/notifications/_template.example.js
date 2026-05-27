/**
 * EXAMPLE — copy when adding a new WhatsApp notification.
 *
 * 1. Register in src/config/whatsappTemplates.config.js
 * 2. Add WHYSMS_TPL_<KEY>_NAME=approved_template_name to .env
 * 3. Implement this file and export from services/whatsapp/index.js
 */

// import { WhatsAppTemplateKey } from "../../../config/whatsappTemplates.config.js";
// import { isWhatsAppTemplateConfigured } from "../../../config/whatsappTemplates.config.js";
// import { queueWhatsAppJob, sendTemplateBatch } from "../whatsAppMessenger.service.js";
// import { normalizeWhatsAppPhone } from "../../../utils/phone.util.js";

// const TEMPLATE_KEY = WhatsAppTemplateKey.HOMEWORK_ASSIGNED;

// export const buildHomeworkAssignedVariables = ({ greetingName, homework, student }) => [
//   greetingName,
//   student.name,
//   homework.title,
//   // ... exactly N strings for N template variables
// ];

// export const notifyHomeworkAssignedWhatsApp = async (homeworkId) => {
//   if (!isWhatsAppTemplateConfigured(TEMPLATE_KEY)) {
//     return { skipped: true, reason: "homework_assigned not configured" };
//   }
//   // load data, build recipients, sendTemplateBatch({ templateKey, recipients, header: { type: "none" } })
// };

// export const queueHomeworkAssignedWhatsApp = (homeworkId) => {
//   queueWhatsAppJob(`homework_assigned:${homeworkId}`, () =>
//     notifyHomeworkAssignedWhatsApp(homeworkId),
//   );
// };
