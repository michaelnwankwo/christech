"use client";

// src/components/checkout/AddressForm.tsx
// Client-side required-field validation ONLY for UX; the zod schema at
// /api/checkout/quote is what actually decides (§3.3).

import { useState } from "react";
import type { ShippingAddress } from "@/types/checkout";

const NG_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","FCT","Enugu","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba",
  "Yobe","Zamfara",
];

export function ShippingAddressForm(props: {
  initial?: ShippingAddress;
  onSubmit: (address: ShippingAddress) => void;
  busy: boolean;
}) {
  const [values, setValues] = useState<ShippingAddress>(
    props.initial ?? {
      country: "NG",
      state: "Lagos",
      city: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ShippingAddress>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (values.state.trim().length < 2) nextErrors.state = "Select a state";
    if (values.city.trim().length < 2) nextErrors.city = "City is required";
    if (values.addressLine1.trim().length < 5)
      nextErrors.addressLine1 = "Street address is required";
    if (!/^[A-Za-z]{2}$/.test(values.country.trim()))
      nextErrors.country = "Use a 2-letter country code (e.g. NG)";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      props.onSubmit({
        ...values,
        addressLine2: values.addressLine2?.trim() || undefined,
        postalCode: values.postalCode?.trim() || undefined,
      });
    }
  }

  return (
    <form onSubmit={submit} className="form-grid" aria-label="Shipping address">
      <div className="field">
        <label htmlFor="country">Country code</label>
        <input
          id="country"
          value={values.country}
          onChange={(e) => set("country", e.target.value.toUpperCase())}
          maxLength={2}
          aria-invalid={Boolean(errors.country)}
          required
        />
        {errors.country ? <span className="field__error">{errors.country}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="state">State</label>
        <select
          id="state"
          value={values.state}
          onChange={(e) => set("state", e.target.value)}
          aria-invalid={Boolean(errors.state)}
        >
          {NG_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.state ? <span className="field__error">{errors.state}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="city">City / LGA</label>
        <input
          id="city"
          value={values.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder="e.g. Ikeja, Lekki Phase 1"
          aria-invalid={Boolean(errors.city)}
          required
        />
        {errors.city ? <span className="field__error">{errors.city}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="postal">Postal code (optional)</label>
        <input
          id="postal"
          value={values.postalCode ?? ""}
          onChange={(e) => set("postalCode", e.target.value)}
          maxLength={16}
        />
      </div>

      <div className="field span-2">
        <label htmlFor="line1">Address line 1</label>
        <input
          id="line1"
          value={values.addressLine1}
          onChange={(e) => set("addressLine1", e.target.value)}
          placeholder="Street, number, area"
          aria-invalid={Boolean(errors.addressLine1)}
          required
        />
        {errors.addressLine1 ? (
          <span className="field__error">{errors.addressLine1}</span>
        ) : null}
      </div>

      <div className="field span-2">
        <label htmlFor="line2">Address line 2 (optional)</label>
        <input
          id="line2"
          value={values.addressLine2 ?? ""}
          onChange={(e) => set("addressLine2", e.target.value)}
          maxLength={240}
        />
      </div>

      <div className="span-2">
        <button type="submit" className="btn" disabled={props.busy}>
          {props.busy ? "Calculating quote…" : "Get shipping & currency quote"}
        </button>
      </div>
    </form>
  );
}
