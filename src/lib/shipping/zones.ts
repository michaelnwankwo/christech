// src/lib/shipping/zones.ts
// CLIENT-SIDE mirror of public.resolve_shipping_zone (0004_helpers.sql) used
// ONLY to render a friendly "Ships to <zone>" label. The database resolver
// remains the authority; if the two ever drift, quotes still use the DB.

import type { ShippingAddress } from "@/types/checkout";

const ISLAND_CITY_KEYWORDS = [
  "lekki",
  "ikoyi",
  "victoria island",
  "ajah",
  "ibefun",
  "orile",
  "onyi",
];

const STATE_ZONES: Record<string, string> = {
  ogun: "south-west",
  oyo: "south-west",
  osun: "south-west",
  ondo: "south-west",
  ekiti: "south-west",
  anambra: "south-east",
  imo: "south-east",
  abia: "south-east",
  enugu: "south-east",
  ebonyi: "south-east",
  rivers: "south-south",
  "akwa ibom": "south-south",
  "cross river": "south-south",
  bayelsa: "south-south",
  delta: "south-south",
  edo: "south-south",
};

const NORTHERN_STATES = new Set([
  "kaduna","kano","katsina","sokoto","zamfara","kebbi","niger","bauchi",
  "yobe","jigawa","borno","adamawa","gombe","taraba","nasarawa","plateau","benue",
]);

const squash = (value: string | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ");

/** Canonical wire shape shared by quote + initialize. This keeps address
 * hashes stable and folds case/spacing aliases before PostgreSQL resolves a
 * rate tier. It never changes street-address meaning. */
export function normalizeShippingAddressInput(
  address: ShippingAddress
): ShippingAddress {
  const country = squash(address.country).toUpperCase();
  const rawState = squash(address.state);
  const stateKey = rawState
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+state$/, "")
    .trim();
  let city = squash(address.city).replace(/\s+lga$/i, "");

  let state = rawState.replace(/\s+state$/i, "");
  if (stateKey === "lagos" || stateKey === "lagos mainland") {
    state = "Lagos";
  } else if (stateKey === "lagos island") {
    state = "Lagos";
    // Preserve the entered locality while carrying the selected island tier
    // through the DB's city-keyword resolver.
    if (!ISLAND_CITY_KEYWORDS.some((keyword) => city.toLowerCase().includes(keyword))) {
      city = city ? `Victoria Island ${city}` : "Victoria Island";
    }
  } else if (["abuja", "fct", "f c t", "federal capital territory"].includes(stateKey)) {
    state = "FCT";
  }

  return {
    country,
    state,
    city,
    addressLine1: squash(address.addressLine1),
    addressLine2: squash(address.addressLine2) || undefined,
    postalCode: squash(address.postalCode).toUpperCase() || undefined,
  };
}

export function zoneLabelForPreview(address: {
  country?: string;
  state?: string;
  city?: string;
}): string {
  const country = (address.country ?? "NG").trim().toUpperCase();
  if (country !== "NG") return "international";

  const state = (address.state ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+state$/, "")
    .replace(/\s+/g, " ");
  const city = (address.city ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  if (["lagos", "lagos mainland", "lagos island"].includes(state)) {
    const island =
      state === "lagos island" ||
      city === "vi" ||
      city === "v.i" ||
      ISLAND_CITY_KEYWORDS.some((k) => city.includes(k));
    return island ? "Lagos Island" : "Lagos Mainland";
  }
  if (["abuja", "fct", "federal capital territory"].includes(state)) {
    return "Abuja / FCT";
  }
  if (STATE_ZONES[state]) return titleCase(STATE_ZONES[state]!);
  if (NORTHERN_STATES.has(state)) return "Northern Nigeria";
  return "Nigeria (other)";
}

function titleCase(input: string): string {
  return input.replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
}
