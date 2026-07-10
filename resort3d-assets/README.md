# resort3d assets (synced copies — do not edit here)

Byte-identical snapshots of the canonical files in the iOS repo
(`StancePro/StancePro/Resources/web/`), which the iOS/Android apps load in
their 3D WebViews. The web route `app/resort-3d/[resortId]/view/route.ts`
performs the same host-side assembly the apps do (token substitution + inline
lib injection — see `Resort3DPreviewView.swift`).

- `resort3d.html` — the 3D terrain engine page (tokens: `__RESORT_ID__`,
  `__RESORT_NAME__`, `__LANG__`, `__CACHE_VER__`, `__NEARBY__`,
  `__MAPLIBRE_CSS__`, `__MAPLIBRE_JS__`, `__THREE_JS__`)
- `maplibre-gl.js` / `maplibre-gl.css` — PINNED maplibre-gl@4.7.1
- `three.min.js` — PINNED three@0.160.0

Do NOT bump the library versions and do NOT load them from a CDN — the tile
router and terrain behaviour are validated against these exact bytes (see the
comment block at the top of resort3d.html). When the iOS copy changes, re-copy
all four files from the iOS repo and verify `md5` matches.
