export type BrandReviewCategory =
  | "business_cards"
  | "hero_posters"
  | "feature_posters"
  | "stickers"
  | "wordmark_compare";

export type BrandReviewAsset = {
  slug: string;
  label: string;
  category: BrandReviewCategory;
  imagePath: string;
  /** Light mat behind preview; defaults to true except business cards. */
  whiteMat?: boolean;
  /** Checkerboard mat for transparent artwork (stickers, die-cut). */
  checkerMat?: boolean;
  /** Original print files linked from the signed-in review portal. */
  printFiles?: Array<{ label: string; path: string }>;
};

export const BRAND_PRINT_PACKAGES = [
  {
    label: "All print files",
    path: "/brand-review/downloads/print/stancepro-all-brand-print.zip",
  },
  {
    label: "Posters ZIP",
    path: "/brand-review/downloads/print/stancepro-posters-print.zip",
  },
  {
    label: "Business cards ZIP",
    path: "/brand-review/downloads/print/stancepro-business-cards-print.zip",
  },
  {
    label: "Stickers ZIP",
    path: "/brand-review/downloads/print/stancepro-stickers-print.zip",
  },
] as const;

export const BRAND_REVIEW_CATEGORY_LABELS: Record<BrandReviewCategory, string> = {
  business_cards: "Business cards",
  hero_posters: "Hero posters",
  feature_posters: "Feature posters",
  stickers: "Stickers",
  wordmark_compare: "Wordmark fonts",
};

export const BRAND_REVIEW_ASSETS: BrandReviewAsset[] = [
  {
    slug: "jae_light_preview",
    label: "Jae H. Cho — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/jae_light_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/jae_light_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_light.png",
      },
    ],
  },
  {
    slug: "jae_dark_preview",
    label: "Jae H. Cho — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/jae_dark_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/jae_dark_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_dark.png",
      },
    ],
  },
  {
    slug: "richie_light_preview",
    label: "Richie Johnston — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/richie_light_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/richie_light_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_light.png",
      },
    ],
  },
  {
    slug: "richie_dark_preview",
    label: "Richie Johnston — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/richie_dark_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/richie_dark_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_dark.png",
      },
    ],
  },
  {
    slug: "dan_light_preview",
    label: "Dan Yap — Light",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/dan_light_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/dan_light_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_light.png",
      },
    ],
  },
  {
    slug: "dan_dark_preview",
    label: "Dan Yap — Dark",
    category: "business_cards",
    imagePath: "/brand-review/business_cards/dan_dark_preview.png",
    printFiles: [
      {
        label: "Front",
        path: "/brand-review/downloads/print/business-cards/dan_dark_front.png",
      },
      {
        label: "Back",
        path: "/brand-review/downloads/print/business-cards/back_dark.png",
      },
    ],
  },
  {
    slug: "poster_carve",
    label: "Carve hero",
    category: "hero_posters",
    imagePath: "/brand-review/posters/poster_carve_preview.png",
    printFiles: [
      {
        label: "A1 · 150dpi",
        path: "/brand-review/downloads/print/posters/poster_carve_print_A1_150dpi.png",
      },
    ],
  },
  {
    slug: "poster_powder",
    label: "Powder hero",
    category: "hero_posters",
    imagePath: "/brand-review/posters/poster_powder_preview.png",
    printFiles: [
      {
        label: "A1 · 150dpi",
        path: "/brand-review/downloads/print/posters/poster_powder_print_A1_150dpi.png",
      },
    ],
  },
  {
    slug: "poster_setup",
    label: "Setup",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_setup_preview.png",
    printFiles: [
      {
        label: "A1 · 150dpi",
        path: "/brand-review/downloads/print/posters/poster_setup_print_A1_150dpi.png",
      },
    ],
  },
  {
    slug: "poster_coaching",
    label: "Coaching",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_coaching_preview.png",
    printFiles: [
      {
        label: "A1 · 150dpi",
        path: "/brand-review/downloads/print/posters/poster_coaching_print_A1_150dpi.png",
      },
    ],
  },
  {
    slug: "poster_ride_nav",
    label: "Ride & Nav",
    category: "feature_posters",
    imagePath: "/brand-review/posters/poster_ride_nav_preview.png",
    printFiles: [
      {
        label: "A1 · 150dpi",
        path: "/brand-review/downloads/print/posters/poster_ride_nav_print_A1_150dpi.png",
      },
    ],
  },
  {
    slug: "sticker_snowboard_navy",
    label: "Snowboard — navy 6×1.5 in",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_snowboard_navy_6x1.5in_preview.png",
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_navy_6x1.5in_300dpi.png",
      },
    ],
  },
  {
    slug: "sticker_snowboard_white",
    label: "Snowboard — white 6×1.5 in",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_snowboard_white_6x1.5in_preview.png",
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_white_6x1.5in_300dpi.png",
      },
    ],
  },
  {
    slug: "sticker_snowboard_diecut",
    label: "Die-cut 6×1.5 — light board",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_snowboard_diecut_6x1.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "Artwork PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_6x1.5in_300dpi.png",
      },
      {
        label: "Cutline SVG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_cutline_6x1.5in.svg",
      },
    ],
  },
  {
    slug: "sticker_snowboard_diecut_dark_board",
    label: "Die-cut 6×1.5 — dark board",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_snowboard_diecut_dark_board_6x1.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "Artwork PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_dark_board_6x1.5in_300dpi.png",
      },
      {
        label: "Cutline SVG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_cutline_6x1.5in.svg",
      },
    ],
  },
  {
    slug: "sticker_snowboard_diecut_large",
    label: "Die-cut 10×2.5 — light board",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_snowboard_diecut_10x2.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "Artwork PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_10x2.5in_300dpi.png",
      },
      {
        label: "Cutline SVG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_cutline_10x2.5in.svg",
      },
    ],
  },
  {
    slug: "sticker_snowboard_diecut_dark_board_large",
    label: "Die-cut 10×2.5 — dark board",
    category: "stickers",
    imagePath:
      "/brand-review/merch/sticker_snowboard_diecut_dark_board_10x2.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "Artwork PNG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_dark_board_10x2.5in_300dpi.png",
      },
      {
        label: "Cutline SVG",
        path: "/brand-review/downloads/print/stickers/sticker_snowboard_diecut_cutline_10x2.5in.svg",
      },
    ],
  },
  {
    slug: "sticker_helmet_hex",
    label: "Helmet — full-color hex",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_helmet_hex_2.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_helmet_hex_2.5in_300dpi.png",
      },
    ],
  },
  {
    slug: "sticker_helmet_white",
    label: "Helmet — white mono",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_helmet_white_2.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_helmet_white_2.5in_300dpi.png",
      },
    ],
  },
  {
    slug: "sticker_helmet_badge",
    label: "Helmet — badge ring",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_helmet_badge_2.5in_preview.png",
    whiteMat: false,
    checkerMat: true,
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_helmet_badge_2.5in_300dpi.png",
      },
    ],
  },
  {
    slug: "sticker_shop_qr",
    label: "Shop counter QR 3×3 in",
    category: "stickers",
    imagePath: "/brand-review/merch/sticker_shop_qr_3x3in_preview.png",
    printFiles: [
      {
        label: "300dpi PNG",
        path: "/brand-review/downloads/print/stickers/sticker_shop_qr_3x3in_300dpi.png",
      },
    ],
  },
];
