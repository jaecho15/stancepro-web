// Regional snowfall-climate reference notes for the seasonal outlook.
// IMPORTANT: this is NOT a forecast. It describes the meteorological / oceanic /
// atmospheric drivers that have historically shaped snowfall variability in each
// region, in plain-but-technical English. Each region has ≤3 factors, and each
// factor names the indicator, how it works, and how to read it with care. SST is
// always framed as an incremental moisture variable given the low-level thermal
// and circulation state — never a standalone predictor. Content is keyed by a
// stable contentKey; REGION_ID_TO_CLIMATE maps each served region_id to one.

export interface ClimateFactor {
  indicator: string;
  mechanism: string;
  caveat: string;
}

export interface RegionClimate {
  summary: string;
  factors: ClimateFactor[];
}

// Shared across every region (the card format's fixed parts).
export const WHAT_TO_LOOK_FOR = [
  "Season snowfall trend — standardized against the long-term average (z-score), not raw totals.",
  "Conditional snowfall distribution for each key index (e.g. El Niño / neutral / La Niña), with the sample size shown.",
  "The joint relationship between temperature and moisture supply — snow needs both cold and moisture at once.",
] as const;

export const RESORT_CAVEAT =
  "At the resort scale, elevation, slope aspect, and windward/leeward position relative to the range can change these outcomes substantially — neighboring resorts often differ.";

export const CLIMATE_CAUTION =
  "This is historical reference information describing the region's snowfall climate. It does not predict or guarantee any particular season's snowfall.";

