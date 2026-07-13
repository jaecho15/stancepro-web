import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchResortIndex } from "@/lib/snow/fetch";

// Serves the app's 3D terrain WebView page (resort3d.html) assembled exactly
// the way the native hosts do (see iOS Resort3DPreviewView.swift): substitute
// the small tokens, then inject the vendored maplibre/three libs inline.
// The engine page itself fetches terrain artifacts from public Supabase
// Storage and falls back gracefully, so the browser needs nothing else.

const ASSET_DIR = path.join(process.cwd(), "resort3d-assets");
const STORAGE_BASE = "https://ryiitcblrrqvjvxkobpf.supabase.co/storage/v1/object/public/ride-tracker-static";

// Token replacement MUST use the function form: the library sources (and
// resort names) can contain `$&`-style sequences that String.replace would
// otherwise interpret as replacement patterns and corrupt the output.
function sub(html: string, token: string, value: string): string {
  return html.replace(token, () => value);
}

// The heavy part (page + ~1.5 MB of inlined libs) never changes per request.
let libTemplate: Promise<string> | null = null;
function loadLibTemplate(): Promise<string> {
  libTemplate ??= (async () => {
    const [html, css, maplibre, three] = await Promise.all([
      readFile(path.join(ASSET_DIR, "resort3d.html"), "utf8"),
      readFile(path.join(ASSET_DIR, "maplibre-gl.css"), "utf8"),
      readFile(path.join(ASSET_DIR, "maplibre-gl.js"), "utf8"),
      readFile(path.join(ASSET_DIR, "three.min.js"), "utf8"),
    ]);
    let out = sub(html, "__MAPLIBRE_CSS__", css);
    out = sub(out, "__MAPLIBRE_JS__", maplibre);
    out = sub(out, "__THREE_JS__", three);
    return out;
  })();
  return libTemplate;
}

// Same cache-busting semantics as the app: the offpiste manifest's
// generated_at. The page falls back to an hourly bucket if this is empty.
// The manifest is ~2.3 MB (over Next's 2 MB fetch-cache limit), so cache just
// the version string in module scope instead of caching the fetch.
let versionCache: { value: string; at: number } | null = null;
async function cacheVersion(): Promise<string> {
  if (versionCache && Date.now() - versionCache.at < 3600_000) {
    return versionCache.value;
  }
  try {
    const res = await fetch(`${STORAGE_BASE}/terrain_offpiste_v1/manifest.json`, {
      cache: "no-store",
    });
    if (!res.ok) return versionCache?.value ?? "";
    const manifest = (await res.json()) as { generated_at?: string };
    versionCache = { value: manifest.generated_at ?? "", at: Date.now() };
    return versionCache.value;
  } catch {
    return versionCache?.value ?? "";
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const stripMarkup = (s: string) => s.replace(/[<>]/g, "");

// Nearby resorts (≤50 km, nearest 30) as {n, la, lo} — the same payload the
// iOS host injects so the 3D scene shows neighbouring resort pins.
async function nearbyJSON(resortId: string): Promise<string> {
  try {
    const index = await fetchResortIndex();
    const self = index.find((r) => r.resort_id === resortId);
    if (!self) return "[]";
    const nearby = index
      .filter((r) => r.resort_id !== resortId)
      .map((r) => ({ r, km: haversineKm(self.lat, self.lon, r.lat, r.lon) }))
      .filter((x) => x.km <= 50)
      .sort((a, b) => a.km - b.km)
      .slice(0, 30)
      // `id` is REQUIRED: the engine's loadVisibleNeighbors gates on `r.id`
      // (and builds the neighbour artifact URL from it), so omitting it meant
      // loadNeighbor never ran on the web — neighbours got no shading/contours
      // drape, only the focused resort's over-harvested lines bleeding in.
      .map((x) => ({ id: x.r.resort_id, n: stripMarkup(x.r.display_name), la: x.r.lat, lo: x.r.lon }));
    return JSON.stringify(nearby);
  } catch {
    return "[]";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resortId: string }> }
) {
  const { resortId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(resortId)) {
    return new Response("invalid resort id", { status: 400 });
  }

  const name = stripMarkup(
    new URL(request.url).searchParams.get("name") ?? ""
  );

  const [template, version, nearby] = await Promise.all([
    loadLibTemplate(),
    cacheVersion(),
    nearbyJSON(resortId),
  ]);

  let html = sub(template, "__RESORT_ID__", resortId);
  html = sub(html, "__LANG__", "en");
  html = sub(html, "__RESORT_NAME__", name);
  html = sub(html, "__CACHE_VER__", version);
  html = sub(html, "__NEARBY__", nearby);
  // Web-host adaptation (serve-time only; the stored engine file stays
  // byte-identical to iOS): register the tile-caching service worker —
  // Supabase Storage serves artifacts `no-cache`, and unlike WKWebView the
  // browser honours it, refetching tiles on every pan/zoom (see
  // public/resort3d-sw.js).
  html = sub(
    html,
    "</body>",
    `<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/resort3d-sw.js").catch(function(){});</script></body>`
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
