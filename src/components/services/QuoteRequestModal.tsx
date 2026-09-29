"use client";

// src/components/services/QuoteRequestModal.tsx
// Quote-on-Demand via WhatsApp. Opens straight from a service card (guests
// included — no sign-in wall), collects customer + site details, saves the
// lead to Supabase FIRST (auditable QUOTE-* reference, no lost leads), then
// dispatches the structured payload to the business WhatsApp number via a
// wa.me deep link. Signed-in customers get their profile pre-filled; guests
// type everything by hand. NO prices are shown or sent anywhere — the
// pricing model is always "Custom Quote Required".

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/providers/Providers";
import { BrandLoader } from "@/components/ui/BrandLoader";
import {
  generateWhatsAppBookingLink,
  type WhatsAppBookingPayload,
} from "@/lib/whatsapp/booking";
import {
  QUOTE_TIME_WINDOWS,
  formatServiceDuration,
  type QuoteTimeWindow,
  type ServiceQuoteRequestCreateResponse,
} from "@/types/services";
import type { ServiceVM } from "@/types/catalog";

type FormState = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  siteAddress: string;
  preferredDate: string;
  timeWindow: QuoteTimeWindow;
  siteNotes: string;
};

const EMPTY_FORM: FormState = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  siteAddress: "",
  preferredDate: "",
  timeWindow: "Morning (08:00 – 11:00)",
  siteNotes: "",
};

function todayLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatPreferredDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Local fallback reference when Supabase is unreachable — the WhatsApp
 *  dispatch must never die on a save outage (lead preserved client-side). */
function localFallbackReference(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `QUOTE-UNSAVED-${rand}`;
}

