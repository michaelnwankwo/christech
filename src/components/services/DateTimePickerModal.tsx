"use client";

// src/components/services/DateTimePickerModal.tsx
// Booking WINDOW picker: both ends of the requested window are chosen here,
// each with its own DATE and TIME. One calendar + slot grid, aimed at either
// end via the Start / End tabs:
//   Start tab → tap day, pick hour, AM/PM   → sets the window start
//   End tab   → same controls               → sets the window end
// The End Date defaults to the Start Date the moment the end is switched on
// (and keeps following the start day until the user overrides it — see the
// "inherit while untouched" branch in pickDay), but stays fully editable via
// the calendar. OK (primary, bottom-right) validates and commits BOTH ends
// to the draft store, then dismisses; Cancel / Escape / scrim dismiss WITHOUT
// saving. Same-day end times before the start (or a wholly past window) are
// rejected in-modal.

import { useEffect, useMemo, useState } from "react";

const SLOT_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
type Target = "start" | "end";

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

function to12(h24: number): { hour12: number; pm: boolean } {
  return { hour12: h24 % 12 === 0 ? 12 : (h24 % 12), pm: h24 >= 12 };
}

function from12(hour12: number, pm: boolean): number {
  return (hour12 % 12) + (pm ? 12 : 0);
}

const fmtDateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
});
const fmtMonth = new Intl.DateTimeFormat("en-NG", {
  month: "long",
  year: "numeric",
});

