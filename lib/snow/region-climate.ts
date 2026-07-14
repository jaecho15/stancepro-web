// Regional snowfall-climate reference notes for the seasonal outlook.
// IMPORTANT: this is NOT a forecast. It describes the meteorological / oceanic /
// atmospheric drivers that have historically shaped snowfall variability in each
// region. Each region has ≤3 factors; each factor carries a short scannable
// label, one plain sentence of how it works (technical terms folded in), and a
// short read-with-care caveat. SST is always framed as an incremental moisture
// variable given the low-level thermal and circulation state — never a
// standalone predictor. Content is keyed by a stable contentKey;
// REGION_ID_TO_CLIMATE maps each served region_id to one.

export interface ClimateFactor {
  label: string; // short, scannable (bold in the UI)
  mechanism: string; // one plain sentence, technical terms folded in
  caveat: string; // how to read it with care
}

export interface RegionClimate {
  summary: string;
  factors: ClimateFactor[];
}

// Shared "how to read these" guidance — shown ONCE at page level, not repeated
// in every region panel.
export const WHAT_TO_LOOK_FOR = [
  "Season snowfall trend — standardized against the long-term average (z-score), not raw totals.",
  "Conditional snowfall distribution for each key index (e.g. El Niño / neutral / La Niña), with the sample size shown.",
  "The joint relationship between temperature and moisture supply — snow needs both cold and moisture at once.",
] as const;

export const RESORT_CAVEAT =
  "At the resort scale, elevation, slope aspect, and windward/leeward position relative to the range can change these outcomes substantially — neighboring resorts often differ.";

export const CLIMATE_CAUTION =
  "These are historical reference notes describing each region's snowfall climate. They do not predict or guarantee any particular season's snowfall.";

