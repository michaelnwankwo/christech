// src/stores/cart-store.ts
// Blueprint §7.3 — the storefront's Zustand cart, persisted locally.
//
// Draft-2 corrections applied to the spec pseudocode (see audit log):
//   * addServiceAddon never THROWS during state updates (a throw inside a
//     store action can surface as a render crash); it returns false and the
//     UI shows the error — the DB guard remains the hard boundary anyway.
//   * quantities clamp to 1..999 (mirrors the zod + DB bounds).
//   * quoteShipping stores `quote` + `quoteError`, keeps the address hash
//     client-side irrelevant (server-owned), and clears BOTH whenever lines
//     or currency change (§21.1 item 7 — stale quotes are impossible by
//     construction: every mutating action nulls the quote).
//   * no secrets, no prices from the network are trusted: prices kept here
//     are DISPLAY SNAPSHOTS only (§2.2); the payload sent to the server
//     (toCheckoutPayload) intentionally contains NO amounts.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type AppMode = "storefront" | "service-booking";

export type CartLine = {
  lineId: string;
  kind: "product" | "service_addon";
  productId?: string;
  serviceId?: string;
  parentLineId?: string;
  name: string;
  sku?: string;
  quantity: number;
  baseUnitMinor: number;
  baseCurrency: "NGN";
  isShippable: boolean;
  shippingClass?: string;
};

export type ServerQuote = {
  quoteId: string;
  displayCurrency: Currency;
  chargeCurrency: Currency;
  subtotalDisplayMinor: number;
  shippingDisplayMinor: number;
  totalDisplayMinor: number;
  totalChargeMinor: number;
  zoneCode: string;
  expiresAt: string;
  conversionDisclosure: string;
  /** true when served by the offline demo fallback (pay step disabled). */
  demo?: boolean;
};

export type CheckoutLinePayload = {
  clientLineId: string;
  kind: CartLine["kind"];
  productId?: string;
  serviceId?: string;
  parentClientLineId?: string;
  quantity: number;
};

const MAX_QTY = 999;
const clampQty = (n: number) =>
  Math.max(1, Math.min(MAX_QTY, Number.isFinite(n) ? Math.trunc(n) : 1));

type CartState = {
  mode: AppMode;
  displayCurrency: Currency;
  lines: CartLine[];
  fxRates: Partial<Record<Currency, number>>;
  quote?: ServerQuote;
  quoteError?: string;

  setMode: (mode: AppMode) => void;
  setDisplayCurrency: (currency: Currency) => void;
  setRates: (rates: Partial<Record<Currency, number>>) => void;

  addProduct: (line: CartLine) => void;
  addServiceAddon: (line: CartLine, parentLineId: string) => boolean;
  /** Server-mirror hydration (src/lib/cart/sync): adopt a full line set. */
  setCartLines: (lines: CartLine[]) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;

  requestQuote: (address: Record<string, unknown>) => Promise<ServerQuote | null>;
  clearQuote: () => void;
  toCheckoutPayload: () => CheckoutLinePayload[];
};

