"use client";

// src/components/services/BookingWizard.tsx
// Blueprint §11 flow steps 2–7. SEPARATION ENFORCED AT THE IMPORT LEVEL:
// this module imports the booking-draft store and NOTHING from
// stores/cart-store (§2.4 + test 19.4 "service booking does not mutate cart
// state"). Submit hits /api/service-requests; the DB trigger guarantees the
// chosen service is a booking-kind service.
//
// Step subcomponents live at module scope — defining components inside the
// wizard would remount them on every keystroke (focus loss).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBookingDraftStore, type BookingDraft } from "@/stores/booking-draft-store";
import { useSession } from "@/components/providers/Providers";
import { BookingSummary } from "./BookingSummary";
import { DateTimePickerModal } from "./DateTimePickerModal";
import { formatMinorMoney } from "@/lib/currency/money";
import { BrandLoader } from "@/components/ui/BrandLoader";
import type { SiteAddress } from "@/types/services";
import type { ServiceVM } from "@/types/catalog";

const STEPS = ["Service", "Schedule", "Site & notes", "Review"] as const;

const NG_STATES = [
  "Lagos","Abuja (FCT)","Ogun","Oyo","Osun","Ondo","Ekiti","Rivers","Delta",
  "Edo","Anambra","Imo","Abia","Enugu","Ebonyi","Kaduna","Kano",
];

