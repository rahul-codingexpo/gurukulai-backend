import { ENV } from "../../config/env.js";
import {
  getWhatsAppTemplateConfig,
  isWhatsAppTemplateConfigured,
  isWhatsAppTransportConfigured,
  resolveWhatsAppTemplateName,
} from "../../config/whatsappTemplates.config.js";
import { sendWhatsAppByTemplate } from "./whatsAppProvider.service.js";

const isDevDebugRouting = () =>
  String(ENV.NODE_ENV || process.env.NODE_ENV || "").toLowerCase() === "development" &&
  Boolean(String(process.env.WHYSMS_DEBUG_CONTACT || "").trim());

export const whatsAppEnabled = () => isWhatsAppTransportConfigured();

/**
 * Send one message for a template key to one phone.
 */
export const sendTemplateToPhone = async ({
  templateKey,
  phone,
  variables,
  header,
  language,
}) => {
  if (!isWhatsAppTransportConfigured()) {
    return { skipped: true, reason: "WHYSMS_WHATSAPP_ENABLED is not true or credentials missing" };
  }

  if (!isWhatsAppTemplateConfigured(templateKey)) {
    return {
      skipped: true,
      reason: `Template "${templateKey}" is not configured in .env`,
    };
  }

  return sendWhatsAppByTemplate({
    templateKey,
    to: phone,
    variables,
    header,
    language,
  });
};

/**
 * Send the same template to many recipients; each can have different variables.
 *
 * @param {object} opts
 * @param {string} opts.templateKey
 * @param {Array<{ phone: string, variables: string[], recipientType?: string, recipientName?: string, meta?: object }>} opts.recipients
 * @param {object} [opts.header] - shared header (e.g. same PDF for all)
 * @param {string} [opts.language]
 */
export const sendTemplateBatch = async ({
  templateKey,
  recipients,
  header,
  language,
}) => {
  if (!isWhatsAppTemplateConfigured(templateKey)) {
    return { skipped: true, reason: `Template "${templateKey}" not configured`, logs: [] };
  }

  const cfg = getWhatsAppTemplateConfig(templateKey);
  const logs = [];

  for (const recipient of recipients) {
    const {
      phone,
      variables,
      recipientType = "unknown",
      recipientName,
    } = recipient;

    if (!Array.isArray(variables) || variables.length !== cfg.variableCount) {
      logs.push({
        phone,
        recipientType,
        status: "failed",
        error: `Expected ${cfg.variableCount} variables`,
      });
      continue;
    }

    try {
      const result = await sendWhatsAppByTemplate({
        templateKey,
        to: phone,
        variables,
        header,
        language,
        recipientName: recipient.recipientName || variables[0],
      });
      logs.push({
        phone,
        recipientType,
        status: result.skipped ? "skipped" : "sent",
        messageStatus: result.delivery?.messageStatus ?? null,
        messageId: result.delivery?.messageId ?? null,
        detail: result,
      });
    } catch (err) {
      logs.push({
        phone,
        recipientType,
        status: "failed",
        error: err.message,
      });
    }
  }

  return {
    templateKey,
    templateName: resolveWhatsAppTemplateName(templateKey),
    recipients: logs.length,
    logs,
  };
};

/** Background runner — does not throw. */
export const queueWhatsAppJob = (jobName, fn) => {
  setImmediate(() => {
    fn()
      .then((result) => {
        if (result?.skipped) {
          console.warn(`[whatsapp:${jobName}] skipped:`, result.reason, result.error || "");
        } else if (result?.logs?.some((l) => l.status === "failed")) {
          console.error(`[whatsapp:${jobName}] send failures:`, result.logs);
        } else {
          const sentTo = (result?.logs || [])
            .filter((l) => l.status === "sent")
            .map((l) => ({
              phone: l.phone,
              type: l.recipientType,
              messageStatus: l.messageStatus,
              messageId: l.messageId,
            }));
          console.log(`[whatsapp:${jobName}] done`, {
            recipients: result?.recipients ?? result?.logs?.length ?? 0,
            pdfUrl: result?.pdfUrl,
            businessSender: ENV.WHYSMS_WHATSAPP_FROM || null,
            sentTo,
          });
          if (isDevDebugRouting()) {
            console.warn(
              `[whatsapp:${jobName}] DEV mode: message sent only to WHYSMS_DEBUG_CONTACT. On the phone, open WhatsApp chat from business number ${ENV.WHYSMS_WHATSAPP_FROM || "(see WhySMS panel)"} — check Updates tab. If still empty, run: npm run diagnose:whysms`,
            );
          } else {
            console.log(
              `[whatsapp:${jobName}] Delivered to student/parent phones saved on the student record.`,
            );
          }
          if (sentTo.some((s) => s.messageStatus === "accepted")) {
            console.warn(
              `[whatsapp:${jobName}] message_status "accepted" = Meta queued the message only. If the phone shows nothing, check WhySMS delivery logs for messageId (wamid) or billing/WABA setup with WhySMS support.`,
            );
          }
        }
      })
      .catch((err) => {
        console.error(`[whatsapp:${jobName}]`, err.message, err.stack);
      });
  });
};
