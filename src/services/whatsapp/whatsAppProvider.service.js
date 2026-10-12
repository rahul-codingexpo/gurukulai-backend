import { ENV } from "../../config/env.js";
import {
  getWhatsAppTemplateConfig,
  resolveWhatsAppTemplateLanguage,
  resolveWhatsAppTemplateName,
} from "../../config/whatsappTemplates.config.js";

const provider = () => String(ENV.WHYSMS_PROVIDER || "whysms").toLowerCase();

const WHY_SMS_API_BASE =
  String(ENV.WHYSMS_WAPP_API_BASE || "https://wapp.whysms.in/api").replace(/\/$/, "");

/** WhySMS Param= is comma-separated — strip commas inside values (e.g. 1,000 → 1000). */
const sanitizeWhySmsParamValue = (v) => String(v ?? "").trim().replace(/,/g, "");

const buildWhySmsParamString = (variables) =>
  variables.map(sanitizeWhySmsParamValue).join(",");

const whySmsAuthQuery = () => {
  const license = String(ENV.WHYSMS_LICENSE_KEY || "").trim();
  const apiKey = String(ENV.WHYSMS_API_KEY || "").trim();
  if (!license || !apiKey) {
    throw new Error("WHYSMS_LICENSE_KEY and WHYSMS_API_KEY are required");
  }
  return { LicenseNumber: license, APIKey: apiKey };
};

const parseWhySmsResponse = async (res) => {
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain text / xml from WhySMS
  }

  if (typeof data === "object" && data?.ApiResponse === "Fail") {
    const err =
      data?.ApiMessage?.ErrorMessage?.error?.message ||
      data?.ApiMessage?.ErrorMessage?.error?.error_data?.details ||
      JSON.stringify(data.ApiMessage || data).slice(0, 500);
    throw new Error(err);
  }

  if (!res.ok) {
    throw new Error(String(text).slice(0, 500));
  }

  if (typeof data === "object" && data?.ApiResponse && data.ApiResponse !== "Success") {
    throw new Error(JSON.stringify(data).slice(0, 500));
  }

  return { raw: text, data };
};

/** GET https://wapp.whysms.in/api/conversationvalidity.php */
export const checkWhySmsConversationValidity = async (contact) => {
  const q = new URLSearchParams({ ...whySmsAuthQuery(), Contact: contact });
  const url = `${WHY_SMS_API_BASE}/conversationvalidity.php?${q.toString()}`;
  const res = await fetch(url, { method: "GET" });
  return parseWhySmsResponse(res);
};

const extractWhySmsMessageStatus = (parsed) => {
  const msg = parsed?.data?.ApiMessage?.messages?.[0];
  return {
    messageId: msg?.id ?? null,
    messageStatus: msg?.message_status ?? null,
    waId: parsed?.data?.ApiMessage?.contacts?.[0]?.wa_id ?? null,
  };
};

/** GET https://wapp.whysms.in/api/sendtextmessage.php — only works inside 24h session window. */
export const sendWhySmsTextMessage = async (contact, message) => {
  const q = new URLSearchParams({
    ...whySmsAuthQuery(),
    Contact: contact,
    Message: String(message ?? "").slice(0, 1000),
  });
  const url = `${WHY_SMS_API_BASE}/sendtextmessage.php?${q.toString()}`;
  const res = await fetch(url, { method: "GET" });
  return parseWhySmsResponse(res);
};

/** GET https://wapp.whysms.in/api/accountvalidity.php */
export const checkWhySmsAccountValidity = async () => {
  const q = new URLSearchParams(whySmsAuthQuery());
  const url = `${WHY_SMS_API_BASE}/accountvalidity.php?${q.toString()}`;
  const res = await fetch(url, { method: "GET" });
  return parseWhySmsResponse(res);
};

/**
 * GET https://wapp.whysms.in/api/sendtemplate.php
 * Param = comma-separated {{1}}..{{n}}; Fileurl + PDFName for document header.
 */
