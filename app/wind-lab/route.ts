import { readFile } from "node:fs/promises";
import path from "node:path";
import boundary from "./cardrona-boundary.json";

// A throwaway decision aid, not a product surface: it exists to answer whether
// a Windy-style wind field belongs in the short-range forecast detail card.
//
// It is served the same way `resort-3d/[resortId]/view` is — a plain HTML
// document with the VENDORED maplibre 4.7.1 inlined from `resort3d-assets/`.
// That is deliberate: adding maplibre-gl to package.json or pulling it from a
// CDN would break the offline-vendoring rule the 3D viewer depends on, and
// copying the pinned bytes into public/ would create a second copy to keep in
// sync. Reading the one vendored copy costs nothing and drifts with nothing.
//
// DEPLOY NOTE: to ship this on Vercel, `next.config.js` needs
//   outputFileTracingIncludes: { "/wind-lab": ["./resort3d-assets/**"] }
// or the serverless bundle will not carry maplibre-gl.js. It runs locally
// without that change because `next dev` reads straight from the repo.

const ASSET_DIR = path.join(process.cwd(), "resort3d-assets");
const PAGE = path.join(process.cwd(), "app", "wind-lab", "wind-lab.html");

// Token replacement MUST use the function form: the maplibre bundle contains
// `$&`-style sequences that String.replace would otherwise treat as
// replacement patterns and silently corrupt. Same trap the 3D route documents.
function sub(html: string, token: string, value: string): string {
  return html.replace(token, () => value);
}

// ~870 KB of inlined library never changes per request — but wind-lab.html is
// not a module, so editing it does NOT bust Next's dev reload. Memoising in
// development would serve a stale page for the life of the dev server (it did).
// Cache in production only.
const MEMOISE = process.env.NODE_ENV === "production";
let template: Promise<string> | null = null;
function loadTemplate(): Promise<string> {
  if (!MEMOISE) return buildTemplate();
  template ??= buildTemplate();
  return template;
}
function buildTemplate(): Promise<string> {
  return (async () => {
    const [html, css, maplibre] = await Promise.all([
      readFile(PAGE, "utf8"),
      readFile(path.join(ASSET_DIR, "maplibre-gl.css"), "utf8"),
      readFile(path.join(ASSET_DIR, "maplibre-gl.js"), "utf8"),
    ]);
    let out = sub(html, "__MAPLIBRE_CSS__", css);
    out = sub(out, "__MAPLIBRE_JS__", maplibre);
    out = sub(out, "__CARDRONA_RING__", JSON.stringify(boundary.ring));
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
        // No caching: this is a scratch page that gets edited while it is open.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    template = null; // don't memoise a failure
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`wind-lab assets missing: ${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
