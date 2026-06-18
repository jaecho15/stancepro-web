export type BrandReviewCategory =
  | "business_cards"
  | "hero_posters"
  | "feature_posters";

export type BrandReviewAsset = {
  slug: string;
  label: string;
  category: BrandReviewCategory;
  imagePath: string;
};

export const BRAND_REVIEW_CATEGORY_LABELS: Record<BrandReviewCategory, string> = {
  business_cards: "Business cards",
  hero_posters: "Hero posters",
  feature_posters: "Feature posters",
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
];
