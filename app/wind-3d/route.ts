import { readFile } from "node:fs/promises";
import path from "node:path";
import boundary from "./cardrona-boundary.json";

// Companion to /wind-lab. Where that page argues about HORIZONTAL resolution,
// this one shows the VERTICAL axis: the 850 and 700 hPa wind sheets drawn at
// their true geopotential heights over the real Cardrona terrain, with the
// 1,860 m summit sitting between them.
//
// The sheets are deliberately FLAT. A 0.25 deg model does not resolve this
// mountain, so bending the flow over the ridge would depict a model we do not
// have (terrain_exposure_factor is still 1.0).
//
// Served like resort-3d/[resortId]/view: the VENDORED three.js r160 UMD build
// from resort3d-assets/ is inlined. Do not npm-install three or add a CDN tag.
//
// DEPLOY NOTE: for Vercel, next.config.js needs
//   outputFileTracingIncludes: { "/wind-3d": ["./resort3d-assets/**"] }
// `next dev` reads from the repo, so it works locally without that.

/// The web host is a single-resort preview; iOS passes this per resort.
const CARDRONA = {
  osm: "osm-way-482928467",
  name: "Cardrona",
  lon: 168.949,
  lat: -44.875,
  // bands.top from the map index — what the iOS caller injects (bands.max) and
  // what the forecast card shows. 1860 was a stale hand-typed value; the same
  // mountain must not have two summits in one product.
  summit: 1904,
  tz: "Pacific/Auckland",
};

const ASSET_DIR = path.join(process.cwd(), "resort3d-assets");
const PAGE = path.join(process.cwd(), "app", "wind-3d", "wind-3d.html");

// Function-form replacement: the three.js bundle contains `$&` sequences that
// String.replace would otherwise treat as replacement patterns.
function sub(html: string, token: string, value: string): string {
  return html.replace(token, () => value);
}

// wind-3d.html is not a module, so editing it does not bust Next's dev reload.
// Memoising in development would serve a stale page for the dev server's life.
const MEMOISE = process.env.NODE_ENV === "production";
let template: Promise<string> | null = null;
function loadTemplate(): Promise<string> {
  if (!MEMOISE) return buildTemplate();
  template ??= buildTemplate();
  return template;
}
function buildTemplate(): Promise<string> {
  return (async () => {
    const [html, three] = await Promise.all([
      readFile(PAGE, "utf8"),
      readFile(path.join(ASSET_DIR, "three.min.js"), "utf8"),
    ]);
    // The page is now the SAME FILE the iOS bundle ships
    // (StancePro/Resources/web/windsheet3d.html) — one source, two hosts. Keep
    // the injected shape in step with ShortRangeWindSheetResort.resortJSON().
    let out = sub(html, "__THREE_JS__", three);
    out = sub(out, "__RESORT__", JSON.stringify(CARDRONA));
    out = sub(out, "__RESORT_RING__", JSON.stringify(boundary.ring));
    return out;
  })();
}

export async function GET() {
  // Dev only. These two pages are prototypes that informed the D1-16 wind
  // decision, not product surfaces -- served publicly they would read as
  // "StancePro's wind screen" while the shipped product is band sustained wind
  // plus one near-surface gust. Returning early in production also means the
  // vendored resort3d-assets/ read below never runs there, so next.config.js
  // needs no outputFileTracingIncludes entry for these routes.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  try {
    const html = await loadTemplate();
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    template = null;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`wind-3d assets missing: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
