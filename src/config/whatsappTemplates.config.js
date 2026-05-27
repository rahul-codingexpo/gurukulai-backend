import { ENV } from "./env.js";

const envStr = (key) => (key ? String(process.env[key] || "").trim() : "");

/**
 * Registry of WhatsApp template "keys" used in code.
 * Each key maps to an approved template name in .env and metadata for sending.
 *
 * To add a new template:
 * 1. Add a key here (e.g. HOMEWORK_ASSIGNED).
 * 2. Add WHYSMS_TPL_<KEY>_NAME (and optional _LANG) to .env.
 * 3. Create src/services/whatsapp/notifications/<name>.notification.js
 *    with buildVariables() + notify handler.
 * 4. Call sendWhatsAppByTemplate() or queueWhatsAppNotification() from your module.
 */
export const WhatsAppTemplateKey = {
  FEE_INVOICE: "fee_invoice",
  FEE_OVERDUE_DUE: "fee_overdue_due",
  // FEE_PAYMENT_RECEIVED: "fee_payment_received",
  // HOMEWORK_ASSIGNED: "homework_assigned",
};

/** @typedef {'none'|'document'|'image'|'video'} WhatsAppHeaderType */

/**
 * @type {Record<string, {
 *   description: string,
 *   envName: string,
 *   legacyEnvName?: string,
 *   envLanguage?: string,
 *   defaultLanguage: string,
 *   variableCount: number,
 *   header: WhatsAppHeaderType,
 * }>}
 */
export const whatsAppTemplateRegistry = {
  [WhatsAppTemplateKey.FEE_INVOICE]: {
    description: "Fee invoice generated — PDF header + 13 body variables",
    envName: "WHYSMS_TPL_FEE_INVOICE_NAME",
    legacyEnvName: "WHYSMS_INVOICE_TEMPLATE_NAME",
    envLanguage: "WHYSMS_TPL_FEE_INVOICE_LANG",
    defaultLanguage: "en",
    variableCount: 13,
    header: "document",
  },
  [WhatsAppTemplateKey.FEE_OVERDUE_DUE]: {
    description: "Fee balance due today — 10 body variables, no header",
    envName: "WHYSMS_TPL_FEE_OVERDUE_DUE_NAME",
    envLanguage: "WHYSMS_TPL_FEE_OVERDUE_DUE_LANG",
    defaultLanguage: "en",
    variableCount: 10,
    header: "none",
  },
};

export const listWhatsAppTemplates = () =>
  Object.entries(whatsAppTemplateRegistry).map(([key, cfg]) => ({
    key,
    description: cfg.description,
    variableCount: cfg.variableCount,
    header: cfg.header,
    templateName: resolveWhatsAppTemplateName(key),
    language: resolveWhatsAppTemplateLanguage(key),
    configured: Boolean(resolveWhatsAppTemplateName(key)),
  }));

export const getWhatsAppTemplateConfig = (templateKey) => {
  const cfg = whatsAppTemplateRegistry[templateKey];
  if (!cfg) {
    throw new Error(
      `Unknown WhatsApp template key "${templateKey}". Register it in whatsappTemplates.config.js`,
    );
  }
  return cfg;
};

export const resolveWhatsAppTemplateName = (templateKey) => {
  const cfg = getWhatsAppTemplateConfig(templateKey);
  const fromEnv = envStr(cfg.envName);
  const legacy = envStr(cfg.legacyEnvName);
  return fromEnv || legacy || null;
};

export const resolveWhatsAppTemplateLanguage = (templateKey) => {
  const cfg = getWhatsAppTemplateConfig(templateKey);
  const specific = envStr(cfg.envLanguage);
  const global = envStr("WHYSMS_TEMPLATE_LANGUAGE");
  return specific || global || cfg.defaultLanguage || "en";
};

export const isWhatsAppTransportConfigured = () =>
  String(ENV.WHYSMS_WHATSAPP_ENABLED || "").toLowerCase() === "true" &&
  Boolean(ENV.WHYSMS_API_KEY) &&
  Boolean(ENV.WHYSMS_LICENSE_KEY);

export const isWhatsAppTemplateConfigured = (templateKey) =>
  isWhatsAppTransportConfigured() && Boolean(resolveWhatsAppTemplateName(templateKey));
