import { env } from "~/env";

export type MetaChannel = "facebook" | "instagram" | "whatsapp";

/**
 * Which Facebook Login for Business Configuration to send a merchant through.
 *
 * FBLB resolves permissions from a Configuration, never from a `scope` list, and each
 * channel needs its own because their permission sets do not overlap:
 *
 *   Messenger  pages_show_list, pages_read_engagement, pages_manage_metadata, pages_messaging
 *   Instagram  pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_messages
 *   WhatsApp   whatsapp_business_management, whatsapp_business_messaging
 *              (created under the "WhatsApp Embedded Signup" login variation, which is the
 *               only one that exposes WhatsApp accounts as a selectable asset)
 *
 * This used to be a two-way branch with Instagram falling through to the Messenger config,
 * and both env vars held the same id — so picking "Facebook" offered Pages *and* Instagram,
 * and a WhatsApp merchant was asked for Page permissions they don't need while never being
 * asked for the WhatsApp ones they do.
 */
export function metaLoginConfigId(channel: MetaChannel): string | undefined {
  switch (channel) {
    case "whatsapp":
      return env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;
    case "instagram":
      return env.NEXT_PUBLIC_INSTAGRAM_CONFIG_ID;
    default:
      return env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
  }
}