export function QuoteRequestModal(props: {
  service: ServiceVM;
  open: boolean;
  onClose: () => void;
}) {
  const { service, open, onClose } = props;
  const { user, profile, loading: authLoading } = useSession();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [phase, setPhase] = useState<"form" | "saving" | "sent">("form");
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [quoteReference, setQuoteReference] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const set = (patch: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  // Fresh form every time the modal opens (stale drafts must not leak
  // between services), then pre-fill ONLY empty contact fields from the
  // active session — a signed-in customer should never retype their name.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setPhase("form");
    setError(null);
    setSaveFailed(false);
    setQuoteReference(null);
    setWhatsappUrl(null);
    if (!authLoading) prefillFromSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service.id]);

  // Late-arriving session (auth probe resolves after the modal opened).
  useEffect(() => {
    if (open && !authLoading) prefillFromSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, profile]);

  function prefillFromSession() {
    setForm((prev) => ({
      ...prev,
      customerName:
        prev.customerName || profile?.full_name || user?.email || "",
      customerPhone: prev.customerPhone || profile?.phone || "",
      customerEmail: prev.customerEmail || user?.email || "",
    }));
  }

  // Escape closes (same contract as DateTimePickerModal).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function validate(): string | null {
    if (form.customerName.trim().length < 2)
      return "Enter your full name (at least 2 characters)";
    if (!/^\+?[0-9][0-9\s\-().]{6,24}$/.test(form.customerPhone.trim()))
      return "Enter a valid phone number, e.g. +234 801 234 5678";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim()))
      return "Enter a valid email address";
    if (form.siteAddress.trim().length < 5)
      return "Enter the site address (street, city, state)";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.preferredDate))
      return "Pick your preferred inspection date";
    const chosen = new Date(`${form.preferredDate}T00:00:00`);
    if (Number.isNaN(chosen.getTime())) return "That date does not exist";
    const today = new Date();
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    if (chosen.getTime() < todayMidnight.getTime())
      return "The preferred inspection date must be today or later";
    return null;
  }

  function buildPayload(reference: string): WhatsAppBookingPayload {
    return {
      serviceTitle: service.name,
      serviceCode: service.slug,
      estimatedDuration: formatServiceDuration(service.durationMinutes),
      quoteReference: reference,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      customerEmail: form.customerEmail.trim(),
      siteAddress: form.siteAddress.trim(),
      preferredDate: formatPreferredDate(form.preferredDate),
      timeWindow: form.timeWindow,
      siteNotes: form.siteNotes.trim() || "No additional scope provided.",
    };
  }

  /** Save FIRST (auditable reference), then open WhatsApp. */
  async function submit() {
    const blocker = validate();
    if (blocker) {
      setError(blocker);
      return;
    }
    setError(null);
    setPhase("saving");

    let reference: string | null = null;
    try {
      const response = await fetch("/api/service-quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim(),
          siteAddress: form.siteAddress.trim(),
          preferredDate: form.preferredDate,
          timeWindow: form.timeWindow,
          siteNotes: form.siteNotes.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ServiceQuoteRequestCreateResponse
        | { error?: string; issues?: string[] }
        | null;

      if (!response.ok || !payload || !("quoteReference" in payload)) {
        throw new Error(
          (payload as { issues?: string[] })?.issues?.[0] ??
            (payload as { error?: string })?.error ??
            "Could not save your quote request"
        );
      }
      reference = payload.quoteReference;
      setSaveFailed(false);
    } catch (err) {
      // The lead must still reach WhatsApp — flag it, dispatch with a local
      // reference, and let the banner explain that the office will confirm.
      reference = localFallbackReference();
      setSaveFailed(true);
      setError(
        `${err instanceof Error ? err.message : "Could not save your quote request"} — your request will still be sent, but may not appear in our tracking system until the office replies.`
      );
    }

    dispatchToWhatsApp(reference);
  }

  function dispatchToWhatsApp(reference: string) {
    setQuoteReference(reference);
    try {
      const url = generateWhatsAppBookingLink(buildPayload(reference));
      setWhatsappUrl(url);
      setPhase("sent");
      // Best-effort auto-open inside the click gesture's async window; if
      // the browser blocks the popup the success panel's anchor below is
      // the guaranteed one-tap fallback.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setWhatsappUrl(null);
      setPhase("form");
      setError(
        "WhatsApp is not configured on this deployment (NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER). Your request was saved — the office will contact you."
      );
    }
  }

  return (
    <>
      <button
        type="button"
        className="qrm-scrim"
        aria-label="Close quote request form"
        onClick={onClose}
      />
      <div className="qrm">
        <div
          className="qrm__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qrm-title"
          ref={dialogRef}
          tabIndex={-1}
        >
          <div className="qrm__head">
            <div>
              <h2 id="qrm-title" className="qrm__title">
                Request a custom quote
              </h2>
              <p className="qrm__subtitle">
                No sign-in required — we reply on WhatsApp with your quote.
              </p>
            </div>
            <button
              type="button"
              className="qrm__close"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {phase === "sent" ? (
            <div className="qrm__body qrm__success">
              <p className="qrm__success-emoji" aria-hidden="true">
                ✅
              </p>
              <h3>Quote request {saveFailed ? "dispatched" : "saved"}</h3>
              <p>
                Reference:{" "}
                <span className="qrm__ref mono">{quoteReference}</span>
              </p>
              <p className="muted" style={{ fontSize: ".85rem" }}>
                {whatsappUrl
                  ? "WhatsApp should be opening in a new tab. If your browser blocked it, use the button below — your reference is already included in the message."
                  : "Your details were received; the office will reach out on WhatsApp shortly."}
              </p>
              {whatsappUrl ? (
                <a
                  className="btn qrm__whatsapp"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open WhatsApp
                </a>
              ) : null}
              <button
                type="button"
                className="btn btn--secondary"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          ) : (
            <form
              className="qrm__body"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              noValidate
            >
              {/* Service data — read-only context, never editable here. */}
              <fieldset className="qrm__service" disabled>
                <legend>Service</legend>
                <div className="qrm__service-row">
                  <span className="chip chip--primary">{service.name}</span>
                  <span className="chip mono">{service.slug}</span>
                  <span className="chip">
                    {formatServiceDuration(service.durationMinutes)}
                  </span>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>
                  Pricing model: custom quote required — the engineer prices
                  your site after review.
                </p>
              </fieldset>

              <h3 className="qrm__section">Your details</h3>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="qrm-name">Full name</label>
                  <input
                    id="qrm-name"
                    autoComplete="name"
                    maxLength={120}
                    value={form.customerName}
                    onChange={(e) => set({ customerName: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="qrm-phone">Phone number (WhatsApp)</label>
                  <input
                    id="qrm-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+234 801 234 5678"
                    maxLength={25}
                    value={form.customerPhone}
                    onChange={(e) => set({ customerPhone: e.target.value })}
                    required
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="qrm-email">Email address</label>
                  <input
                    id="qrm-email"
                    type="email"
                    autoComplete="email"
                    maxLength={160}
                    value={form.customerEmail}
                    onChange={(e) => set({ customerEmail: e.target.value })}
                    required
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="qrm-address">Site address</label>
                  <input
                    id="qrm-address"
                    autoComplete="street-address"
                    placeholder="Street, city, state"
                    maxLength={400}
                    value={form.siteAddress}
                    onChange={(e) => set({ siteAddress: e.target.value })}
                    required
                  />
                </div>
              </div>

              <h3 className="qrm__section">Schedule &amp; notes</h3>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="qrm-date">Preferred inspection date</label>
                  <input
                    id="qrm-date"
                    type="date"
                    min={todayLocalIso()}
                    value={form.preferredDate}
                    onChange={(e) => set({ preferredDate: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="qrm-window">Time window</label>
                  <select
                    id="qrm-window"
                    value={form.timeWindow}
                    onChange={(e) =>
                      set({ timeWindow: e.target.value as QuoteTimeWindow })
                    }
                  >
                    {QUOTE_TIME_WINDOWS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field span-2">
                  <label htmlFor="qrm-notes">
                    Site notes / scope (optional, ≤ 4000 chars)
                  </label>
                  <textarea
                    id="qrm-notes"
                    rows={4}
                    maxLength={4000}
                    value={form.siteNotes}
                    onChange={(e) => set({ siteNotes: e.target.value })}
                    placeholder="Number of cameras / points, building type, existing infrastructure, access constraints…"
                  />
                </div>
              </div>

              {error ? (
                <p className="banner banner--error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="qrm__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={onClose}
                  disabled={phase === "saving"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn qrm__whatsapp"
                  disabled={phase === "saving"}
                >
                  {phase === "saving" ? (
                    <>
                      <BrandLoader variant="inline" label="" />
                      Saving…
                    </>
                  ) : (
                    "Get my quote on WhatsApp"
                  )}
                </button>
              </div>
              <p className="muted" style={{ fontSize: ".78rem", margin: 0 }}>
                {authLoading
                  ? "Checking for an active session…"
                  : user
                    ? "Signed in — your profile details are pre-filled."
                    : "Guest request — no account needed."}
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
