"use client";

// src/components/services/ServiceQuoteButton.tsx
// Client island that turns any (server-rendered) service surface into a
// Quote-on-Demand trigger: the button opens the booking modal instead of
// navigating to /booking, so guests never hit a sign-in wall and the
// request goes straight to WhatsApp after the Supabase audit record.

import { useState } from "react";
import type { ServiceVM } from "@/types/catalog";
import { QuoteRequestModal } from "./QuoteRequestModal";

export function ServiceQuoteButton(props: {
  service: ServiceVM;
  label?: string;
  className?: string;
}) {
  const { service, label = "Get quote via WhatsApp", className = "btn" } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <QuoteRequestModal
        service={service}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
