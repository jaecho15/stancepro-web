export type WordmarkChoiceSlug = "michroma_v5" | "microgramma";

export type WordmarkPollSlug = "wordmark_business_card" | "wordmark_poster";

export type WordmarkPollOption = {
  choiceSlug: WordmarkChoiceSlug;
  label: string;
  shortLabel: string;
  imagePath: string;
};

export type WordmarkPoll = {
  pollSlug: WordmarkPollSlug;
  title: string;
  subtitle: string;
  commentSlug: string;
  whiteMat: boolean;
  options: WordmarkPollOption[];
};

export const WORDMARK_CHOICE_LABELS: Record<WordmarkChoiceSlug, string> = {
  michroma_v5: "Michroma Bold Custom (v5)",
  microgramma: "Microgramma D Extended Bold",
};

export const WORDMARK_COMPARE_OVERVIEW = {
  label: "Side-by-side overview",
  imagePath: "/brand-review/font_compare/overview.png",
};

export const WORDMARK_POLLS: WordmarkPoll[] = [
  {
    pollSlug: "wordmark_business_card",
    title: "Business card wordmark",
    subtitle: "Pick the font that should go on the Jae light business card.",
    commentSlug: "wordmark_pick_business_card",
    whiteMat: false,
    options: [
      {
        choiceSlug: "michroma_v5",
        label: WORDMARK_CHOICE_LABELS.michroma_v5,
        shortLabel: "Michroma v5",
        imagePath: "/brand-review/font_compare/michroma_v5_card.png",
      },
      {
        choiceSlug: "microgramma",
        label: WORDMARK_CHOICE_LABELS.microgramma,
        shortLabel: "Microgramma",
        imagePath: "/brand-review/font_compare/microgramma_card.png",
      },
    ],
  },
  {
    pollSlug: "wordmark_poster",
    title: "Poster footer wordmark",
    subtitle: "Pick the font for the Carve hero poster footer lockup.",
    commentSlug: "wordmark_pick_poster",
    whiteMat: true,
    options: [
      {
        choiceSlug: "michroma_v5",
        label: WORDMARK_CHOICE_LABELS.michroma_v5,
        shortLabel: "Michroma v5",
        imagePath: "/brand-review/font_compare/michroma_v5_poster.png",
      },
      {
        choiceSlug: "microgramma",
        label: WORDMARK_CHOICE_LABELS.microgramma,
        shortLabel: "Microgramma",
        imagePath: "/brand-review/font_compare/microgramma_poster.png",
      },
    ],
  },
];