const CONTENT: Record<string, RegionClimate> = {
  hokkaido: {
    summary:
      "Cold Siberian air crossing the relatively warm Sea of Japan and lifting over Hokkaido's ranges drives the region's famously frequent, low-density powder.",
    factors: [
      {
        label: "Winter monsoon (NW flow)",
        mechanism:
          "A strong Siberian-High–Aleutian-Low pressure gradient drives northwesterly winds (around 1.5 km up, the 850 hPa level) that pick up moisture crossing the Sea of Japan and build snow bands over Hokkaido.",
        caveat:
          "If the flow tilts too far west or north, the heaviest snow can shift to different resorts.",
      },
      {
        label: "Cold air over a mild sea",
        mechanism:
          "The larger the gap between the 850 hPa air temperature and the warmer sea surface, the stronger the heat-and-moisture exchange that fuels sea-effect snow.",
        caveat:
          "A warm sea does not guarantee snow — without enough low-level cold the same setup brings rain or heavy wet snow.",
      },
      {
        label: "Sea moisture supply",
        mechanism:
          "Sea-surface temperature (SST), sea ice and moisture flux set how much moisture the incoming cold air can tap.",
        caveat:
          "Treat SST as an add-on, not the headline — weigh it only alongside T850, wind speed and direction, and check whether it actually improves the snowfall picture.",
      },
    ],
  },
  tohoku: {
    summary:
      "Moist Sea-of-Japan air forced up against the mountains piles snow on the windward side, and convergence bands can bury a narrow strip.",
    factors: [
      {
        label: "Cross-range winds",
        mechanism:
          "Humid Sea-of-Japan air rises where the northwest monsoon meets the ranges; for a given wind speed, the component blowing perpendicular to the range drives the windward dumps.",
        caveat:
          "Two resorts a short distance apart can differ sharply depending on their angle to the flow.",
      },
      {
        label: "Convergence bands (JPCZ)",
        mechanism:
          "When winds converge over the Sea of Japan (the JPCZ), an intense snow-cloud band forms and concentrates heavy snow on a narrow zone.",
        caveat:
          "The band wanders, so whether it passes over your resort matters more than the regional average.",
      },
      {
        label: "Snow-vs-rain line",
        mechanism:
          "It can rain on the coast and lowlands (set by the 850 hPa and wet-bulb temperature) while it snows up high.",
        caveat:
          "Compare the rain-vs-snow split and snow density between seasons, not just total precipitation.",
      },
    ],
  },
  central_japan: {
    summary:
      "A mix of Sea-of-Japan sea-effect snow and passing low-pressure systems, sorted by which valleys and ridges face the wind.",
    factors: [
      {
        label: "Two storm types",
        mechanism:
          "Both Sea-of-Japan sea-effect snow and passing lows deliver snow here.",
        caveat:
          "Separate the two — they behave differently, so analyze big-snow events by type.",
      },
      {
        label: "Wind direction & shelter",
        mechanism:
          "Whether the wind is northwest, west or southwest decides which valleys and ridges load up.",
        caveat: "Even neighboring resorts can correlate poorly.",
      },
      {
        label: "Freezing level",
        mechanism:
          "In mild spells the share falling as snow — set by the sub-freezing layer depth and 0 °C level — decides the snowpack, not the precipitation total.",
        caveat: "Especially important for lower-base resorts.",
      },
    ],
  },
  north_alps: {
    summary:
      "Atlantic storms on a westerly/northwesterly track lift moist air onto the north-facing Alps for broad snowfalls.",
    factors: [
      {
        label: "Atlantic westerlies",
        mechanism:
          "West/northwesterly moisture transport from North Atlantic storms feeds the north side of the Alps for broad snowfalls.",
        caveat:
          "A northward-shifted storm track turns it milder and rain can mix in.",
      },
      {
        label: "NAO background",
        mechanism:
          "The North Atlantic Oscillation (NAO) sets how the winter westerlies and storm track are arranged.",
        caveat:
          "The NAO–snowfall link varies by month and resort — not a direct predictor.",
      },
      {
        label: "Snow-line height",
        mechanism:
          "The 0 °C level, wet-bulb freezing level and low-level temperature often matter more than precipitation totals for natural snow and base depth.",
        caveat: "Read high-altitude and valley resorts separately.",
      },
    ],
  },
  south_alps: {
    summary:
      "Mediterranean lows drive southerly moisture onto the south-facing Alps — often the mirror image of the north side.",
    factors: [
      {
        label: "Mediterranean moisture",
        mechanism:
          "South/southwesterly flow from Mediterranean lows rises on the south slopes to make heavy snow.",
        caveat: "The pattern can run opposite to the northern Alps.",
      },
      {
        label: "Genoa lows",
        mechanism:
          "The center and fronts of Genoa lows and Mediterranean cyclones produce very localized heavy snow.",
        caveat:
          "Follow the cyclone track rather than a regional mean pressure.",
      },
      {
        label: "Foehn split",
        mechanism:
          "When it snows on the south side, Foehn can leave the north side dry and warm — and vice versa.",
        caveat: "Don't lump the whole Alps under one index.",
      },
    ],
  },
  pyrenees: {
    summary:
      "Caught between Atlantic westerlies and Mediterranean easterlies — the two sides of the range snow for different reasons.",
    factors: [
      {
        label: "Two-sided flow",
        mechanism:
          "The north side snows on Atlantic west/northwesterlies, the south side on Mediterranean easterlies.",
        caveat: "Split into at least north and south Pyrenees.",
      },
      {
        label: "NAO & storm track",
        mechanism:
          "The NAO describes the frequency and path of westerly storms.",
        caveat:
          "A positive NAO doesn't always mean more snow at a given resort.",
      },
      {
        label: "Precip-type sensitivity",
        mechanism:
          "Being relatively far south, the 0 °C level and dry-air intrusions swing snow versus rain.",
        caveat: "Show total precipitation and natural-snow depth separately.",
      },
    ],
  },
  scandinavia: {
    summary:
      "Maritime Atlantic storms and orographic lift dominate; the balance of moisture and cold sets snow versus rain.",
    factors: [
      {
        label: "Atlantic storms",
        mechanism:
          "North Atlantic storms and westerly moisture transport, lifted by terrain, drive western-Norway snow.",
        caveat:
          "Even with heavy precipitation, coastal lowlands can see rain.",
      },
      {
        label: "NAO / AO background",
        mechanism:
          "The NAO and Arctic Oscillation set the seasonal-scale storm-belt position.",
        caveat:
          "Effects can differ between northern and southern Scandinavia.",
      },
      {
        label: "Warm sea, warm air",
        mechanism:
          "A warm ocean (SST) supplies moisture but can also raise temperatures.",
        caveat:
          "Snow-line height and low-level thermal structure often matter more for snow than SST alone.",
      },
    ],
  },
  pacific_nw: {
    summary:
      "Pacific storms and atmospheric rivers meet the mountains for large precipitation; the freezing level decides how much falls as snow.",
    factors: [
      {
        label: "Atmospheric rivers",
        mechanism:
          "Pacific storm tracks and atmospheric rivers deliver strong moisture transport onto the terrain for large precipitation.",
        caveat:
          "A warm atmospheric river can bring rain to the resort base even with big totals.",
      },
      {
        label: "ENSO background",
        mechanism:
          "El Niño and La Niña shift the storm track and temperatures statistically, but the relationship varies by area and season stage.",
        caveat: "Don't decide the season from a single index.",
      },
      {
        label: "Freezing level",
        mechanism:
          "In this maritime climate the snow fraction (snow-line height, wet-bulb temperature) matters more than the precipitation total.",
        caveat: "Read summit, mid and base separately.",
      },
    ],
  },
  sierra: {
    summary:
      "A few big atmospheric-river storms can make most of the season; wet, dense 'Sierra cement' is common.",
    factors: [
      {
        label: "Big AR events",
        mechanism:
          "A few strong atmospheric rivers — measured by integrated vapor transport (IVT) — can supply most of the season's snow.",
        caveat:
          "Event-by-event vapor transport matters more than the average number of snowy days.",
      },
      {
        label: "ENSO & PDO",
        mechanism:
          "ENSO and the Pacific Decadal Oscillation (PDO) form a background for north–south storm-track shifts.",
        caveat:
          "The link is non-linear and decadally modulated — avoid a simple El Niño formula.",
      },
      {
        label: "Wet snow",
        mechanism:
          "The Sierra sees lots of wet snow, and warm storms move the rain–snow line a lot.",
        caveat: "Show both snow depth and water content (SWE).",
      },
    ],
  },
  us_interior_rockies: {
    summary:
      "Pacific air that has crossed several ranges arrives drier; cold temperatures make deep, light snow from modest moisture.",
    factors: [
      {
        label: "Wrung-out Pacific air",
        mechanism:
          "Air loses moisture crossing range after range, so storm track and windward/leeward position govern totals.",
        caveat:
          "The same storm can be generous for one range and dry for the next.",
      },
      {
        label: "ENSO & the jet",
        mechanism:
          "ENSO and jet-stream position can push the northern and southern Rockies opposite ways.",
        caveat:
          "Don't explain the whole US Rockies with one ENSO relationship.",
      },
      {
        label: "Cold, light snow",
        mechanism:
          "In cold air, little moisture still stacks up deep and light (a high snow-to-water ratio).",
        caveat: "Always distinguish snow depth from SWE.",
      },
    ],
  },
  canadian_interior: {
    summary:
      "Pacific moisture wrung out over successive ranges reloads and lifts again over the interior mountains.",
    factors: [
      {
        label: "Reloading moisture",
        mechanism:
          "Pacific moisture wrung out over the coast ranges rises again over the interior ranges to snow.",
        caveat: "How much moisture is lost along each path matters.",
      },
      {
        label: "Wind & range angle",
        mechanism:
          "West/southwest/northwest winds give specific resorts a strong windward effect.",
        caveat: "A resort-by-resort wind composite beats a regional average.",
      },
      {
        label: "ENSO / PNA background",
        mechanism:
          "ENSO and the Pacific–North American (PNA) pattern set seasonal temperature and storm-track background.",
        caveat:
          "Individual storms are set by short-term lows and moisture transport.",
      },
    ],
  },
  na_east: {
    summary:
      "Coastal 'Nor'easters' pairing Atlantic moisture with inland cold — plus lake-effect snow in places.",
    factors: [
      {
        label: "Nor'easters",
        mechanism:
          "Coastal cyclogenesis pairs Atlantic moisture with inland cold for heavy snow.",
        caveat:
          "A small shift in the low's track hugely changes the snow / rain / ice split.",
      },
      {
        label: "Cold-air supply (AO/NAO)",
        mechanism:
          "The Arctic Oscillation and NAO set whether cold air can lodge over the east.",
        caveat:
          "A negative index alone isn't enough — you still need moisture and the right track.",
      },
      {
        label: "Lake-effect",
        mechanism: "Some areas get lake-effect snow.",
        caveat:
          "Read the lake-to-850 hPa temperature difference, wind direction and lake ice together.",
      },
    ],
  },
  nz: {
    summary:
      "Southern-Ocean lows and the westerly belt feed the Southern Alps; western windward and eastern lee resorts differ.",
    factors: [
      {
        label: "Westerly belt",
        mechanism:
          "Southern-Ocean lows and westerly fronts supply the Southern Alps.",
        caveat:
          "West-windward and eastern resorts respond differently.",
      },
      {
        label: "SAM & ENSO",
        mechanism:
          "The Southern Annular Mode (SAM) and ENSO shift the SH westerlies and circulation around New Zealand.",
        caveat:
          "Effects vary by region and season — not a standalone predictor.",
      },
      {
        label: "Foehn & snow line",
        mechanism:
          "Eastern resorts can see air dry and warm crossing the Alps (Foehn).",
        caveat:
          "Front direction, temperature and the crossing process matter more than total precipitation.",
      },
    ],
  },
  australia: {
    summary:
      "Cold fronts off the Southern Ocean bring the main natural-snow events; small temperature changes decide snow versus rain.",
    factors: [
      {
        label: "Cold fronts",
        mechanism:
          "Southern-Ocean cold fronts with southwesterly flow bring the main natural-snow events when cold and moisture arrive together.",
        caveat: "Cold air without moisture gives limited snow.",
      },
      {
        label: "SAM / ENSO / IOD",
        mechanism:
          "The SAM, ENSO and Indian Ocean Dipole (IOD) can shape southeast-Australian precipitation and temperature.",
        caveat:
          "The signal depends on season and index combination — don't use one index.",
      },
      {
        label: "Marginal temperatures",
        mechanism:
          "At these low elevations, small wet-bulb temperature changes swing rain versus snow.",
        caveat:
          "Separate natural snow, snow retention and snowmaking conditions.",
      },
    ],
  },
  central_andes: {
    summary:
      "Winter lows and fronts on the westerlies deliver the main snow; huge year-to-year swings are the norm.",
    factors: [
      {
        label: "Westerly storms",
        mechanism:
          "Winter lows and fronts on the southeast-Pacific storm track bring the main snowfall.",
        caveat: "The storm belt's north–south position matters.",
      },
      {
        label: "El Niño tendency",
        mechanism:
          "Some El Niño winters tend to be wetter in central Chile.",
        caveat:
          "Not every El Niño means a big season — a statistical tendency, not a rule.",
      },
      {
        label: "Extreme swings",
        mechanism: "The Andes have very large year-to-year variability.",
        caveat:
          "Show median, quantiles and dry spells, not just the average.",
      },
    ],
  },
  patagonia: {
    summary:
      "The Southern-Hemisphere westerlies force strong orographic precipitation on the west; the east lies in a rain shadow.",
    factors: [
      {
        label: "Orographic west, dry east",
        mechanism:
          "The SH westerlies force strong orographic precipitation on the west slopes while the east sits in a rain shadow.",
        caveat: "West- and east-side resorts are almost different climates.",
      },
      {
        label: "SAM & latitude",
        mechanism:
          "As the SAM shifts the westerlies north and south, storm frequency and precipitation location change.",
        caveat: "Account for latitude-dependent responses.",
      },
      {
        label: "Moisture & wind angle",
        mechanism:
          "Snowfall depends on Pacific moisture plus cold air and the wind's angle to the range.",
        caveat:
          "Any single index correlates weakly versus the direct storm-by-storm setup.",
      },
    ],
  },
  tien_shan: {
    summary:
      "Westerly disturbances bring limited but cold moisture far from any ocean; low temperatures keep the snow light.",
    factors: [
      {
        label: "Westerly disturbances",
        mechanism:
          "Lows and moisture arriving from the west are the main snow source.",
        caveat: "Far from oceans, moisture pathways are limited.",
      },
      {
        label: "Jet & teleconnections",
        mechanism:
          "Large-scale circulation — read via 500 hPa heights and moisture transport — steers Central Asian storm tracks.",
        caveat: "Direct fields beat any single teleconnection index.",
      },
      {
        label: "Cold but dry",
        mechanism:
          "Extreme cold makes low-density snow, but moisture is scarce.",
        caveat: "Snowfall frequency and snow depth are separate questions here.",
      },
    ],
  },
  east_asia: {
    summary:
      "The East Asian winter monsoon supplies cold northwesterly flow; the seas add moisture and passing lows can broaden snowfall.",
    factors: [
      {
        label: "Winter monsoon",
        mechanism:
          "The Siberian High and East Asian pressure pattern supply cold northwesterly flow.",
        caveat: "Korea's east coast and inland resorts respond differently.",
      },
      {
        label: "Sea moisture & sea-air gap",
        mechanism:
          "Snow clouds forming over the Sea of Japan / Yellow Sea drop snow on particular coasts and mountains by wind direction.",
        caveat: "Read SST together with low-level cold.",
      },
      {
        label: "Passing lows",
        mechanism:
          "Traveling lows on southern-sea / East China Sea tracks can bring broad natural snow.",
        caveat: "By the low's track it can be rain, snow or dry.",
      },
    ],
  },
};

