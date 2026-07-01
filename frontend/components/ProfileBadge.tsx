import type { Profile } from "@/lib/types";
import { PROFILE_BLURB } from "@/lib/constants";

const STYLES: Record<Profile, string> = {
  Conservative: "chip-patina",
  Moderate: "chip-gold",
  Aggressive: "chip-terracotta",
};

export function ProfileBadge({ profile, withBlurb }: { profile: Profile; withBlurb?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`chip px-2.5 py-0.5 text-xs ${STYLES[profile]}`}>{profile}</span>
      {withBlurb && <p className="text-xs text-ink-soft">{PROFILE_BLURB[profile]}</p>}
    </div>
  );
}
