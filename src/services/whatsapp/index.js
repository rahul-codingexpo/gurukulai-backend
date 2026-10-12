/**
 * WhatsApp messaging — extensible template registry.
 *
 * @example
 * import { WhatsAppTemplateKey, sendTemplateToPhone, queueFeeInvoiceWhatsApp } from "./services/whatsapp/index.js";
 */

export {
  WhatsAppTemplateKey,
  whatsAppTemplateRegistry,
  listWhatsAppTemplates,
  getWhatsAppTemplateConfig,
  resolveWhatsAppTemplateName,
  resolveWhatsAppTemplateLanguage,
  isWhatsAppTransportConfigured,
  isWhatsAppTemplateConfigured,
} from "../../config/whatsappTemplates.config.js";

export {
  sendWhatsAppByTemplate,
  checkWhySmsAccountValidity,
  checkWhySmsConversationValidity,
  sendWhySmsTextMessage,
} from "./whatsAppProvider.service.js";
export {
  whatsAppEnabled,
  sendTemplateToPhone,
  sendTemplateBatch,
  queueWhatsAppJob,
} from "./whatsAppMessenger.service.js";

export {
  buildFeeInvoiceTemplateVariables,
  notifyFeeInvoiceWhatsApp,
  queueFeeInvoiceWhatsApp,
} from "./notifications/feeInvoice.notification.js";

export {
  buildFeeOverdueDueTemplateVariables,
  notifyFeeOverdueDueWhatsApp,
  runFeeDueDateReminderBatch,
} from "./notifications/feeOverdueDue.notification.js";
