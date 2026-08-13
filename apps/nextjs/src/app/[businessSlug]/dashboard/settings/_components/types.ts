export interface StoreProfile {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  description: string | null;
}

export interface BusinessProfile {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  currency: string;
  defaultShippingCost: number;
  supportEmail: string | null;
  supportPhone: string | null;
  notificationEmail: string | null;
  agentName: string | null;
  conversationTone: string;
  preferredLanguage: string;
  abandonedFollowupMinutes: number;
  autoEscalateOnLowConfidence: boolean;
  confidenceThreshold: number;
}

export interface ShippingRate {
  id: string;
  district: string;
  cost: number;
  estimatedDays: number | null;
  active: boolean;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  tags: string[];
}

export interface Policy {
  id: string;
  type: string;
  title: string;
  body: string;
  active: boolean;
}

export interface SettingsUser {
  name: string;
  email: string;
  image: string | null;
}

export interface SettingsClientProps {
  storeProfile: StoreProfile;
  profile: BusinessProfile | null;
  shippingRates: ShippingRate[];
  faqs: FAQ[];
  policies: Policy[];
  user: SettingsUser;
}

export const SECTION_IDS = [
  "business",
  "profile",
  "notifications",
  "ai-agent",
  "shipping",
  "faqs",
  "policies",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type NotifPrefs = Record<string, { emailEnabled: boolean; inAppEnabled: boolean }>;
