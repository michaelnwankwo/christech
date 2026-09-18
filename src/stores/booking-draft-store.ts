// src/stores/booking-draft-store.ts
// Blueprint §7.4 — the booking domain's draft state. Deliberately tiny and
// COMPLETELY separate from the cart store: this module must never import
// cart-store (enforced by review + the "booking does not mutate cart state"
// UI test §19.4). It also never persists: a booking draft with stale
// scheduling windows is worse than an empty one.

import { create } from "zustand";
import type { SiteAddress } from "@/types/services";

export type BookingDraft = {
  serviceId?: string;
  serviceSlug?: string;
  serviceName?: string;
  requestedStartAt?: string;
  requestedEndAt?: string;
  siteAddress?: SiteAddress;
  notes?: string;
};

type BookingDraftState = {
  draft: BookingDraft;
  submitting: boolean;
  error?: string;
  createdRequestNumber?: string;

  update: (patch: Partial<BookingDraft>) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error?: string) => void;
  markCreated: (requestNumber: string) => void;
  reset: () => void;
};

export const useBookingDraftStore = create<BookingDraftState>()((set) => ({
  draft: {},
  submitting: false,

  update: (patch) =>
    set((state) => ({
      draft: { ...state.draft, ...patch },
      error: undefined,
    })),

  setSubmitting: (submitting) => set({ submitting }),
  setError: (error) => set({ error }),
  markCreated: (requestNumber) =>
    set({ createdRequestNumber: requestNumber, submitting: false, error: undefined }),

  reset: () =>
    set({
      draft: {},
      submitting: false,
      error: undefined,
      createdRequestNumber: undefined,
    }),
}));
