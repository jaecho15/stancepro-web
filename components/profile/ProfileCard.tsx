/* eslint-disable @next/next/no-img-element */
import { Mail, User } from "lucide-react";
import type { MemberProfile } from "@/lib/profile/fetch";

function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function Stat({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-slate-800/50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-white mt-0.5">{value}</p>
    </div>
  );
}

export function ProfileCard({
  profile,
  email,
}: {
  profile: MemberProfile;
  email: string | null;
}) {
  const age = ageFrom(profile.birth_date);
  const gender = profile.gender
    ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)
    : null;

  return (
    <div className="glass rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-5 mb-6">
        {profile.profile_picture_url ? (
          <img
            src={profile.profile_picture_url}
            alt={profile.display_name ?? profile.name ?? "Profile picture"}
            className="w-20 h-20 rounded-full object-cover border border-slate-600"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center">
            <User className="w-9 h-9 text-slate-500" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-2xl font-bold text-white truncate">
            {profile.display_name ?? profile.name ?? "Rider"}
          </p>
          <p className="text-sm text-slate-400 truncate">
            {profile.name && profile.display_name && profile.name !== profile.display_name
              ? profile.name
              : null}
            {profile.username ? ` · @${profile.username}` : null}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            {[gender, age !== null ? `${age} yrs` : null].filter(Boolean).join(" · ")}
          </p>
          {email && (
            <p className="text-sm text-slate-400 mt-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">{email}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Height" value={profile.height !== null ? `${profile.height} cm` : null} />
        <Stat label="Weight" value={profile.weight !== null ? `${profile.weight} kg` : null} />
        <Stat
          label="Foot size"
          value={profile.footsize_US !== null ? `US ${profile.footsize_US}` : null}
        />
        <Stat
          label="Leg length"
          value={profile.leglength !== null ? `${profile.leglength} cm` : null}
        />
        <Stat
          label="Stance"
          value={profile.goofy === null ? null : profile.goofy ? "Goofy" : "Regular"}
        />
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Edit your profile in the StancePro app — changes sync here automatically.
      </p>
    </div>
  );
}
