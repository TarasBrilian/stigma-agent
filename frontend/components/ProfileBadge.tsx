import type { Profile } from "@/lib/types";
import { PROFILE_BLURB } from "@/lib/constants";

const STYLES: Record<Profile, string> = {
  Conservative: "bg-emerald-100 text-emerald-800",
  Moderate: "bg-sky-100 text-sky-800",
  Aggressive: "bg-amber-100 text-amber-800",
};

export function ProfileBadge({ profile, withBlurb }: { profile: Profile; withBlurb?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[profile]}`}>
        {profile}
      </span>
      {withBlurb && <p className="text-xs text-foreground/60">{PROFILE_BLURB[profile]}</p>}
    </div>
  );
}