export function BookingWizard(props: {
  services: ServiceVM[];
  initialServiceSlug?: string;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useSession();

  const draft = useBookingDraftStore((s) => s.draft);
  const update = useBookingDraftStore((s) => s.update);
  const submitting = useBookingDraftStore((s) => s.submitting);
  const error = useBookingDraftStore((s) => s.error);
  const createdNumber = useBookingDraftStore((s) => s.createdRequestNumber);
  const setError = useBookingDraftStore((s) => s.setError);
  const setSubmitting = useBookingDraftStore((s) => s.setSubmitting);
  const markCreated = useBookingDraftStore((s) => s.markCreated);
  const reset = useBookingDraftStore((s) => s.reset);

  const [step, setStep] = useState(0);

  // Deep link /booking?service=<slug> preselects the service.
  useEffect(() => {
    if (!props.initialServiceSlug) return;
    const found = props.services.find(
      (s) => s.slug === props.initialServiceSlug
    );
    if (found && draft.serviceId !== found.id) {
      update({
        serviceId: found.id,
        serviceSlug: found.slug,
        serviceName: found.name,
      });
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialServiceSlug, props.services]);

  const selectedService = useMemo(
    () => props.services.find((s) => s.id === draft.serviceId) ?? null,
    [props.services, draft.serviceId]
  );

  function validationBlocker(): string | null {
    if (step === 0 && !draft.serviceId) return "Choose a service to continue";
    if (step === 1) {
      if (selectedService?.requiresSchedule && !draft.requestedStartAt) {
        return "Pick a requested start date & time";
      }
      if (
        draft.requestedStartAt &&
        draft.requestedEndAt &&
        Date.parse(draft.requestedEndAt) <= Date.parse(draft.requestedStartAt)
      ) {
        return "Window end must be after the start";
      }
      if (
        draft.requestedStartAt &&
        Date.parse(draft.requestedStartAt) < Date.now()
      ) {
        return "The requested window must be in the future";
      }
    }
    if (step === 2) {
      const a = draft.siteAddress;
      if (!a || !a.city.trim() || !a.addressLine1.trim() || !a.state.trim()) {
        return "City, state, and street address are required";
      }
    }
    return null;
  }

  async function submit() {
    if (!user) {
      router.push("/login?next=/booking");
      return;
    }
    setSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: draft.serviceId,
          requestedStartAt: draft.requestedStartAt,
          requestedEndAt: draft.requestedEndAt,
          siteAddress: draft.siteAddress,
          notes: draft.notes || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        requestNumber?: string;
        error?: string;
        issues?: string[];
      } | null;

      if (!response.ok || !payload?.requestNumber) {
        throw new Error(
          payload?.issues?.[0] ??
            payload?.error ??
            "Could not submit the booking request"
        );
      }
      markCreated(payload.requestNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setSubmitting(false);
    }
  }

  if (createdNumber) {
    return (
      <div className="wizard">
        <div className="wizard__panel surface-card booking-done">
          <h2>Booking request received</h2>
          <p>
            Your reference: <span className="request-number">{createdNumber}</span>
          </p>
          <p className="muted" style={{ maxWidth: "46ch", margin: "0 auto" }}>
            A Chrisviscus engineer will review the window and site details,
            then confirm scheduling and pricing. Track progress under your
            account — this is a SERVICE request, kept separate from store
            orders.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn" href="/account/service-requests">
              View my service requests
            </Link>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                reset();
                setStep(0);
              }}
            >
              Start another request
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <ol className="wizard__steps" aria-label="Booking steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className="wizard__step"
            aria-current={index === step ? "step" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <div
        className={`wizard__panel surface-card${
          step === 3 ? " wizard__panel--review" : ""
        }`}
      >
        {step === 0 ? (
          <ServiceStep services={props.services} draft={draft} update={update} />
        ) : null}
        {step === 1 ? <ScheduleStep draft={draft} update={update} /> : null}
        {step === 2 ? <AddressStep draft={draft} update={update} /> : null}
        {step === 3 ? (
          <div className="stack">
            <h2 style={{ margin: 0 }} className="page-title">
              Review &amp; submit
            </h2>
            <BookingSummary service={selectedService} />
            <p className="muted" style={{ fontSize: ".84rem", margin: 0 }}>
              Submitting creates a service request (status: requested). No
              payment is taken here; if a deposit is ever required it will be
              quoted separately by staff — never as a fake store order.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="banner banner--error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="wizard__nav">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const blocker = validationBlocker();
                if (blocker) {
                  setError(blocker);
                  return;
                }
                setError(undefined);
                setStep((s) => s + 1);
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={submitting || authLoading || !user}
              onClick={() => void submit()}
            >
              {submitting ? (
                <>
                  <BrandLoader variant="inline" label="" />
                  Submitting…
                </>
              ) : (
                "Submit booking request"
              )}
            </button>
          )}
        </div>
        {!user && !authLoading ? (
          <p className="muted" style={{ fontSize: ".83rem", margin: 0 }}>
            You will be asked to sign in before submitting.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ServiceStep(props: {
  services: ServiceVM[];
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="page-title" style={{ fontSize: "1.05rem" }}>
        Which service do you need?
      </legend>
      <div className="stack">
        {props.services.map((service) => (
          <label
            key={service.id}
            className="row"
            style={{
              justifyContent: "space-between",
              border: "1px solid var(--border-subtle)",
              borderRadius: ".6rem",
              padding: ".6rem .75rem",
            }}
          >
            <span className="row" style={{ gap: ".55rem" }}>
              <input
                type="radio"
                name="booking-service"
                checked={props.draft.serviceId === service.id}
                onChange={() =>
                  props.update({
                    serviceId: service.id,
                    serviceSlug: service.slug,
                    serviceName: service.name,
                  })
                }
              />
              <span>
                <strong>{service.name}</strong>
                <br />
                <span className="muted" style={{ fontSize: ".8rem" }}>
                  {service.durationMinutes
                    ? `≈ ${service.durationMinutes} min on site · `
                    : ""}
                  from {formatMinorMoney(service.basePriceMinor, "NGN")}
                </span>
              </span>
            </span>
            <span className="chip">Booking</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ScheduleStep(props: {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const start = props.draft.requestedStartAt;
  const end = props.draft.requestedEndAt;

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }} className="page-title">
        Requested window
      </h2>
      <p className="muted" style={{ margin: 0, fontSize: ".85rem" }}>
        This is a request, not a confirmed slot — staff finalize the schedule
        after review.
      </p>
      <div className="field">
        <label htmlFor="window-picker">Requested window</label>
        {/* One branded modal owns BOTH ends: day → start hour → AM/PM →
            optional end hour → OK. Only OK writes the draft store, and the
            wizard-level guards (future-only, end>start) also re-run there. */}
        <button
          type="button"
          id="window-picker"
          className="btn btn--secondary"
          style={{ justifyContent: "space-between", width: "100%" }}
          onClick={() => setPickerOpen(true)}
        >
          {start ? (
            <span className="dtm__trigger-value">
              {formatWhen(start)}
              {end ? ` → ${formatWhen(end)}` : ""}
            </span>
          ) : (
            <span className="dtm__trigger-hint">
              Choose date &amp; time… (no window = flexible)
            </span>
          )}
          <span aria-hidden="true">▾</span>
        </button>
        {start || end ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              props.update({ requestedStartAt: undefined, requestedEndAt: undefined })
            }
          >
            Clear window
          </button>
        ) : null}
      </div>

      <DateTimePickerModal
        open={pickerOpen}
        value={start}
        endValue={end}
        onCommit={(startIso, endIso) =>
          props.update({
            requestedStartAt: startIso,
            // Turning the end-time switch off in the modal must clear any
            // previously committed end, or a stale window end would linger.
            requestedEndAt: endIso,
          })
        }
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function AddressStep(props: {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
}) {
  const addr: SiteAddress = props.draft.siteAddress ?? {
    country: "NG",
    state: "Lagos",
    city: "",
    addressLine1: "",
  };
  const setAddr = (patch: Partial<SiteAddress>) =>
    props.update({ siteAddress: { ...addr, ...patch } });

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }} className="page-title">
        Site address &amp; job notes
      </h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="site-state">State</label>
          <select
            id="site-state"
            value={addr.state}
            onChange={(e) => setAddr({ state: e.target.value })}
          >
            {NG_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="site-city">City / LGA</label>
          <input
            id="site-city"
            value={addr.city}
            onChange={(e) => setAddr({ city: e.target.value })}
          />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label htmlFor="site-line1">Street address</label>
          <input
            id="site-line1"
            value={addr.addressLine1}
            onChange={(e) => setAddr({ addressLine1: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="site-notes">Job notes (optional, ≤ 4000 chars)</label>
        <textarea
          id="site-notes"
          rows={4}
          maxLength={4000}
          value={props.draft.notes ?? ""}
          onChange={(e) => props.update({ notes: e.target.value })}
          placeholder="Site access, existing infrastructure, scope expectations…"
        />
      </div>
    </div>
  );
}

