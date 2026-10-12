/** @deprecated Import from `services/whatsapp/index.js` instead. */
export {
  sendWhatsAppByTemplate as sendWhatsAppTemplate,
  isWhatsAppTransportConfigured as whatsAppConfigured,
} from "./whatsapp/whatsAppProvider.service.js";

import { WhatsAppTemplateKey, isWhatsAppTemplateConfigured } from "../config/whatsappTemplates.config.js";

/** @deprecated Use isWhatsAppTemplateConfigured(WhatsAppTemplateKey.FEE_INVOICE) */
export const whatsAppInvoiceConfigured = () =>
  isWhatsAppTemplateConfigured(WhatsAppTemplateKey.FEE_INVOICE);
