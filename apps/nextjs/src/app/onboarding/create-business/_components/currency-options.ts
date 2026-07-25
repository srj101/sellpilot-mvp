export const CURRENCY_OPTIONS = [
  { code: "BDT", label: "BDT — Taka" },
  { code: "USD", label: "USD — Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — Pound" },
  { code: "INR", label: "INR — Rupee" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];
