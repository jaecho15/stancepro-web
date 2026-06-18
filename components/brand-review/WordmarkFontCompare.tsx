"use client";

import { useMemo, useState } from "react";
import { Check, MessageSquare } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  ImageLightbox,
  PreviewImageButton,
} from "@/components/brand-review/ImageLightbox";
import {
  WORDMARK_CHOICE_LABELS,
  WORDMARK_COMPARE_OVERVIEW,
  WORDMARK_POLLS,
  type WordmarkChoiceSlug,
  type WordmarkPoll,
} from "@/lib/wordmark-compare";

export type SelectionRow = {
  id: string;
  poll_slug: string;
  choice_slug: string;
  user_id: string;
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

function WordmarkPollSection({
  poll,
  user,
  myChoice,
  selections,
  profiles,
  comments,
  onSelect,
  onComment,
  busy,
}: {
  poll: WordmarkPoll;
  user: User;
  myChoice: WordmarkChoiceSlug | null;
  selections: SelectionRow[];
  profiles: Record<string, ProfileRow>;
  comments: CommentRow[];
  onSelect: (pollSlug: string, choiceSlug: WordmarkChoiceSlug) => Promise<void>;
  onComment: (slug: string, body: string) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null
  );

  const pollSelections = selections.filter((s) => s.poll_slug === poll.pollSlug);
  const tally = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of pollSelections) {
      counts[row.choice_slug] = (counts[row.choice_slug] ?? 0) + 1;
    }
    return counts;
  }, [pollSelections]);

  const pollComments = comments.filter((c) => c.asset_slug === poll.commentSlug);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      await onComment(poll.commentSlug, body);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1a2e61]/40 overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-lg font-semibold text-white">{poll.title}</h3>
        <p className="mt-1 text-sm text-slate-400">{poll.subtitle}</p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {poll.options.map((option) => {
          const selected = myChoice === option.choiceSlug;
          return (
            <button
              key={option.choiceSlug}
              type="button"
              disabled={busy}
              onClick={() => onSelect(poll.pollSlug, option.choiceSlug)}
              className={`group rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? "border-brand-400 bg-brand-600/15 ring-2 ring-brand-400/60"
                  : "border-white/10 bg-[#0f1c40]/60 hover:border-white/25"
              }`}
            >
              <div className="relative mb-3 overflow-hidden rounded-lg bg-[#0f1c40]">
                <PreviewImageButton
                  src={option.imagePath}
                  alt={option.label}
                  width={1050}
                  height={600}
                  whiteMat={poll.whiteMat}
                  onOpen={() =>
                    setLightbox({ src: option.imagePath, alt: option.label })
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{option.shortLabel}</p>
                  <p className="text-xs text-slate-400">{option.label}</p>
                </div>
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? "border-brand-300 bg-brand-500 text-white"
                      : "border-white/20 text-transparent group-hover:border-white/40"
                  }`}
                  aria-hidden
                >
                  <Check className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-brand-200">
                {selected ? "Your pick" : "Tap to select"}
              </p>
            </button>
          );
        })}
      </div>

      {lightbox ? (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          whiteMat={poll.whiteMat}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-sm font-medium text-slate-300">Team picks</p>
        {pollSelections.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No picks yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {pollSelections.map((row) => (
              <li key={row.id} className="text-sm text-slate-300">
                <span className="font-medium text-white">
                  {displayNameFor(row.user_id, profiles)}
                  {row.user_id === user.id ? " (you)" : ""}
                </span>
                <span className="text-slate-500"> → </span>
                <span className="text-brand-200">
                  {WORDMARK_CHOICE_LABELS[row.choice_slug as WordmarkChoiceSlug] ??
                    row.choice_slug}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Votes · Michroma v5: {tally.michroma_v5 ?? 0} · Microgramma:{" "}
          {tally.microgramma ?? 0}
        </p>
      </div>

      <div className="border-t border-white/10 px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <MessageSquare className="h-4 w-4" />
          Notes ({pollComments.length})
        </div>
        {pollComments.length === 0 ? (
          <p className="text-sm text-slate-500">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {pollComments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-200"
              >
                <span className="font-medium text-slate-300">
                  {displayNameFor(comment.user_id, profiles)}
                  {comment.user_id === user.id ? " (you)" : ""}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Why this pick for this format?"
            className="w-full resize-y rounded-lg border border-white/10 bg-[#0f1c40] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !draft.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post note"}
          </button>
        </form>
      </div>
    </section>
  );
}

export function WordmarkFontCompare({
  user,
  selections,
  profiles,
  comments,
  onSelect,
  onComment,
  busy,
}: {
  user: User;
  selections: SelectionRow[];
  profiles: Record<string, ProfileRow>;
  comments: CommentRow[];
  onSelect: (pollSlug: string, choiceSlug: WordmarkChoiceSlug) => Promise<void>;
  onComment: (slug: string, body: string) => Promise<void>;
  busy: boolean;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);

  const myChoices = useMemo(() => {
    const map: Record<string, WordmarkChoiceSlug> = {};
    for (const row of selections) {
      if (row.user_id === user.id) {
        map[row.poll_slug] = row.choice_slug as WordmarkChoiceSlug;
      }
    }
    return map;
  }, [selections, user.id]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-[#1a2e61]/30 p-5">
        <h2 className="text-xl font-semibold text-white">Wordmark font pick</h2>
        <p className="mt-2 text-sm text-slate-400">
          Choose one font per format — business cards together, poster footers
          together. Rich and Dan can each submit a pick; results sync for the
          team.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            className="overflow-hidden rounded-xl border border-white/10 bg-[#0f1c40] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={WORDMARK_COMPARE_OVERVIEW.imagePath}
              alt={WORDMARK_COMPARE_OVERVIEW.label}
              className="max-h-48 w-full object-contain object-left"
            />
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Reference overview · tap to enlarge
          </p>
        </div>
        {overviewOpen ? (
          <ImageLightbox
            src={WORDMARK_COMPARE_OVERVIEW.imagePath}
            alt={WORDMARK_COMPARE_OVERVIEW.label}
            whiteMat={false}
            onClose={() => setOverviewOpen(false)}
          />
        ) : null}
      </div>

      {WORDMARK_POLLS.map((poll) => (
        <WordmarkPollSection
          key={poll.pollSlug}
          poll={poll}
          user={user}
          myChoice={myChoices[poll.pollSlug] ?? null}
          selections={selections}
          profiles={profiles}
          comments={comments}
          onSelect={onSelect}
          onComment={onComment}
          busy={busy}
        />
      ))}
    </div>
  );
}
