/**
 * Platform Providers Index
 * Export all platform implementations and factory
 */

export { BasePlatformProvider } from "./base";
export { MetaBasePlatformProvider } from "./meta-base";
export { FacebookPlatformProvider } from "./facebook";
export { InstagramPlatformProvider } from "./instagram";
export { WhatsAppPlatformProvider } from "./whatsapp";

import type { PlatformType, PlatformProvider } from "../types";
import { FacebookPlatformProvider } from "./facebook";
import { InstagramPlatformProvider } from "./instagram";
import { WhatsAppPlatformProvider } from "./whatsapp";

// Singleton instances
const providers = new Map<PlatformType, PlatformProvider>();

/**
 * Get platform provider for a specific platform type
 */
export function getPlatformProvider(platform: PlatformType): PlatformProvider {
  let provider = providers.get(platform);

  if (!provider) {
    switch (platform) {
      case "facebook_page":
        provider = new FacebookPlatformProvider();
        break;
      case "instagram":
        provider = new InstagramPlatformProvider();
        break;
      case "whatsapp":
        provider = new WhatsAppPlatformProvider();
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    providers.set(platform, provider);
  }

  return provider;
}

/**
 * Get all registered platform providers
 */
export function getAllPlatformProviders(): Map<PlatformType, PlatformProvider> {
  // Ensure all default providers are initialized
  const defaultPlatforms: PlatformType[] = [
    "facebook_page",
    "instagram",
    "whatsapp",
  ];

  for (const platform of defaultPlatforms) {
    getPlatformProvider(platform);
  }

  return providers;
}

/**
 * Register a custom platform provider
 */
export function registerPlatformProvider(
  platform: PlatformType,
  provider: PlatformProvider
): void {
  providers.set(platform, provider);
}
