import { User } from "lucide-react";

import { ProfileClient } from "../profile/profile-client";
import { SectionCard } from "./section-card";
import type { SettingsUser } from "./types";

export function PersonalProfileSection({ user }: { user: SettingsUser }) {
  return (
    <SectionCard
      icon={User}
      title="Personal Profile"
      description="Manage your personal account info, avatar, and password."
    >
      <ProfileClient initialName={user.name} initialEmail={user.email} initialImage={user.image} />
    </SectionCard>
  );
}
