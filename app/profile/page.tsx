import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchMemberData, type MemberData } from "@/lib/profile/fetch";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ProfileSportTabs } from "@/components/profile/ProfileSportTabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Profile & Setups | StancePro",
  robots: { index: false, follow: false },
};

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export default async function ProfilePage() {
  // Middleware guarantees a session; RLS scopes every query to this user.
  let data: MemberData | null = null;
  let email: string | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      email = user.email ?? null;
      data = await fetchMemberData(supabase, user.id);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-8">
            My <span className="gradient-text">Profile &amp; Setups</span>
          </h1>

          {!data ? (
            <EmptyNote>Couldn&apos;t load your data — try reloading the page.</EmptyNote>
          ) : (
            <>
              {data.profile ? (
                <ProfileCard profile={data.profile} email={email} />
              ) : (
                <EmptyNote>
                  No profile yet — finish{" "}
                  <Link href="/onboarding" className="text-brand-400 hover:text-brand-300">
                    onboarding
                  </Link>{" "}
                  to create one.
                </EmptyNote>
              )}

              <ProfileSportTabs
                snowboardSetups={data.snowboardSetups}
                skiSetups={data.skiSetups}
                snowboardGear={data.snowboardGear}
                skiGear={data.skiGear}
                fallbackHeightCm={data.profile?.height ?? null}
              />

              <p className="text-sm text-slate-500 mt-12">
                Saving and editing happens in the StancePro app — this page mirrors your
                account data live.{" "}
                <Link href="/download" className="text-brand-400 hover:text-brand-300">
                  Get the app →
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
