// src/lib/shipping/zones.ts
// CLIENT-SIDE mirror of public.resolve_shipping_zone (0004_helpers.sql) used
// ONLY to render a friendly "Ships to <zone>" label. The database resolver
// remains the authority; if the two ever drift, quotes still use the DB.

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
    .replace(/\s+state$/, "");
  const city = (address.city ?? "").trim().toLowerCase();

  if (state === "lagos") {
    const island =
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
