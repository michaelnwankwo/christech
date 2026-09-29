// src/lib/whatsapp/booking.ts
// Quote-on-Demand via WhatsApp — deep-link generator (blueprint §11
// extension). Pure string building with NO React/server imports so both the
// modal (client) and vitest exercise the exact same code path.
//
// Contract:
//   * Destination number comes ONLY from NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER
//     (configured via Netlify env; baked into the client bundle at build).
//   * Formatting is WhatsApp Markdown: *bold*, bullets "•", and real "\n"
//     line breaks which encodeURIComponent() emits as %0A.
//   * Prices are NEVER rendered here — the pricing model line is always
//     "Custom Quote Required" (baseline prices were stripped from the UI).

/** Everything the WhatsApp message template needs, pre-formatted by caller. */
export type WhatsAppBookingPayload = {
  /** Service Data */
  serviceTitle: string;
  serviceCode: string;
  estimatedDuration: string;
  /** Audit reference returned by Supabase (QUOTE-YYYYMMDD-NNNN). */
  quoteReference: string;
  /** Customer Details */
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  siteAddress: string;
  /** Schedule & Notes */
  preferredDate: string;
  timeWindow: string;
  siteNotes: string;
};

/**
 * Normalize a phone number to the E.164-digits form wa.me requires:
 * strips spaces/dashes/parentheses, then a leading "+" or "00".
 * Returns null when the remainder is not 7–15 digits.
 */
export function normalizeWhatsAppNumber(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return digits;
}

/** Env-backed business number, already normalized; null when unset/invalid. */
export function getWhatsAppBusinessNumber(): string | null {
  return normalizeWhatsAppNumber(
    process.env.NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER
  );
}

/** The exact message template dispatched to the business number. */
export function buildWhatsAppBookingMessage(
  payload: WhatsAppBookingPayload
): string {
  return [
    "🚨 *NEW SERVICE BOOKING REQUEST* 🚨",
    "",
    `🛠 *Service Requested:* ${payload.serviceTitle} (${payload.estimatedDuration})`,
    `🏷 *Reference:* ${payload.quoteReference}`,
    "🏷 *Pricing Model:* Custom Quote Required",
    "",
    "👤 *CUSTOMER DETAILS*",
    `• *Name:* ${payload.customerName}`,
    `• *Phone:* ${payload.customerPhone}`,
    `• *Email:* ${payload.customerEmail}`,
    `• *Site Address:* ${payload.siteAddress}`,
    "",
    "📅 *SCHEDULE PREFERENCE*",
    `• *Preferred Date/Time:* ${payload.preferredDate} (${payload.timeWindow})`,
    "",
    "📝 *ADDITIONAL SCOPE / NOTES*",
    `"${payload.siteNotes}"`,
    "",
    "ℹ️ *This request was initiated from Chris Viscus Technologies booking portal. Please review and provide a custom quote.*",
  ].join("\n");
}

/**
 * Build the wa.me deep link for a quote request:
 *   https://wa.me/{phone}?text={encodedText}
 * Throws when NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER is missing/invalid so the
 * caller can surface a configuration error instead of dispatching nowhere.
 */
export function generateWhatsAppBookingLink(
  bookingPayload: WhatsAppBookingPayload
): string {
  const phone = getWhatsAppBusinessNumber();
  if (!phone) {
    throw new Error(
      "WhatsApp business number is not configured (NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER)"
    );
  }
  const text = encodeURIComponent(
    buildWhatsAppBookingMessage(bookingPayload)
  );
  return `https://wa.me/${phone}?text=${text}`;
}
