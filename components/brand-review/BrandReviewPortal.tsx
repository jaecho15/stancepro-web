"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { InternalChrome } from "@/components/internal/InternalChrome";
import { useInternalAuth } from "@/hooks/useInternalAuth";
import {
  ImageLightbox,
  PreviewImageButton,
} from "@/components/brand-review/ImageLightbox";
import {
  WordmarkFontCompare,
  type SelectionRow,
} from "@/components/brand-review/WordmarkFontCompare";
import {
  BRAND_REVIEW_ASSETS,
  BRAND_REVIEW_CATEGORY_LABELS,
  type BrandReviewAsset,
  type BrandReviewCategory,
} from "@/lib/brand-review-assets";
import type { WordmarkChoiceSlug } from "@/lib/wordmark-compare";

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const assetComments = comments.filter((c) => c.asset_slug === asset.slug);
  const whiteMat = asset.whiteMat ?? asset.category !== "business_cards";

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
        <PreviewImageButton
          src={asset.imagePath}
          alt={asset.label}
          width={1200}
          height={800}
          whiteMat={whiteMat}
          onOpen={() => setLightboxOpen(true)}
        />
        {lightboxOpen ? (
          <ImageLightbox
            src={asset.imagePath}
            alt={asset.label}
            whiteMat={whiteMat}
            onClose={() => setLightboxOpen(false)}
          />
        ) : null}
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
  const { supabase, session, signOut } = useInternalAuth();
  const [accessDenied, setAccessDenied] = useState(false);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [selections, setSelections] = useState<SelectionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [busy, setBusy] = useState(false);

  const loadReviewData = useCallback(async () => {
    if (!supabase) return;
    const [ratingsRes, commentsRes, selectionsRes] = await Promise.all([
      supabase.from("brand_review_ratings").select("*"),
      supabase
        .from("brand_review_comments")
        .select("*")
        .order("created_at", { ascending: true }),
      supabase.from("brand_review_selections").select("*"),
    ]);

    if (ratingsRes.error || commentsRes.error || selectionsRes.error) {
      setAccessDenied(true);
      return;
    }

    setAccessDenied(false);
    setRatings((ratingsRes.data ?? []) as RatingRow[]);
    const commentRows = (commentsRes.data ?? []) as CommentRow[];
    setComments(commentRows);
    const selectionRows = (selectionsRes.data ?? []) as SelectionRow[];
    setSelections(selectionRows);

    const userIds = [
      ...new Set([
        ...((ratingsRes.data ?? []) as RatingRow[]).map((r) => r.user_id),
        ...commentRows.map((c) => c.user_id),
        ...selectionRows.map((s) => s.user_id),
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
    if (!session || !supabase) return;
    loadReviewData();
  }, [session, supabase, loadReviewData]);

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

  const handleSelect = async (pollSlug: string, choiceSlug: WordmarkChoiceSlug) => {
    if (!session?.user || !supabase) return;
    setBusy(true);
    const { error } = await supabase.from("brand_review_selections").upsert(
      {
        poll_slug: pollSlug,
        choice_slug: choiceSlug,
        user_id: session.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "poll_slug,user_id" }
    );
    setBusy(false);
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

  if (!supabase || !session?.user) {
    return null;
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
            onClick={() => signOut()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <InternalChrome
      title="Brand Review"
      subtitle="Internal · preview assets"
      email={session.user.email}
      onSignOut={signOut}
      backHref="/internal"
      backLabel="Internal home"
    >
      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-slate-400">
          Rate each creative (1–5 stars) and leave comments for the team. Use{" "}
          <strong className="font-medium text-slate-300">Wordmark fonts</strong>{" "}
          to pick Michroma v5 vs Microgramma — business cards and posters
          separately.
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

        {category === "wordmark_compare" ? (
          <WordmarkFontCompare
            user={session.user}
            selections={selections}
            profiles={profiles}
            comments={comments}
            onSelect={handleSelect}
            onComment={handleComment}
            busy={busy}
          />
        ) : (
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
        )}
      </main>
    </InternalChrome>
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