const sendViaWhySmsWapp = async ({
  to,
  templateName,
  variables,
  header,
  recipientName,
}) => {
  const q = new URLSearchParams(whySmsAuthQuery());
  q.set("Contact", to);
  q.set("Template", templateName);
  q.set("Param", buildWhySmsParamString(variables));

  if (recipientName) {
    q.set("Name", sanitizeWhySmsParamValue(recipientName));
  }

  if (header?.type === "document" && header.document?.link) {
    q.set("Fileurl", header.document.link);
    if (header.document.filename) {
      q.set("PDFName", header.document.filename);
    }
  }

  const url = `${WHY_SMS_API_BASE}/sendtemplate.php?${q.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const parsed = await parseWhySmsResponse(res);
  const delivery = extractWhySmsMessageStatus(parsed);

  return { success: true, provider: "whysms", data: parsed, delivery };
};

const buildBodyParameters = (variables) =>
  variables.map((text) => ({
    type: "text",
    text: String(text ?? "").slice(0, 1024),
  }));

const buildHeaderComponent = (header) => {
  if (!header || header.type === "none") return null;

  if (header.type === "document" && header.document?.link) {
    return {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: header.document.link,
            filename: header.document.filename || "document.pdf",
          },
        },
      ],
    };
  }

  if (header.type === "image" && header.image?.link) {
    return {
      type: "header",
      parameters: [{ type: "image", image: { link: header.image.link } }],
    };
  }

  if (header.type === "video" && header.video?.link) {
    return {
      type: "header",
      parameters: [{ type: "video", video: { link: header.video.link } }],
    };
  }

  return null;
};

const sendViaMetaCloud = async ({ to, templateName, language, variables, header }) => {
  const phoneNumberId = ENV.WHYSMS_LICENSE_KEY;
  const token = ENV.WHYSMS_API_KEY;
  const version = ENV.WHYSMS_META_API_VERSION || "v21.0";
  const base = String(ENV.WHYSMS_META_GRAPH_URL || "https://graph.facebook.com").replace(
    /\/$/,
    "",
  );

  if (!phoneNumberId || !token) {
    throw new Error("WHYSMS_LICENSE_KEY (phone number id) and WHYSMS_API_KEY (EAA token) are required for meta provider");
  }

  const components = [];
  const headerComponent = buildHeaderComponent(header);
  if (headerComponent) components.push(headerComponent);

  components.push({
    type: "body",
    parameters: buildBodyParameters(variables),
  });

  const url = `${base}/${version}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `WhatsApp API error HTTP ${res.status}`;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  return { success: true, provider: "meta", data };
};

const sendViaRest = async ({ to, templateName, language, variables, header }) => {
  const base = String(ENV.WHYSMS_API_BASE_URL || "").replace(/\/$/, "");
  const path = ENV.WHYSMS_WHATSAPP_SEND_PATH || "/whatsapp/send-template";
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  if (!base) {
    throw new Error("WHYSMS_API_BASE_URL is required for rest provider");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ENV.WHYSMS_API_KEY ? { Authorization: `Bearer ${ENV.WHYSMS_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      api_key: ENV.WHYSMS_API_KEY,
      license_key: ENV.WHYSMS_LICENSE_KEY,
      from: ENV.WHYSMS_WHATSAPP_FROM,
      to,
      template_name: templateName,
      language,
      variables,
      header_document_url:
        header?.type === "document" ? header.document?.link : undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.message || data?.error || `WhatsApp API error HTTP ${res.status}`;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  return { success: true, provider: "rest", data };
};

/**
 * Low-level send for any registered template key.
 */
export const sendWhatsAppByTemplate = async ({
  templateKey,
  to,
  variables,
  header,
  language,
  recipientName,
}) => {
  const cfg = getWhatsAppTemplateConfig(templateKey);
  const templateName = resolveWhatsAppTemplateName(templateKey);
  const lang = language || resolveWhatsAppTemplateLanguage(templateKey);

  if (!templateName) {
    throw new Error(
      `Template "${templateKey}" is not configured. Set ${cfg.envName} in .env`,
    );
  }
  if (!to) {
    throw new Error("Recipient phone is required");
  }
  if (!Array.isArray(variables) || variables.length !== cfg.variableCount) {
    throw new Error(
      `Template "${templateKey}" requires exactly ${cfg.variableCount} body variable(s)`,
    );
  }

  if (cfg.header === "document" && (!header || header.type !== "document")) {
    throw new Error(`Template "${templateKey}" requires a document header`);
  }

  const resolvedHeader =
    header || (cfg.header === "none" ? { type: "none" } : null);

  const mode = provider();

  if (mode === "whysms" || mode === "wapp") {
    return sendViaWhySmsWapp({
      to,
      templateName,
      variables,
      header: resolvedHeader,
      recipientName: recipientName || variables[0],
    });
  }

  if (mode === "rest") {
    return sendViaRest({
      to,
      templateName,
      language: lang,
      variables,
      header: resolvedHeader,
    });
  }

  return sendViaMetaCloud({
    to,
    templateName,
    language: lang,
    variables,
    header: resolvedHeader,
  });
};
