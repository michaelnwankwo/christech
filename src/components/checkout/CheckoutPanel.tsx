"use client";

// src/components/checkout/CheckoutPanel.tsx
// The checkout right-hand column: address form → server quote (with live
// expiry countdown + charge-currency disclosure) → Paystack inline button.
// Every figure shown here originates from the /api/checkout/quote response —
// the client never renders a price it computed itself for payment purposes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cart-store";
import { useSession } from "@/components/providers/Providers";
import { ShippingAddressForm } from "./AddressForm";
import { PaystackButton } from "./PaystackButton";
import { formatMinorMoney } from "@/lib/currency/money";
import { zoneLabelForPreview } from "@/lib/shipping/zones";
import type { QuoteResponse } from "@/types/checkout";
import type { ShippingAddress } from "@/types/checkout";

export function CheckoutPanel() {
  const router = useRouter();
  const { user, loading: authLoading } = useSession();

  const lines = useCartStore((s) => s.lines);
  const displayCurrency = useCartStore((s) => s.displayCurrency);
  const quote = useCartStore((s) => s.quote);
  const quoteError = useCartStore((s) => s.quoteError);
  const requestQuote = useCartStore((s) => s.requestQuote);

  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCart = lines.length > 0;

  const runQuote = useCallback(
    async (next: ShippingAddress) => {
      setQuoting(true);
      await requestQuote(next);
      setQuoting(false);
    },
    [requestQuote]
  );

  // Auto re-quote shortly before expiry so the customer is never clicked
  // onto a dead quote (initialize would reject it server-side anyway).
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!quote) return;
    const msLeft = Date.parse(quote.expiresAt) - Date.now();
    const refreshIn = Math.max(15_000, msLeft - 45_000);
    if (msLeft <= 0) {
      if (address) void runQuote(address);
      return;
    }
    quoteTimer.current = setTimeout(() => {
      if (address) void runQuote(address);
    }, refreshIn);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [quote, address, runQuote]);

  const secondsLeft = useMemo(() => {
    if (!quote) return null;
    return Math.max(
      0,
      Math.floor((Date.parse(quote.expiresAt) - Date.now()) / 1000)
    );
  }, [quote]);

  // Tick every second while a quote is live (drives the countdown text).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!quote) return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [quote]);

  if (authLoading) return <div className="checkout-panel surface-card">Checking session…</div>;

  if (!user) {
    return (
      <div className="checkout-panel surface-card">
        <h2>Sign in to check out</h2>
        <p className="muted">
          Checkout and bookings require an account so orders stay private
          (row-level security enforces this end to end).
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => router.push("/login?next=/checkout")}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!hasCart) {
    return (
      <div className="checkout-panel surface-card">
        <h2>Your cart is empty</h2>
        <p className="muted">
          Add a product to begin. Service bookings do not use this page —
          they live in Book a service.
        </p>
        <button type="button" className="btn" onClick={() => router.push("/products")}>
          Browse products
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-panel surface-card">
      <h2 style={{ margin: 0 }}>Delivery address</h2>
      <ShippingAddressForm
        initial={address ?? undefined}
        onSubmit={(next) => {
          setAddress(next);
          void runQuote(next);
        }}
        busy={quoting}
      />

      {address ? (
        <p className="muted" style={{ margin: 0, fontSize: ".83rem" }}>
          Shipping zone: <strong>{zoneLabelForPreview(address)}</strong>
        </p>
      ) : null}

      {quoteError ? (
        <p className="banner banner--error" role="alert">
          {quoteError}
        </p>
      ) : null}

      {quote ? (
        <div className="stack" style={{ gap: ".35rem" }}>
          <h3 style={{ margin: ".2rem 0 0" }}>Server quote</h3>
          <div className="quote-line">
            <span>Subtotal</span>
            <span className="mono">
              {formatMinorMoney(quote.subtotalDisplayMinor, quote.displayCurrency)}
            </span>
          </div>
          <div className="quote-line">
            <span>Shipping</span>
            <span className="mono">
              {formatMinorMoney(quote.shippingDisplayMinor, quote.displayCurrency)}
            </span>
          </div>
          <div className="quote-line quote-line--grand">
            <span>Total ({quote.displayCurrency})</span>
            <span className="mono">
              {formatMinorMoney(quote.totalDisplayMinor, quote.displayCurrency)}
            </span>
          </div>
          <p className="banner banner--info" style={{ margin: ".3rem 0" }}>
            {quote.conversionDisclosure} You will see the {quote.chargeCurrency}
            &nbsp;amount inside Paystack.
          </p>
          <p className="quote-countdown" aria-live="polite">
            Quote expires in {formatDuration(secondsLeft ?? 0)} — totals are
            locked server-side until then.
          </p>

          {quote.demo ? (
            <p className="banner banner--info" role="status">
              Demo quote — totals come from the offline catalog copy. Payment
              is disabled while the database is unreachable, so nothing is
              charged or persisted.
            </p>
          ) : null}

          <PaystackButton
            email={user.email ?? ""}
            quote={quote}
            shippingAddress={address!}
            disabled={quote.demo === true}
          />
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Submit the address to receive a shipping &amp; currency quote from
          the server.
        </p>
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