function invalidateQuote(state: CartState) {
  return { quote: undefined, quoteError: undefined };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      mode: "storefront",
      displayCurrency: "NGN",
      lines: [],
      fxRates: { NGN: 1 },

      setMode: (mode) => set({ mode }),

      // Currency changes must invalidate stale shipping quotes (§21.1 #7).
      setDisplayCurrency: (displayCurrency) =>
        set((state) => ({ displayCurrency, ...invalidateQuote(state) })),

      setRates: (fxRates) => set({ fxRates }),

      // Mirror hydration replaces the whole line set; the quote is cleared
      // too (§21.1 #7 — server-sourced lines must never ride an old quote).
      setCartLines: (lines) =>
        set((state) => ({ lines, ...invalidateQuote(state) })),


      addProduct: (line) =>
        set((state) => {
          const quantity = clampQty(line.quantity);
          const existing = state.lines.find(
            (item) =>
              item.kind === "product" && item.productId === line.productId
          );

          if (existing) {
            return {
              lines: state.lines.map((item) =>
                item.lineId === existing.lineId
                  ? { ...item, quantity: clampQty(item.quantity + quantity) }
                  : item
              ),
              ...invalidateQuote(state),
            };
          }

          return {
            lines: [...state.lines, { ...line, quantity }],
            ...invalidateQuote(state),
          };
        }),

      // Returns false instead of throwing when the parent line is missing;
      // the DB (0005) remains the hard boundary that rejects orphans.
      addServiceAddon: (line, parentLineId) => {
        const state = get();
        const parent = state.lines.find(
          (item) => item.lineId === parentLineId && item.kind === "product"
        );

        if (!parent) return false;

        set({
          lines: [
            ...state.lines,
            {
              ...line,
              quantity: clampQty(line.quantity),
              kind: "service_addon",
              parentLineId,
            },
          ],
          ...invalidateQuote(get()),
        });
        return true;
      },

      updateQuantity: (lineId, quantity) => {
        if (quantity < 1) return;
        set((state) => ({
          lines: state.lines.map((line) =>
            line.lineId === lineId
              ? { ...line, quantity: clampQty(quantity) }
              : line
          ),
          ...invalidateQuote(state),
        }));
      },

      // Removing a product removes its child add-on lines transitively (§2.3).
      removeLine: (lineId) =>
        set((state) => {
          const removed = new Set<string>([lineId]);
          let changed = true;

          while (changed) {
            changed = false;
            for (const line of state.lines) {
              if (
                line.parentLineId &&
                removed.has(line.parentLineId) &&
                !removed.has(line.lineId)
              ) {
                removed.add(line.lineId);
                changed = true;
              }
            }
          }

          return {
            lines: state.lines.filter((line) => !removed.has(line.lineId)),
            ...invalidateQuote(state),
          };
        }),

      clearCart: () =>
        set({
          lines: [],
          quote: undefined,
          quoteError: undefined,
        }),

      requestQuote: async (address) => {
        const state = get();

        try {
          const response = await fetch("/api/checkout/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              displayCurrency: state.displayCurrency,
              address,
              lines: state.toCheckoutPayload(),
            }),
          });

          const payload = (await response.json().catch(() => null)) as
            | (ServerQuote & { error?: string; issues?: string[] })
            | null;

          if (!response.ok || !payload || !("quoteId" in payload)) {
            const message =
              payload?.issues?.[0] ??
              payload?.error ??
              "Unable to calculate shipping quote";
            set({ quote: undefined, quoteError: message });
            return null;
          }

          const quote: ServerQuote = {
            quoteId: payload.quoteId,
            displayCurrency: payload.displayCurrency,
            chargeCurrency: payload.chargeCurrency,
            subtotalDisplayMinor: payload.subtotalDisplayMinor,
            shippingDisplayMinor: payload.shippingDisplayMinor,
            totalDisplayMinor: payload.totalDisplayMinor,
            totalChargeMinor: payload.totalChargeMinor,
            zoneCode: payload.zoneCode,
            expiresAt: payload.expiresAt,
            conversionDisclosure: payload.conversionDisclosure,
            demo: payload.demo === true ? true : undefined,
          };

          set({ quote, quoteError: undefined });
          return quote;
        } catch {
          set({ quote: undefined, quoteError: "Network error while quoting" });
          return null;
        }
      },

      clearQuote: () =>
        set((state) => ({ ...invalidateQuote(state) })),

      // NOTE: amounts are deliberately absent — the server re-prices (§2.2).
      toCheckoutPayload: () =>
        get().lines.map((line) => ({
          clientLineId: line.lineId,
          kind: line.kind,
          productId: line.productId,
          serviceId: line.serviceId,
          parentClientLineId: line.parentLineId,
          quantity: line.quantity,
        })),
    }),
    {
      name: "chrisviscus-storefront",
      storage: createJSONStorage(() => localStorage),
      // Deliberately excluded: fxRates/quote are server-derived and must
      // never persist stale money state across reloads.
      partialize: (state) => ({
        mode: state.mode,
        displayCurrency: state.displayCurrency,
        lines: state.lines,
      }),
      skipHydration: true,
    }
  )
);

/** Derived display subtotal (NGN identity, otherwise via cached rates). */
export function cartSubtotalDisplayMinor(state: {
  lines: CartLine[];
  displayCurrency: Currency;
  fxRates: Partial<Record<Currency, number>>;
}): number | null {
  const base = state.lines.reduce(
    (sum, line) => sum + line.baseUnitMinor * line.quantity,
    0
  );
  if (state.displayCurrency === "NGN") return base;
  const rate = state.fxRates[state.displayCurrency];
  if (!rate) return null;
  return Math.round(base * rate);
}
