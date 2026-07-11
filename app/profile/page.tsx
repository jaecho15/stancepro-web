import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchMemberData, type MemberData } from "@/lib/profile/fetch";
import { ProfileCard } from "@/components/profile/ProfileCard";
import {
  GearSetupCard,
  SkiSetupCard,
  SnowboardSetupCard,
} from "@/components/profile/SetupCards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Profile & Setups | StancePro",
  robots: { index: false, follow: false },
};

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="text-xl font-bold text-white mt-12 mb-4">
      {title} <span className="text-slate-500 font-medium text-base">({count})</span>
    </h2>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export default async function ProfilePage() {
  // Middleware guarantees a session; RLS scopes every query to this user.
  let data: MemberData | null = null;
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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
                <ProfileCard profile={data.profile} />
              ) : (
                <EmptyNote>
                  No profile yet — finish{" "}
                  <Link href="/onboarding" className="text-brand-400 hover:text-brand-300">
                    onboarding
                  </Link>{" "}
                  to create one.
                </EmptyNote>
              )}

              <SectionHeading title="Snowboard stance setups" count={data.snowboardSetups.length} />
              {data.snowboardSetups.length === 0 ? (
                <EmptyNote>
                  Nothing saved yet — setups you save in the app show up here. Try the{" "}
                  <Link href="/calculator" className="text-brand-400 hover:text-brand-300">
                    web calculator
                  </Link>{" "}
                  in the meantime.
                </EmptyNote>
              ) : (
                <div className="grid lg:grid-cols-2 gap-5">
                  {data.snowboardSetups.map((setup) => (
                    <SnowboardSetupCard
                      key={setup.id}
                      setup={setup}
                      fallbackHeightCm={data.profile?.height ?? null}
                    />
                  ))}
                </div>
              )}

              <SectionHeading title="Ski setups" count={data.skiSetups.length} />
              {data.skiSetups.length === 0 ? (
                <EmptyNote>No ski setups saved in the app yet.</EmptyNote>
              ) : (
                <div className="grid lg:grid-cols-2 gap-5">
                  {data.skiSetups.map((setup) => (
                    <SkiSetupCard key={setup.id} setup={setup} />
                  ))}
                </div>
              )}

              <SectionHeading
                title="Gear"
                count={data.snowboardGear.length + data.skiGear.length}
              />
              {data.snowboardGear.length + data.skiGear.length === 0 ? (
                <EmptyNote>
                  No gear saved yet — add your board, boots and bindings in the app&apos;s gear
                  section.
                </EmptyNote>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {data.snowboardGear.map((gear) => (
                    <GearSetupCard key={gear.id} gear={gear} />
                  ))}
                  {data.skiGear.map((gear) => (
                    <GearSetupCard key={gear.id} gear={gear} />
                  ))}
                </div>
              )}

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
