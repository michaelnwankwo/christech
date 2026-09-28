"use client";

// Server-initialized Paystack checkout:
//   1. /api/checkout/initialize atomically creates/reuses the order and asks
//      Paystack for an access code using the secret key;
//   2. InlineJS V2 resumes that server-created transaction;
//   3. if the iframe script is unavailable or does not load promptly, the
//      browser navigates to Paystack's validated hosted authorization URL;
//   4. success is verified server-side; the webhook remains the durable path.

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import type {
  CheckoutInitResponse,
  QuoteResponse,
  ShippingAddress,
} from "@/types/checkout";

type PaystackSuccess = { reference: string };
type PaystackError = { message?: string };
type PaystackCallbacks = {
  onLoad: () => void;
  onSuccess: (response: PaystackSuccess) => void;
  onCancel: () => void;
  onError: (error: PaystackError) => void;
};

type PaystackInline = {
  resumeTransaction: (
    accessCode: string,
    callbacks: PaystackCallbacks
  ) => unknown;
  cancelTransaction?: (transaction: unknown) => void;
};

declare global {
  interface Window {
    PaystackPop?: new () => PaystackInline;
  }
}

const PREPARE_TIMEOUT_MS = 15_000;
const POPUP_LOAD_TIMEOUT_MS = 10_000;

export function PaystackButton(props: {
  quote: QuoteResponse;
  shippingAddress: ShippingAddress;
  /** Demo quotes cannot be paid — renders a disabled, explained button. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptFailed, setScriptFailed] = useState(false);
  const popupTimer = useRef<number | null>(null);
  // Stable across retries so create_order_from_quote and provider-session
  // persistence can safely replay the same checkout attempt.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  useEffect(
    () => () => {
      if (popupTimer.current !== null) window.clearTimeout(popupTimer.current);
    },
    []
  );

  function clearPopupTimer() {
    if (popupTimer.current !== null) {
      window.clearTimeout(popupTimer.current);
      popupTimer.current = null;
    }
  }

  async function startPayment() {
    if (loading || props.disabled) return;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const prepareTimer = window.setTimeout(
      () => controller.abort(),
      PREPARE_TIMEOUT_MS
    );

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
        signal: controller.signal,
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

      const session = parseCheckoutSession(await response.json());
      const Paystack = window.PaystackPop;

      // Hosted checkout is the deliberate fallback for mobile browsers,
      // content blockers, slow CDN loads, and any InlineJS bootstrap failure.
      if (!Paystack || scriptFailed) {
        redirectToHostedCheckout(session.authorizationUrl);
        return;
      }

      const popup = new Paystack();
      let transaction: unknown;
      const fallbackToHostedCheckout = () => {
        clearPopupTimer();
        try {
          popup.cancelTransaction?.(transaction);
        } catch {
          // Redirect remains safe even if the SDK cannot cancel its iframe.
        }
        redirectToHostedCheckout(session.authorizationUrl);
      };

      popupTimer.current = window.setTimeout(
        fallbackToHostedCheckout,
        POPUP_LOAD_TIMEOUT_MS
      );

      try {
        transaction = popup.resumeTransaction(session.accessCode, {
          onLoad: clearPopupTimer,
          onCancel: () => {
            clearPopupTimer();
            setLoading(false);
          },
          onError: fallbackToHostedCheckout,
          onSuccess: (paystackResponse) => {
            clearPopupTimer();
            void finishPayment(session, paystackResponse.reference);
          },
        });
      } catch {
        fallbackToHostedCheckout();
      }
    } catch (err) {
      setError(
        controller.signal.aborted
          ? "Payment preparation timed out — please retry"
          : err instanceof Error
            ? err.message
            : "Payment could not start"
      );
      setLoading(false);
    } finally {
      window.clearTimeout(prepareTimer);
    }
  }

  async function finishPayment(
    session: CheckoutInitResponse,
    paystackReference: string
  ) {
    try {
      await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: session.orderId,
          reference: paystackReference,
        }),
      });
    } finally {
      // The signed webhook remains the durable path if the recovery request
      // fails or the customer navigates before it finishes.
      useCartStore.getState().clearCart();
      router.replace(`/account/orders/${session.orderId}`);
    }
  }

  return (
    <>
      {!props.disabled ? (
        <Script
          id="paystack-inline-v2"
          src="https://js.paystack.co/v2/inline.js"
          strategy="afterInteractive"
          onLoad={() => setScriptFailed(false)}
          onError={() => setScriptFailed(true)}
        />
      ) : null}
      <div className="stack" style={{ gap: ".45rem" }}>
        <button
          type="button"
          className="btn"
          disabled={loading || props.disabled}
          aria-busy={loading}
          onClick={() => void startPayment()}
        >
          {props.disabled
            ? "Payments disabled (demo mode)"
            : loading
              ? "Opening secure checkout…"
              : "Pay securely with Paystack"}
        </button>
        {error ? (
          <p className="banner banner--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}

function parseCheckoutSession(value: unknown): CheckoutInitResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The payment server returned an invalid response");
  }
  const session = value as Partial<CheckoutInitResponse>;
  if (
    typeof session.orderId !== "string" ||
    typeof session.paymentReference !== "string" ||
    !/^[A-Za-z0-9_.=-]{8,64}$/.test(session.paymentReference) ||
    typeof session.amountMinor !== "number" ||
    !Number.isSafeInteger(session.amountMinor) ||
    session.amountMinor < 1 ||
    (session.chargeCurrency !== "NGN" && session.chargeCurrency !== "USD") ||
    typeof session.accessCode !== "string" ||
    session.accessCode.length < 6 ||
    typeof session.authorizationUrl !== "string"
  ) {
    throw new Error("The payment server returned an incomplete session");
  }

  // Validate before this URL can ever reach window.location.assign().
  const authorization = new URL(session.authorizationUrl);
  if (
    authorization.protocol !== "https:" ||
    !(
      authorization.hostname === "checkout.paystack.com" ||
      authorization.hostname.endsWith(".paystack.com")
    )
  ) {
    throw new Error("The payment server returned an unsafe checkout URL");
  }

  return session as CheckoutInitResponse;
}

function redirectToHostedCheckout(authorizationUrl: string): void {
  window.location.assign(authorizationUrl);
}
