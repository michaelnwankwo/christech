"use client";

// src/components/checkout/PaystackButton.tsx
// Blueprint §14.2 — with three Draft-2 corrections:
//   1. the callback triggers /api/payments/verify and only THEN navigates to
//      the order page showing DATABASE state (the old draft navigated with
//      "processing" without awaiting the verify round-trip);
//   2. an idempotency key is generated per checkout attempt and sent to
//      initialize (§18.4); a reload of the same attempt reuses the order;
//   3. user-visible error state instead of console.error-only failures.
// Amount + currency + reference all come from the SERVER's initialize
// response — the browser never decides the charge (§2.5).

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import type { QuoteResponse, ShippingAddress } from "@/types/checkout";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        metadata?: Record<string, unknown>;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => {
        openIframe: () => void;
      };
    };
  }
}

export function PaystackButton(props: {
  email: string;
  quote: QuoteResponse;
  shippingAddress: ShippingAddress;
  /** Demo quotes cannot be paid — renders a disabled, explained button. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per checkout ATTEMPT (stable across retries of the
  // same attempt; a cart/address change re-quotes with a new attempt).
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function startPayment() {
    setLoading(true);
    setError(null);

    try {
      const { quote, shippingAddress } = props;

      const response = await fetch("/api/checkout/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          idempotencyKey: idempotencyKey.current,
          lines: useCartStore.getState().toCheckoutPayload(),
          shippingAddress,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          issues?: string[];
        } | null;
        throw new Error(
          payload?.issues?.[0] ??
            payload?.error ??
            "Checkout initialization failed — please re-quote"
        );
      }

      const session = (await response.json()) as {
        orderId: string;
        paymentReference: string;
        displayCurrency: string;
        chargeCurrency: string;
        amountMinor: number;
        publicKey: string;
      };

      if (!window.PaystackPop) {
        throw new Error("Paystack has not loaded — check your connection");
      }

      const handler = window.PaystackPop.setup({
        key: session.publicKey,
        email: props.email,
        amount: session.amountMinor,
        currency: session.chargeCurrency,
        ref: session.paymentReference,
        metadata: {
          order_id: session.orderId,
          display_currency: session.displayCurrency,
        },
        callback: (paystackResponse) => {
          // The callback is a UX signal — await server verification and
          // navigate with the DB-confirmed order id only (§2.5).
          void (async () => {
            try {
              await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: session.orderId,
                  reference: paystackResponse.reference,
                }),
              });
            } finally {
              // The webhook remains the durable path either way.
              useCartStore.getState().clearCart();
              router.replace(`/account/orders/${session.orderId}`);
            }
          })();
        },
        onClose: () => setLoading(false),
      });

      handler.openIframe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not start");
      setLoading(false);
    }
  }

  return (
    <>
      {!props.disabled ? (
        <Script
          src="https://js.paystack.co/v1/inline.js"
          strategy="afterInteractive"
        />
      ) : null}
      <div className="stack" style={{ gap: ".45rem" }}>
        <button
          type="button"
          className="btn"
          disabled={loading || props.disabled}
          onClick={() => void startPayment()}
        >
          {props.disabled
            ? "Payments disabled (demo mode)"
            : loading
              ? "Preparing payment…"
              : "Pay securely with Paystack"}
        </button>
        <span className="paystack-badge">
          Paystack inline · amount locked server-side
        </span>
        {error ? (
          <p className="banner banner--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
