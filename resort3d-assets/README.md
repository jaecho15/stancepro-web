# resort3d assets (synced copies — do not edit here)

Byte-identical snapshots of the canonical files in the iOS repo
(`StancePro/StancePro/Resources/web/`), which the iOS/Android apps load in
their 3D WebViews. The web route `app/resort-3d/[resortId]/view/route.ts`
performs the same host-side assembly the apps do (token substitution + inline
lib injection — see `Resort3DPreviewView.swift`).

- `resort3d.html` — the 3D terrain engine page (tokens: `__RESORT_ID__`,
  `__RESORT_NAME__`, `__LANG__`, `__CACHE_VER__`, `__NEARBY__`,
  `__MAPLIBRE_CSS__`, `__MAPLIBRE_JS__`, `__THREE_JS__`)

Web-host adaptation: the view route additionally appends a service-worker
registration snippet at serve time (public/resort3d-sw.js — tile cache-first;
Supabase Storage serves artifacts no-cache and browsers honour it, unlike
WKWebView). The stored file here stays byte-identical to the iOS commit.
- `maplibre-gl.js` / `maplibre-gl.css` — PINNED maplibre-gl@4.7.1
- `three.min.js` — PINNED three@0.160.0

Do NOT bump the library versions and do NOT load them from a CDN — the tile
router and terrain behaviour are validated against these exact bytes (see the
comment block at the top of resort3d.html).

**Sync from the COMMITTED iOS version, never the working tree** — the iOS
repo is shared-dirty across parallel sessions, and an uncommitted engine
draft shipped here once (2026-07-10: FATMAP-session edits caused woodgrain
hillshade banding on the web while the app, built from the committed file,
was clean). To sync:

    git -C ../StancePro show HEAD:StancePro/Resources/web/resort3d.html \
      > resort3d-assets/resort3d.html   # (repeat for the three lib files)

then verify each file's md5 equals `git show HEAD:...` — not the checkout.
Current snapshot: commit 01bc8a87 (face-the-mountain intro orbit; formerly
f9e09501 before an unpushed-range history rewrite — content verified
identical, all four files md5-matched against the new hash).