const CONTENT: Record<string, RegionClimate> = {
  hokkaido: {
    summary:
      "Cold Siberian air crossing the relatively warm Sea of Japan and lifting over Hokkaido's ranges drives the region's famously frequent, low-density powder.",
    factors: [
      {
        indicator: "Siberian High–Aleutian Low pressure gradient & 850 hPa northwesterly flow",
        mechanism:
          "A strong winter monsoon (the wind roughly 1.5 km up) pushes cold air across the Sea of Japan, where it takes up moisture and builds snow-cloud bands over Hokkaido.",
        caveat:
          "If the flow tilts too far west or north, the heaviest snow can shift to different resorts.",
      },
      {
        indicator: "850 hPa temperature & the sea-surface-to-air temperature difference",
        mechanism:
          "The larger the contrast between cold air aloft and the milder sea, the stronger the heat and moisture exchange that fuels sea-effect snow.",
        caveat:
          "A warm sea does not guarantee snow — without enough low-level cold the same setup brings rain or heavy wet snow.",
      },
      {
        indicator: "Sea of Japan SST, sea ice & moisture flux",
        mechanism:
          "Sea-surface warmth and open water set how much moisture is available to the incoming cold air.",
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
        indicator: "Northwest monsoon & the cross-range wind component",
        mechanism:
          "Humid air off the Sea of Japan rises where it meets the ranges, dumping snow on the windward slopes; for the same wind speed, the part blowing perpendicular to the range matters most.",
        caveat:
          "Two resorts a short distance apart can see very different totals depending on their angle to the flow.",
      },
      {
        indicator: "Japan-Sea Polar-air Convergence Zone (JPCZ) — position & duration",
        mechanism:
          "Where winds converge, an intense snow-cloud band forms and concentrates heavy snow on a narrow zone.",
        caveat:
          "The band wanders a lot, so whether it passes over your resort matters more than the regional average.",
      },
      {
        indicator: "850 hPa temperature, wet-bulb temperature & precipitation type",
        mechanism:
          "It can rain on the coast and lowlands while it snows up high.",
        caveat:
          "When comparing seasons, look at the rain-vs-snow split and snow density, not just total precipitation.",
      },
    ],
  },
  central_japan: {
    summary:
      "A mix of Sea-of-Japan sea-effect snow and passing low-pressure systems, sorted by which valleys and ridges face the wind.",
    factors: [
      {
        indicator: "Sea-of-Japan lows & the winter-monsoon track",
        mechanism:
          "Both sea-effect snow and traveling low-pressure systems deliver snow here.",
        caveat:
          "It helps to separate the two storm types — they behave differently, so analyze big-snow events by type.",
      },
      {
        indicator: "Orographic lift by wind direction & range sheltering",
        mechanism:
          "Whether the wind is northwest, west or southwest decides which valleys and ridges load up.",
        caveat:
          "Even neighboring resorts can have very different snowfall correlation.",
      },
      {
        indicator: "Sub-freezing layer depth & the 0 °C level",
        mechanism:
          "In milder spells the share falling as snow — not the precipitation total — decides the snowpack.",
        caveat: "Especially important for lower-base resorts.",
      },
    ],
  },
  north_alps: {
    summary:
      "Atlantic storms on a westerly/northwesterly track lift moist air onto the north-facing Alps for broad snowfalls.",
    factors: [
      {
        indicator: "North Atlantic storm track & W/NW moisture transport",
        mechanism:
          "When Atlantic moisture feeds the north side of the Alps, snow falls over a wide area.",
        caveat:
          "If the storm track shifts north it turns milder and rain can mix in.",
      },
      {
        indicator: "North Atlantic Oscillation (NAO) & Atlantic circulation",
        mechanism:
          "A background index for how the winter westerlies and storm track are arranged.",
        caveat:
          "The NAO–snowfall link varies by month and by resort, so it should not be used as a direct predictor.",
      },
      {
        indicator: "0 °C level, wet-bulb freezing level & low-level temperature",
        mechanism:
          "In the Alps the snow-line height can matter more than precipitation totals for natural snow and base depth.",
        caveat: "Read high-altitude and valley resorts separately.",
      },
    ],
  },
  south_alps: {
    summary:
      "Mediterranean lows drive southerly moisture onto the south-facing Alps — often the mirror image of the north side.",
    factors: [
      {
        indicator: "Mediterranean lows & S/SW moisture transport",
        mechanism:
          "Moist Mediterranean air rising on the south slopes produces heavy snow.",
        caveat: "The pattern can run opposite to the northern Alps.",
      },
      {
        indicator: "Genoa lows & Mediterranean cyclone tracks",
        mechanism:
          "The low center and front position produce very localized heavy snow.",
        caveat:
          "Following the cyclone track works better than a simple regional mean sea-level pressure.",
      },
      {
        indicator: "Foehn occurrence",
        mechanism:
          "When it snows on the south side, the north side can turn dry and warm — and the reverse also happens.",
        caveat: "Don't lump the whole Alps under one index.",
      },
    ],
  },
  pyrenees: {
    summary:
      "Caught between Atlantic westerlies and Mediterranean easterlies — the two sides of the range snow for different reasons.",
    factors: [
      {
        indicator: "Atlantic W/NW flow & Mediterranean easterlies",
        mechanism:
          "The north and south sides get their snow from different directions.",
        caveat: "Split the area into at least north and south Pyrenees.",
      },
      {
        indicator: "NAO & storm track",
        mechanism:
          "Describes the frequency and path of westerly storms.",
        caveat:
          "A positive NAO does not always mean more snow at a given resort.",
      },
      {
        indicator: "0 °C level & dry-air intrusions",
        mechanism:
          "Being relatively far south, it is sensitive to precipitation-type changes.",
        caveat: "Show total precipitation and natural-snow depth separately.",
      },
    ],
  },
  scandinavia: {
    summary:
      "Maritime Atlantic storms and orographic lift dominate; the balance of moisture and cold sets snow versus rain.",
    factors: [
      {
        indicator: "North Atlantic storms & westerly moisture transport",
        mechanism:
          "Western Norway is strongly shaped by ocean storms and orographic lift.",
        caveat:
          "Even with heavy precipitation, coastal lowlands can see rain.",
      },
      {
        indicator: "NAO / Arctic Oscillation & storm-belt position",
        mechanism: "Sets the seasonal-scale circulation background.",
        caveat:
          "Effects can differ between northern and southern Scandinavia.",
      },
      {
        indicator: "SST coupled with low-level temperature",
        mechanism:
          "A warm ocean supplies moisture but can also raise temperatures.",
        caveat:
          "Snow-line height and low-level thermal structure often matter more for snowfall than SST alone.",
      },
    ],
  },
  pacific_nw: {
    summary:
      "Pacific storms and atmospheric rivers meet the mountains for large precipitation; the freezing level decides how much falls as snow.",
    factors: [
      {
        indicator: "Pacific storm track & atmospheric rivers",
        mechanism:
          "Strong moisture transport hitting the terrain makes large-scale precipitation.",
        caveat:
          "Even with big totals, a warm atmospheric river can bring rain to the resort base.",
      },
      {
        indicator: "ENSO & North Pacific circulation",
        mechanism:
          "El Niño and La Niña shift the storm track and temperatures statistically, but the relationship varies by area and stage of the season.",
        caveat:
          "Don't decide the season's snow from a single index.",
      },
      {
        indicator: "Snow-line height, wet-bulb temperature & elevation",
        mechanism:
          "In a maritime climate the snow fraction matters more than the precipitation total.",
        caveat: "Read summit, mid and base separately.",
      },
    ],
  },
  sierra: {
    summary:
      "A few big atmospheric-river storms can make most of the season; wet, dense 'Sierra cement' is common.",
    factors: [
      {
        indicator: "Atmospheric rivers & integrated vapor transport (IVT)",
        mechanism:
          "A handful of strong storms can supply a large share of the season's snow.",
        caveat:
          "Event-by-event vapor transport matters more than the average number of snowy days.",
      },
      {
        indicator: "ENSO & PDO with the Pacific storm track",
        mechanism:
          "A background for north–south shifts of the storm track.",
        caveat:
          "The relationship is non-linear and modulated by decadal variability — avoid a simple El Niño formula.",
      },
      {
        indicator: "Precipitation type & snow density",
        mechanism:
          "The Sierra sees a high share of wet snow, and the rain–snow line moves a lot in warm storms.",
        caveat: "Show both snow depth and water content (SWE).",
      },
    ],
  },
  us_interior_rockies: {
    summary:
      "Pacific air that has crossed several ranges arrives drier; cold temperatures make deep, light snow from modest moisture.",
    factors: [
      {
        indicator: "North Pacific storms & inland moisture transport",
        mechanism:
          "Air loses moisture crossing range after range, so the storm track and windward/leeward position matter.",
        caveat:
          "The same storm can be generous for one range and dry for the next.",
      },
      {
        indicator: "ENSO & jet-stream position",
        mechanism:
          "The northern and southern Rockies can respond in opposite ways.",
        caveat:
          "Don't explain the whole US Rockies with one ENSO relationship.",
      },
      {
        indicator: "Northwesterly orographic lift & snow-to-water ratio",
        mechanism:
          "In cold air, little moisture can still stack up as deep, light snow.",
        caveat: "Always distinguish snow depth from SWE.",
      },
    ],
  },
  canadian_interior: {
    summary:
      "Pacific moisture wrung out over successive ranges reloads and lifts again over the interior mountains.",
    factors: [
      {
        indicator: "Pacific moisture & passage over successive ranges",
        mechanism:
          "Moisture that crossed the coast ranges rises again over the interior ranges to make snow.",
        caveat: "How much moisture is lost along each path matters.",
      },
      {
        indicator: "Wind direction & range orientation",
        mechanism:
          "West, southwest or northwest winds give specific resorts a strong windward effect.",
        caveat:
          "A resort-by-resort wind composite is more useful than a regional average.",
      },
      {
        indicator: "ENSO / PNA & western-North-America circulation",
        mechanism:
          "Provides seasonal-scale temperature and storm-track background.",
        caveat:
          "Individual storms are set directly by short-term lows and moisture transport.",
      },
    ],
  },
  na_east: {
    summary:
      "Coastal 'Nor'easters' pairing Atlantic moisture with inland cold — plus lake-effect snow in places.",
    factors: [
      {
        indicator: "Nor'easter track & coastal cyclogenesis",
        mechanism:
          "Heavy snow comes when Atlantic moisture meets inland cold air.",
        caveat:
          "A small shift in the low's track hugely changes the snow / rain / ice split.",
      },
      {
        indicator: "Arctic Oscillation (AO) / NAO & cold-air supply",
        mechanism: "Sets whether cold air can lodge over the east.",
        caveat:
          "A negative index doesn't always mean big snow — you still need moisture and the right storm track.",
      },
      {
        indicator: "Lake-effect & low-level thermal structure",
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
        indicator: "Southern-Ocean lows & westerly-belt position",
        mechanism:
          "Westerly fronts and lows supply precipitation to the Southern Alps.",
        caveat:
          "West-windward and eastern resorts respond differently.",
      },
      {
        indicator: "Southern Annular Mode (SAM) & ENSO",
        mechanism:
          "A background for north–south shifts of the SH westerlies and circulation around New Zealand.",
        caveat:
          "Effects vary by region and season — not a standalone predictor.",
      },
      {
        indicator: "Snow-line height & Foehn effect",
        mechanism:
          "Eastern resorts can see air dry and warm as it crosses the Alps.",
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
        indicator: "Southern-Ocean cold fronts & southwesterly flow",
        mechanism:
          "The main natural-snow events come when cold air and moisture arrive together.",
        caveat:
          "Cold air alone, without moisture, gives limited snow.",
      },
      {
        indicator: "SAM, ENSO & the Indian Ocean Dipole (IOD)",
        mechanism:
          "These can shape southeast-Australian precipitation and temperature.",
        caveat:
          "The signal depends on season and the combination of indices — don't use one index.",
      },
      {
        indicator: "Wet-bulb temperature & low resort elevations",
        mechanism:
          "Small temperature changes strongly affect rain versus snow.",
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
        indicator: "Southeast Pacific storm track & westerlies",
        mechanism:
          "Winter lows and fronts reaching the Andes bring the main snowfall.",
        caveat: "The storm belt's north–south position matters.",
      },
      {
        indicator: "ENSO & southeast-Pacific circulation",
        mechanism:
          "Some El Niño winters tend to be wetter in central Chile.",
        caveat:
          "Not every El Niño means a big season — this is a statistical tendency, not a rule.",
      },
      {
        indicator: "Elevation temperature & extreme interannual variability",
        mechanism: "The Andes have very large year-to-year swings.",
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
        indicator: "SH westerlies & South Pacific storms",
        mechanism:
          "Westerlies make strong orographic precipitation on the west slopes, while the east can sit in a strong rain shadow.",
        caveat:
          "West- and east-side resorts are almost different climates.",
      },
      {
        indicator: "SAM & storm-belt latitude",
        mechanism:
          "As the westerlies shift north and south, storm frequency and precipitation location change.",
        caveat: "Account for latitude-dependent responses.",
      },
      {
        indicator: "Pacific moisture, temperature & wind direction",
        mechanism:
          "Snowfall depends on moisture inflow plus cold air and the wind's angle to the range.",
        caveat:
          "Correlation with any single index is weaker than the direct storm-by-storm setup.",
      },
    ],
  },
  tien_shan: {
    summary:
      "Westerly disturbances bring limited but cold moisture far from any ocean; low temperatures keep the snow light.",
    factors: [
      {
        indicator: "Westerly anomalies & Central Asian lows",
        mechanism:
          "Moisture and lows arriving from the west are the main snow source.",
        caveat:
          "Far from oceans, moisture pathways are limited.",
      },
      {
        indicator: "North Atlantic / Eurasian teleconnections & the jet stream",
        mechanism:
          "Large-scale circulation can steer Central Asian storm tracks.",
        caveat:
          "Reading 500 hPa heights and moisture transport directly beats any single index.",
      },
      {
        indicator: "Tien Shan orographic lift & extreme cold",
        mechanism: "Low temperatures make low-density snow.",
        caveat:
          "But with limited moisture, snowfall frequency and snow depth are separate questions.",
      },
    ],
  },
  east_asia: {
    summary:
      "The East Asian winter monsoon supplies cold northwesterly flow; the seas add moisture and passing lows can broaden snowfall.",
    factors: [
      {
        indicator: "East Asian winter monsoon & northwesterly flow",
        mechanism:
          "The Siberian High and East Asian pressure pattern supply cold air and wind.",
        caveat:
          "Korea's east coast and inland resorts respond differently.",
      },
      {
        indicator: "Sea of Japan / Yellow Sea moisture & sea-air difference",
        mechanism:
          "Snow clouds forming over the seas drop snow on particular coasts and mountains depending on wind direction.",
        caveat: "Read SST together with low-level cold.",
      },
      {
        indicator: "Southern-sea / East China Sea low tracks",
        mechanism:
          "Traveling lows can bring broad natural snow.",
        caveat:
          "Depending on the low's track it can be rain, snow or dry.",
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
