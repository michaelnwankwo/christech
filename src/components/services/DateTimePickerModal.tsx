"use client";

// src/components/services/DateTimePickerModal.tsx
// Booking window picker: BOTH ends of the requested window are chosen here.
// Selection model:
//   tap a day → pick start hour + AM/PM → optionally pick an end hour +
//   AM/PM → "OK" commits start (and end, when set) to the draft store and
//   dismisses. Cancel / Escape / scrim dismiss WITHOUT saving — nothing
//   flows into the booking until OK. The end time follows the selected day
//   (same-day windows; multi-day jobs are staff-scheduled anyway), and OK
//   enforces end > start before saving.
// Validation (must be today-or-later) runs at OK time, surfaced in-modal,
// mirroring the wizard's own "window must be in the future" guard.

import { useEffect, useMemo, useState } from "react";

const SLOT_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DateTimePickerModal(props: {
  open: boolean;
  /** Existing ISO values to prefill from, if any. */
  value?: string;
  endValue?: string;
  onCommit: (startIso: string, endIso?: string) => void;
  onClose: () => void;
}) {
  const { open, value, endValue, onCommit, onClose } = props;

  const initial = useMemo(() => {
    const parsed = value ? new Date(value) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    return valid;
  }, [value]);

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  // A full Date (local, time zeroed) — storing only a day number would let
  // the visible month silently redefine the selection after navigation.
  const [selected, setSelected] = useState<Date | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [pm, setPm] = useState(false);
  // Optional end of the window — same day as the selected start.
  const [endSet, setEndSet] = useState(false);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endPm, setEndPm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the committed draft values every time the modal opens.
  useEffect(() => {
    if (!open) return;
    const base = initial ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    if (initial) {
      setSelected(startOfDay(initial));
      const h24 = initial.getHours();
      setPm(h24 >= 12);
      setHour(h24 % 12 === 0 ? 12 : h24 % 12);
    } else {
      setSelected(null);
      setHour(null);
      setPm(false);
    }
    const endParsed = endValue ? new Date(endValue) : null;
    const end = endParsed && !Number.isNaN(endParsed.getTime()) ? endParsed : null;
    setEndSet(!!end);
    if (end) {
      const e24 = end.getHours();
      setEndPm(e24 >= 12);
      setEndHour(e24 % 12 === 0 ? 12 : e24 % 12);
    } else {
      setEndHour(null);
      setEndPm(false);
    }
    setError(null);
  }, [open, initial, endValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const today = startOfDay(new Date());
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewYear, viewMonth, i + 1)
    ),
  ];

  const shiftMonth = (delta: number) => {
    const atCurrentMonth =
      viewYear === today.getFullYear() && viewMonth === today.getMonth();
    if (delta < 0 && atCurrentMonth) return; // never page before today's month
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  function confirm() {
    if (!selected || hour === null) {
      setError("Pick a date and an hour first.");
      return;
    }
    const h24 = (hour % 12) + (pm ? 12 : 0);
    const picked = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      h24,
      0,
      0
    );
    if (picked.getTime() < Date.now()) {
      setError("The requested time must be in the future.");
      return;
    }
    let endPicked: Date | undefined;
    if (endSet) {
      if (endHour === null) {
        setError("Pick an end hour — or turn the end time off.");
        return;
      }
      const e24 = (endHour % 12) + (endPm ? 12 : 0);
      endPicked = new Date(
        picked.getFullYear(),
        picked.getMonth(),
        picked.getDate(),
        e24,
        0,
        0
      );
      if (endPicked.getTime() <= picked.getTime()) {
        setError("The end time must be after the start time.");
        return;
      }
    }
    onCommit(picked.toISOString(), endPicked?.toISOString());
    onClose();
  }

  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
  }).format(new Date(viewYear, viewMonth, 1));
  const atFirstMonthOfToday =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  return (
    <>
      <button
        type="button"
        className="dtm-scrim"
        aria-label="Close date and time picker"
        onClick={onClose}
      />
      <div className="dtm">
        <div
          className="dtm__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dtm-title"
        >
          <div className="dtm__head">
            <strong id="dtm-title" className="dtm__month">
              {monthLabel}
            </strong>
            <span className="dtm__navbtns">
              <button
                type="button"
                className="dtm__navbtn"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                disabled={atFirstMonthOfToday}
              >
                ‹
              </button>
              <button
                type="button"
                className="dtm__navbtn"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
            </span>
          </div>

          <div className="dtm__dow" aria-hidden="true">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="dtm__days" role="grid" aria-label="Choose a date">
            {cells.map((date, i) =>
              date === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  type="button"
                  key={date.toISOString()}
                  className="dtm__day"
                  role="gridcell"
                  aria-pressed={selected ? sameDay(selected, date) : false}
                  aria-label={new Intl.DateTimeFormat("en-NG", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(date)}
                  disabled={date < today}
                  onClick={() => {
                    setSelected(date);
                    setError(null);
                  }}
                >
                  {date.getDate()}
                </button>
              )
            )}
          </div>

          <span className="dtm__section-label">Time</span>
          <div className="dtm__slots" role="group" aria-label="Hour of day">
            {SLOT_HOURS.map((h) => (
              <button
                type="button"
                key={h}
                className="dtm__slot"
                aria-pressed={hour === h}
                onClick={() => {
                  setHour(h);
                  setError(null);
                }}
              >
                {h}:00
              </button>
            ))}
          </div>
          <div className="dtm__ampm" role="group" aria-label="AM or PM">
            <button
              type="button"
              aria-pressed={!pm}
              onClick={() => setPm(false)}
            >
              AM
            </button>
            <button
              type="button"
              aria-pressed={pm}
              onClick={() => setPm(true)}
            >
              PM
            </button>
          </div>

          <div className="dtm__endrow">
            <span className="dtm__section-label">End time (optional)</span>
            <button
              type="button"
              className="dtm__toggle"
              role="switch"
              aria-checked={endSet}
              onClick={() => {
                setEndSet((on) => {
                  if (!on && endHour === null) {
                    // Sensible default when first switched on: start + 1 h.
                    const base = (hour ?? 9 % 12) + 1;
                    setEndHour(((base % 12) + 12) % 12 || 12);
                    setEndPm(pm);
                  }
                  return !on;
                });
                setError(null);
              }}
            >
              {endSet ? "On" : "Off"}
            </button>
          </div>
          {endSet ? (
            <>
              <div
                className="dtm__slots"
                role="group"
                aria-label="End hour of day"
              >
                {SLOT_HOURS.map((h) => (
                  <button
                    type="button"
                    key={`end-${h}`}
                    className="dtm__slot"
                    aria-pressed={endHour === h}
                    onClick={() => {
                      setEndHour(h);
                      setError(null);
                    }}
                  >
                    {h}:00
                  </button>
                ))}
              </div>
              <div className="dtm__ampm" role="group" aria-label="End AM or PM">
                <button
                  type="button"
                  aria-pressed={!endPm}
                  onClick={() => setEndPm(false)}
                >
                  AM
                </button>
                <button
                  type="button"
                  aria-pressed={endPm}
                  onClick={() => setEndPm(true)}
                >
                  PM
                </button>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="dtm__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="dtm__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onClose}
            >
              Cancel
            </button>
            {/* Primary confirm — full-size (48px floor via mobile .btn rule),
                bottom-right, saves BOTH ends of the window in one commit. */}
            <button
              type="button"
              className="btn dtm__ok"
              onClick={confirm}
              disabled={!selected || hour === null}
              aria-label="Confirm date and time"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
