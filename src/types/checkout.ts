// src/types/checkout.ts
// Wire contracts for the quote + initialize + verify flow (§12, §17).

import type { Currency } from "@/types/catalog";

/** Client-proposed line; NOTE: no price/amount fields exist by design. */
export type CheckoutLineInput = {
  clientLineId: string;
  kind: "product" | "service_addon";
  productId?: string;
  serviceId?: string;
  parentClientLineId?: string;
  quantity: number;
};

export type ShippingAddress = {
  country: string;
  state: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode?: string;
};

/** Mirrors the §12.2 quote response exactly (minor units, server-computed). */
export type QuoteResponse = {
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
  /** Present ONLY in demo/offline fallback mode (never from the DB RPC). */
  demo?: boolean;
};

/** Mirrors §17.2 initialize response. */
export type CheckoutInitResponse = {
  orderId: string;
  paymentReference: string;
  displayCurrency: Currency;
  chargeCurrency: Currency;
  amountMinor: number;
  publicKey: string;
};

export type VerifyResponse = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
};

export type OrderStatus =
  | "pending_payment"
  | "payment_review"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "initiated"
  | "paid"
  | "failed"
  | "refunded";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  payment_review: "Payment under review",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  displayCurrency: Currency;
  totalDisplayMinor: number;
  createdAt: string;
};
