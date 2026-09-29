// tests/whatsapp-booking.test.ts
// Quote-on-Demand via WhatsApp — the deep-link generator is exercised with
// the EXACT code the modal runs (no React imports, env injected per case).

import { describe, expect, it, afterEach } from "vitest";
import {
  buildWhatsAppBookingMessage,
  generateWhatsAppBookingLink,
  getWhatsAppBusinessNumber,
  normalizeWhatsAppNumber,
  type WhatsAppBookingPayload,
} from "@/lib/whatsapp/booking";

const ENV_KEY = "NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER";

const samplePayload: WhatsAppBookingPayload = {
  serviceTitle: "Full CCTV Site Installation",
  serviceCode: "install-full-cctv-site",
  estimatedDuration: "≈ 8 h on site",
  quoteReference: "QUOTE-20260929-0001",
  customerName: "Ada Obi",
  customerPhone: "+234 801 234 5678",
  customerEmail: "ada@example.com",
  siteAddress: "12 Adeola Odeku St, Victoria Island, Lagos",
  preferredDate: "Tuesday, 6 October 2026",
  timeWindow: "Morning (08:00 – 11:00)",
  siteNotes: "8 cameras, 2-storey building, existing conduit available.",
};

const originalEnv = process.env[ENV_KEY];

afterEach(() => {
  if (originalEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = originalEnv;
});

describe("normalizeWhatsAppNumber", () => {
  it("strips formatting noise and the leading +", () => {
    expect(normalizeWhatsAppNumber("+234 801 234-5678")).toBe("2348012345678");
  });

  it("strips a leading 00 international prefix", () => {
    expect(normalizeWhatsAppNumber("002348012345678")).toBe("2348012345678");
  });

  it("tolerates parentheses and dots-free local formats", () => {
    expect(normalizeWhatsAppNumber("(234) 801-234-5678")).toBe(
      "2348012345678"
    );
  });

  it("rejects empty, alphabetic, and too-short/long input", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
    expect(normalizeWhatsAppNumber("+234 801 23A 5678")).toBeNull();
    expect(normalizeWhatsAppNumber("+1234")).toBeNull();
    expect(normalizeWhatsAppNumber("9".repeat(16))).toBeNull();
  });
});

describe("buildWhatsAppBookingMessage", () => {
  const message = buildWhatsAppBookingMessage(samplePayload);

  it("renders the header and pricing model with WhatsApp bold", () => {
    expect(message).toContain("🚨 *NEW SERVICE BOOKING REQUEST* 🚨");
    expect(message).toContain("🏷 *Pricing Model:* Custom Quote Required");
  });

  it("renders the service line with duration in parentheses", () => {
    expect(message).toContain(
      "🛠 *Service Requested:* Full CCTV Site Installation (≈ 8 h on site)"
    );
  });

  it("carries the Supabase audit reference", () => {
    expect(message).toContain("🏷 *Reference:* QUOTE-20260929-0001");
  });

  it("renders every customer detail as a bullet", () => {
    expect(message).toContain("• *Name:* Ada Obi");
    expect(message).toContain("• *Phone:* +234 801 234 5678");
    expect(message).toContain("• *Email:* ada@example.com");
    expect(message).toContain(
      "• *Site Address:* 12 Adeola Odeku St, Victoria Island, Lagos"
    );
  });

  it("renders schedule preference and quoted notes", () => {
    expect(message).toContain(
      "• *Preferred Date/Time:* Tuesday, 6 October 2026 (Morning (08:00 – 11:00))"
    );
    expect(message).toContain(
      '📝 *ADDITIONAL SCOPE / NOTES*\n"8 cameras, 2-storey building, existing conduit available."'
    );
  });

  it("ends with the portal footer", () => {
    expect(message.trimEnd()).toMatch(
      /ℹ️ \*This request was initiated from Chris Viscus Technologies booking portal\. Please review and provide a custom quote\.\*$/
    );
  });

  it("uses real line breaks (never literal \\n text)", () => {
    expect(message).not.toContain("\\n");
    expect(message.split("\n").length).toBeGreaterThan(10);
  });
});

describe("generateWhatsAppBookingLink", () => {
  it("builds a wa.me link with percent-encoded markdown text", () => {
    process.env[ENV_KEY] = "+234 801 234 5678";
    const link = generateWhatsAppBookingLink(samplePayload);
    const prefix = "https://wa.me/2348012345678?text=";
    const query = link.slice(prefix.length);

    expect(link.startsWith(prefix)).toBe(true);
    expect(query).toBe(
      encodeURIComponent(buildWhatsAppBookingMessage(samplePayload))
    );
    // Encoding contract: \n becomes %0A, and encodeURIComponent leaves the
    // asterisk (RFC 3986 unreserved mark) LITERAL — so WhatsApp still sees
    // the *bold* markers after the round trip.
    expect(query).toContain("%0A");
    expect(query).toContain("*NEW%20SERVICE%20BOOKING%20REQUEST*");
    expect(decodeURIComponent(query)).toContain("*CUSTOMER DETAILS*");
  });

  it("throws when the business number is not configured", () => {
    delete process.env[ENV_KEY];
    expect(() => generateWhatsAppBookingLink(samplePayload)).toThrow(
      /NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER/
    );
    expect(getWhatsAppBusinessNumber()).toBeNull();
  });

  it("throws on a malformed configured number rather than dialing nowhere", () => {
    process.env[ENV_KEY] = "not-a-phone";
    expect(() => generateWhatsAppBookingLink(samplePayload)).toThrow();
  });
});