export function DateTimePickerModal(props: {
  open: boolean;
  /** Existing ISO values to prefill from, if any. */
  value?: string;
  endValue?: string;
  onCommit: (startIso: string, endIso?: string) => void;
  onClose: () => void;
}) {
  const { open, value, endValue, onCommit, onClose } = props;

  const parsed = useMemo(
    () => ({
      start: (() => {
        const d = value ? new Date(value) : null;
        return d && !Number.isNaN(d.getTime()) ? d : null;
      })(),
      end: (() => {
        const d = endValue ? new Date(endValue) : null;
        return d && !Number.isNaN(d.getTime()) ? d : null;
      })(),
    }),
    [value, endValue]
  );

  const [target, setTarget] = useState<Target>("start");
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  // A full local Date per end — day-number storage let the visible month
  // silently redefine a selection after navigation (fixed in R19; both ends
  // now need independent days).
  const [startDay, setStartDay] = useState<Date | null>(null);
  const [endDay, setEndDay] = useState<Date | null>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startPm, setStartPm] = useState(false);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endPm, setEndPm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the committed draft values every time the modal opens.
  useEffect(() => {
    if (!open) return;
    const base = parsed.start ?? new Date();
    setTarget("start");
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    if (parsed.start) {
      setStartDay(startOfDay(parsed.start));
      const t = to12(parsed.start.getHours());
      setStartHour(t.hour12);
      setStartPm(t.pm);
    } else {
      setStartDay(null);
      setStartHour(null);
      setStartPm(false);
    }
    if (parsed.end) {
      setEndDay(startOfDay(parsed.end));
      const t = to12(parsed.end.getHours());
      setEndHour(t.hour12);
      setEndPm(t.pm);
    } else {
      setEndDay(null);
      setEndHour(null);
      setEndPm(false);
    }
    setError(null);
  }, [open, parsed]);

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
  const activeDay = target === "start" ? startDay : endDay;
  const activeHour = target === "start" ? startHour : endHour;
  const activePm = target === "start" ? startPm : endPm;

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewYear, viewMonth, i + 1)
    ),
  ];

  const atCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const shiftMonth = (delta: number) => {
    if (delta < 0 && atCurrentMonth) return; // never page before today's month
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const focusTarget = (t: Target) => {
    setTarget(t);
    const day = t === "start" ? startDay : endDay;
    if (day) {
      setViewYear(day.getFullYear());
      setViewMonth(day.getMonth());
    }
    setError(null);
  };

  const dayFloor =
    target === "end" && startDay && startDay > today ? startDay : today;

  function pickDay(date: Date) {
    if (target === "start") {
      const previous = startDay;
      setStartDay(date);
      // End date DEFAULTS to the start date: while the user has never moved
      // it off the start day, it keeps following; once overridden it stays.
      if (
        endDay &&
        (!previous || sameDay(endDay, previous) || sameDay(endDay, date))
      ) {
        setEndDay(date);
      }
    } else {
      setEndDay(date);
    }
    setError(null);
  }

  function setActiveHour(h: number) {
    if (target === "start") setStartHour(h);
    else setEndHour(h);
    setError(null);
  }

  function setActivePm(pm: boolean) {
    if (target === "start") setStartPm(pm);
    else setEndPm(pm);
  }

  function toggleEnd() {
    if (endDay) {
      // Off: wipe the whole end so a stale window end can't linger.
      setEndDay(null);
      setEndHour(null);
      setEndPm(false);
      setTarget("start");
    } else {
      const nextDay = startDay ?? today;
      setEndDay(nextDay);
      if (startHour !== null) {
        // Sensible default: start + 1h on the same day.
        const h24 = (from12(startHour, startPm) + 1) % 24;
        const t = to12(h24);
        setEndHour(t.hour12);
        setEndPm(t.pm);
      }
      setViewYear(nextDay.getFullYear());
      setViewMonth(nextDay.getMonth());
      setTarget("end");
    }
    setError(null);
  }

  function confirm() {
    if (!startDay || startHour === null) {
      setError("Pick a start date and hour first.");
      return;
    }
    const startDate = new Date(
      startDay.getFullYear(),
      startDay.getMonth(),
      startDay.getDate(),
      from12(startHour, startPm),
      0,
      0
    );
    if (startDate.getTime() < Date.now()) {
      setError("The requested start must be in the future.");
      return;
    }
    let endDate: Date | undefined;
    if (endDay) {
      if (endHour === null) {
        setError("Pick an end hour — or switch the end off.");
        return;
      }
      endDate = new Date(
        endDay.getFullYear(),
        endDay.getMonth(),
        endDay.getDate(),
        from12(endHour, endPm),
        0,
        0
      );
      if (endDate.getTime() <= startDate.getTime()) {
        setError("The end must be after the start.");
        return;
      }
    }
    onCommit(startDate.toISOString(), endDate?.toISOString());
    onClose();
  }

  const preview = (day: Date | null, hour: number | null, pm: boolean) =>
    day && hour !== null
      ? fmtDateTime.format(
          new Date(
            day.getFullYear(),
            day.getMonth(),
            day.getDate(),
            from12(hour, pm)
          )
        )
      : "—";

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
              {fmtMonth.format(new Date(viewYear, viewMonth, 1))}
            </strong>
            <span className="dtm__navbtns">
              <button
                type="button"
                className="dtm__navbtn"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                disabled={atCurrentMonth}
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

          {/* Tabs decide WHICH end the calendar + slots below edit. */}
          <div className="dtm__tabs" role="tablist" aria-label="Edit window start or end">
            <button
              type="button"
              role="tab"
              className="dtm__tab"
              aria-selected={target === "start"}
              onClick={() => focusTarget("start")}
            >
              Start date &amp; time
            </button>
            <button
              type="button"
              role="tab"
              className="dtm__tab"
              aria-selected={target === "end"}
              disabled={!endDay}
              onClick={() => focusTarget("end")}
            >
              End date &amp; time
            </button>
            <button
              type="button"
              className="dtm__toggle"
              role="switch"
              aria-checked={!!endDay}
              onClick={toggleEnd}
            >
              {endDay ? "End: on" : "End: off"}
            </button>
          </div>

          <p className="dtm__preview">
            <span>
              <b>Start</b> {preview(startDay, startHour, startPm)}
            </span>
            <span aria-hidden="true">→</span>
            <span>
              <b>End</b>{" "}
              {endDay ? preview(endDay, endHour, endPm) : "flexible"}
            </span>
          </p>

          <div className="dtm__dow" aria-hidden="true">
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="dtm__days"
            role="grid"
            aria-label={`Choose ${target} date`}
          >
            {cells.map((date, i) =>
              date === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  type="button"
                  key={date.toISOString()}
                  className="dtm__day"
                  role="gridcell"
                  aria-pressed={activeDay ? sameDay(activeDay, date) : false}
                  aria-label={new Intl.DateTimeFormat("en-NG", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(date)}
                  disabled={date < dayFloor}
                  onClick={() => pickDay(date)}
                >
                  {date.getDate()}
                </button>
              )
            )}
          </div>

          <span className="dtm__section-label">
            {target === "start" ? "Start time" : "End time"} · {fmtMonth.format(new Date(viewYear, viewMonth, 1))}
          </span>
          <div
            className="dtm__slots"
            role="group"
            aria-label={`${target} hour of day`}
          >
            {SLOT_HOURS.map((h) => (
              <button
                type="button"
                key={`${target}-${h}`}
                className="dtm__slot"
                aria-pressed={activeHour === h}
                onClick={() => setActiveHour(h)}
              >
                {h}:00
              </button>
            ))}
          </div>
          <div className="dtm__ampm" role="group" aria-label={`${target} AM or PM`}>
            <button
              type="button"
              aria-pressed={!activePm}
              onClick={() => setActivePm(false)}
            >
              AM
            </button>
            <button
              type="button"
              aria-pressed={activePm}
              onClick={() => setActivePm(true)}
            >
              PM
            </button>
          </div>

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
            {/* Primary confirm — full-size (44px mobile floor via .btn),
                bottom-right, saves BOTH ends of the window in one commit. */}
            <button
              type="button"
              className="btn dtm__ok"
              onClick={confirm}
              disabled={!startDay || startHour === null}
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