// Each served region_id → its best-matching content (remapped where the
// pipeline's geography is finer or coarser than the source regions).
const REGION_ID_TO_CLIMATE: Record<string, string> = {
  jp_hokkaido: "hokkaido",
  jp_tohoku: "tohoku",
  jp_central_honshu: "central_japan",
  fr_western_alps: "north_alps",
  at_northern_alps: "north_alps",
  ch_northern_alps: "north_alps",
  it_dolomites: "south_alps",
  it_southern_alps: "south_alps",
  ad_pyrenees: "pyrenees",
  es_pyrenees: "pyrenees",
  es_sierra_nevada: "pyrenees",
  fi_finnish_lapland: "scandinavia",
  no_northern_norway: "scandinavia",
  no_southern_norway: "scandinavia",
  se_scandinavian_mountains: "scandinavia",
  us_pacific_northwest: "pacific_nw",
  ca_coastal_bc: "pacific_nw",
  us_tahoe_sierra: "sierra",
  us_utah_wyoming: "us_interior_rockies",
  us_colorado_rockies: "us_interior_rockies",
  us_northern_rockies: "us_interior_rockies",
  ca_interior_bc: "canadian_interior",
  ca_alberta_rockies: "canadian_interior",
  ca_eastern_canada: "na_east",
  nz_south_island: "nz",
  nz_north_island: "nz",
  au_southeast_alps: "australia",
  cl_central_andes: "central_andes",
  ar_mendoza: "central_andes",
  cl_southern_andes: "patagonia",
  ar_northern_patagonia: "patagonia",
  ar_southern_patagonia: "patagonia",
  cn_western_china: "tien_shan",
  kz_tian_shan: "tien_shan",
  in_western_himalaya: "tien_shan",
  cn_northeast: "east_asia",
  cn_north_china: "east_asia",
  kr_gangwon: "east_asia",
  cn_southwest_china: "east_asia",
};

/** Best-matching climate notes for a browse region_id (e.g. "jp_hokkaido"). */
export function regionClimate(regionId: string | null | undefined): RegionClimate | null {
  if (!regionId) return null;
  const key = REGION_ID_TO_CLIMATE[regionId];
  return key ? CONTENT[key] : null;
}
