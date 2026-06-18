"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { LogOut, MessageSquare, Star } from "lucide-react";
import type { Session, User } from "@supabase/supabase-js";
import { BrandLogo } from "@/components/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import {
  BRAND_REVIEW_ASSETS,
  BRAND_REVIEW_CATEGORY_LABELS,
  type BrandReviewAsset,
  type BrandReviewCategory,
} from "@/lib/brand-review-assets";

type RatingRow = {
  id: string;
  asset_slug: string;
  user_id: string;
  stars: number;
  created_at: string;
  updated_at: string;
};

type CommentRow = {
  id: string;
  asset_slug: string;
  user_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  display_name: string | null;
};

type CategoryFilter = "all" | BrandReviewCategory;

function displayNameFor(
  userId: string,
  profiles: Record<string, ProfileRow>,
  email?: string | null
) {
  const profile = profiles[userId];
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  if (profile?.name?.trim()) return profile.name.trim();
  if (email) return email.split("@")[0];
  return "Reviewer";
}

function averageStars(slug: string, ratings: RatingRow[]) {
  const rows = ratings.filter((r) => r.asset_slug === slug);
  if (!rows.length) return null;
  const sum = rows.reduce((acc, r) => acc + r.stars, 0);
  return sum / rows.length;
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value !== null && star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
            aria-label={`Rate ${star} stars`}
          >
            <Star
              className={`h-6 w-6 ${
                filled ? "fill-amber-400 text-amber-400" : "text-slate-500"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function TeamAverage({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <p className="text-sm text-slate-400">Team average · no ratings yet</p>
    );
  }
  return (
    <p className="text-sm text-slate-300">
      Team average{" "}
      <span className="font-semibold text-amber-300">{value.toFixed(1)}</span>
      <span className="text-slate-500"> / 5</span>
    </p>
  );
}

function AssetReviewCard({
  asset,
  user,
  myRating,
  teamAverage,
  comments,
  profiles,
  onRate,
  onComment,
  busy,
}: {
  asset: BrandReviewAsset;
  user: User;
  myRating: number | null;
  teamAverage: number | null;
  comments: CommentRow[];
  profiles: Record<string, ProfileRow>;
  onRate: (slug: string, stars: number) => Promise<void>;
  onComment: (slug: string, body: string) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const assetComments = comments.filter((c) => c.asset_slug === asset.slug);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      await onComment(asset.slug, body);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 overflow-hidden">
      <div className="relative bg-[#0f1c40] p-4">
        <Image
          src={asset.imagePath}
          alt={asset.label}
          width={1200}
          height={800}
          className="mx-auto h-auto w-full max-h-[420px] object-contain"
          unoptimized
        />
      </div>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-lg font-semibold text-white">{asset.label}</h3>
          <p className="text-xs text-slate-400">{asset.slug}</p>
        </div>

        <TeamAverage value={teamAverage} />

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="mb-2 text-sm font-medium text-slate-300">Your rating</p>
          <StarPicker
            value={myRating}
            disabled={busy}
            onChange={(stars) => onRate(asset.slug, stars)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <MessageSquare className="h-4 w-4" />
            Comments ({assetComments.length})
          </div>
          {assetComments.length === 0 ? (
            <p className="text-sm text-slate-500">No comments yet.</p>
          ) : (
            <ul className="space-y-3">
              {assetComments.map((comment) => (
                <li
                  key={comment.id}
                  className="rounded-lg border border-white/5 bg-black/20 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-400">
                    <span className="font-medium text-slate-300">
                      {displayNameFor(comment.user_id, profiles)}
                      {comment.user_id === user.id ? " (you)" : ""}
                    </span>
                    <time dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-200">
                    {comment.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Leave feedback on this creative…"
              className="w-full resize-y rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

export function BrandReviewPortal() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(
    null
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [email, setEmail] = useState("");
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [busy, setBusy] = useState(false);

  const loadReviewData = useCallback(async () => {
    if (!supabase) return;
    const [ratingsRes, commentsRes] = await Promise.all([
      supabase.from("brand_review_ratings").select("*"),
      supabase
        .from("brand_review_comments")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

    if (ratingsRes.error || commentsRes.error) {
      setAccessDenied(true);
      return;
    }

    setAccessDenied(false);
    setRatings((ratingsRes.data ?? []) as RatingRow[]);
    const commentRows = (commentsRes.data ?? []) as CommentRow[];
    setComments(commentRows);

    const userIds = [
      ...new Set([
        ...((ratingsRes.data ?? []) as RatingRow[]).map((r) => r.user_id),
        ...commentRows.map((c) => c.user_id),
      ]),
    ];

    if (userIds.length) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name, display_name")
        .in("id", userIds);

      const map: Record<string, ProfileRow> = {};
      for (const row of (profileRows ?? []) as ProfileRow[]) {
        map[row.id] = row;
      }
      setProfiles(map);
    } else {
      setProfiles({});
    }
  }, [supabase]);

  useEffect(() => {
    setSupabase(createClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session || !supabase) return;
    loadReviewData();
  }, [session, supabase, loadReviewData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth") {
      setLoginError("Sign-in link expired or invalid. Request a new one.");
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoginError(null);
    setLoginMessage(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    const redirectTo = `${window.location.origin}/brand-review/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setLoginError(error.message);
      return;
    }
    setLoginMessage("Check your email for a sign-in link.");
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRatings([]);
    setComments([]);
    setProfiles({});
    setAccessDenied(false);
  };

  const handleRate = async (slug: string, stars: number) => {
    if (!session?.user || !supabase) return;
    setBusy(true);
    const { error } = await supabase.from("brand_review_ratings").upsert(
      {
        asset_slug: slug,
        user_id: session.user.id,
        stars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "asset_slug,user_id" }
    );
    setBusy(false);
    if (!error) await loadReviewData();
  };

  const handleComment = async (slug: string, body: string) => {
    if (!session?.user || !supabase) return;
    const { error } = await supabase.from("brand_review_comments").insert({
      asset_slug: slug,
      user_id: session.user.id,
      body,
    });
    if (!error) await loadReviewData();
  };

  const filteredAssets = useMemo(() => {
    if (category === "all") return BRAND_REVIEW_ASSETS;
    return BRAND_REVIEW_ASSETS.filter((a) => a.category === category);
  }, [category]);

  const myRatingsBySlug = useMemo(() => {
    if (!session?.user) return {};
    const map: Record<string, number> = {};
    for (const row of ratings) {
      if (row.user_id === session.user.id) {
        map[row.asset_slug] = row.stars;
      }
    }
    return map;
  }, [ratings, session?.user]);

  if (loading || !supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] text-slate-300">
        Loading…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-[#0f1c40] px-6 py-16">
        <div className="mx-auto max-w-md space-y-8">
          <div className="flex justify-center">
            <BrandLogo iconSize={40} wordmarkWidth={180} />
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/50 p-8">
            <h1 className="text-2xl font-bold text-white">Brand Review</h1>
            <p className="mt-2 text-sm text-slate-300">
              Internal portal for StancePro marketing assets. Sign in with your
              @stance-pro.com email.
            </p>
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@stance-pro.com"
                className="w-full rounded-lg border border-white/10 bg-[#0f1c40] px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-brand-600 py-3 font-medium text-white hover:bg-brand-500"
              >
                Email me a sign-in link
              </button>
            </form>
            {loginMessage ? (
              <p className="mt-4 text-sm text-emerald-400">{loginMessage}</p>
            ) : null}
            {loginError ? (
              <p className="mt-4 text-sm text-red-400">{loginError}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#0f1c40] px-6 py-16 text-center">
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-bold text-white">Access not allowed</h1>
          <p className="text-slate-300">
            Signed in as {session.user.email}. This portal is limited to the
            StancePro brand review allowlist.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1c40]">
      <header className="border-b border-white/10 bg-[#1a2e61]/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <BrandLogo iconSize={32} wordmarkWidth={140} />
            <div>
              <p className="text-lg font-semibold text-white">Brand Review</p>
              <p className="text-xs text-slate-400">Internal · preview assets</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <span>{session.user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-slate-400">
          Rate each creative (1–5 stars) and leave comments for the team. Updates
          sync for everyone on this page.
        </p>

        <div className="mb-8 flex flex-wrap gap-2">
          <FilterPill
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All"
          />
          {(Object.keys(BRAND_REVIEW_CATEGORY_LABELS) as BrandReviewCategory[]).map(
            (key) => (
              <FilterPill
                key={key}
                active={category === key}
                onClick={() => setCategory(key)}
                label={BRAND_REVIEW_CATEGORY_LABELS[key]}
              />
            )
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {filteredAssets.map((asset) => (
            <AssetReviewCard
              key={asset.slug}
              asset={asset}
              user={session.user}
              myRating={myRatingsBySlug[asset.slug] ?? null}
              teamAverage={averageStars(asset.slug, ratings)}
              comments={comments}
              profiles={profiles}
              onRate={handleRate}
              onComment={handleComment}
              busy={busy}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : "border border-white/15 text-slate-300 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}
