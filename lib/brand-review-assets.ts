export type BrandReviewCategory =
  | "business_cards"
  | "hero_posters"
  | "feature_posters"
  | "wordmark_compare";

export type BrandReviewAsset = {
  slug: string;
  label: string;
  category: BrandReviewCategory;
  imagePath: string;
  /** Light mat behind preview; defaults to true except business cards. */
  whiteMat?: boolean;
};

export const BRAND_REVIEW_CATEGORY_LABELS: Record<BrandReviewCategory, string> = {
  business_cards: "Business cards",
  hero_posters: "Hero posters",
  feature_posters: "Feature posters",
  wordmark_compare: "Wordmark fonts",
};

export const BRAND_REVIEW_ASSETS: BrandReviewAsset[] = [
  {
    slug: "jae_light_preview",
    label: "Jae H. Cho — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/jae_light_preview.png",
  },
  {
    slug: "jae_dark_preview",
    label: "Jae H. Cho — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/jae_dark_preview.png",
  },
  {
    slug: "richie_light_preview",
    label: "Richie Johnston — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/richie_light_preview.png",
  },
  {
    slug: "richie_dark_preview",
    label: "Richie Johnston — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/richie_dark_preview.png",
  },
  {
    slug: "dan_light_preview",
    label: "Dan Yap — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/dan_light_preview.png",
  },
  {
    slug: "dan_dark_preview",
    label: "Dan Yap — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/dan_dark_preview.png",
  },
  {
    slug: "poster_carve",
    label: "Carve hero",
    category: "hero_posters",
    imagePath: "/brand-review/posters/poster_carve_preview.png",
  },
  {
    slug: "poster_powder",
    label: "Powder hero",
    category: "hero_posters",
    imagePath: "/brand-review/posters/poster_powder_preview.png",
  },
  {
    slug: "poster_home_hq",
    label: "Home HQ",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_home_hq_preview.png",
  },
  {
    slug: "poster_setup",
    label: "Setup",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_setup_preview.png",
  },
  {
    slug: "poster_coaching",
    label: "Coaching",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_coaching_preview.png",
  },
  {
    slug: "poster_ride_nav",
    label: "Ride & Nav",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_ride_nav_preview.png",
  },
  {
    slug: "wordmark_compare_overview",
    label: "Wordmark compare — overview (v5 vs Microgramma D Extended Bold)",
    category: "wordmark_compare",
    imagePath: "/brand-review/font_compare/overview.png",
    whiteMat: false,
  },
  {
    slug: "wordmark_michroma_v5_card",
    label: "Michroma Bold Custom (v5) — business card",
    category: "wordmark_compare",
    imagePath: "/brand-review/font_compare/michroma_v5_card.png",
    whiteMat: false,
  },
  {
    slug: "wordmark_michroma_v5_poster",
    label: "Michroma Bold Custom (v5) — poster footer",
    category: "wordmark_compare",
    imagePath: "/brand-review/font_compare/michroma_v5_poster.png",
  },
  {
    slug: "wordmark_microgramma_card",
    label: "Microgramma D Extended Bold — business card",
    category: "wordmark_compare",
    imagePath: "/brand-review/font_compare/microgramma_card.png",
    whiteMat: false,
  },
  {
    slug: "wordmark_microgramma_poster",
    label: "Microgramma D Extended Bold — poster footer",
    category: "wordmark_compare",
    imagePath: "/brand-review/font_compare/microgramma_poster.png",
  },
];
