import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";

// Lesson clip share page — the link an instructor pastes into the lesson's
// group chat. Students watch original-quality clips with no app and no login.
//
// The token is the credential: 256 bits, single row lookup, service-role
// signing per view. The bucket stays private and signed URLs live 1 hour —
// the page being open is what grants playback, not anything cacheable.
//
// Deliberately NOT indexable and NO og:image: these links travel through
// chats, and lesson videos are frequently of children. A pasted link must
// never surface a child's face in a link preview or a search result.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lesson clips — StancePro",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Lesson clips",
    description: "Videos from your lesson, shared via StancePro.",
    images: [],
  },
};

type SharedClip = {
  id: string;
  videoUrl: string;
  downloadUrl: string | null;
  thumbUrl: string | null;
  capturedAt: string | null;
  durationMs: number | null;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveLink(token: string): Promise<SharedClip[] | "expired" | "missing"> {
  // Token shape gate before touching the database.
  if (!/^[0-9a-f]{64}$/.test(token)) return "missing";
  const supabase = adminClient();
  if (!supabase) return "missing";

  const { data: link } = await supabase
    .from("clip_share_links")
    .select("clip_ids, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return "missing";
  if (link.revoked_at || new Date(link.expires_at) < new Date()) return "expired";

  const { data: clips } = await supabase
    .from("ride_clips")
    .select("id, storage_path, thumbnail_path, captured_at, duration_ms")
    .in("id", link.clip_ids)
    .order("captured_at", { ascending: true, nullsFirst: false });
  if (!clips || clips.length === 0) return "expired";

  const signed: SharedClip[] = [];
  for (const clip of clips) {
    const { data: video } = await supabase.storage
      .from("ride-clips")
      .createSignedUrl(clip.storage_path, 3600);
    if (!video?.signedUrl) continue;
    // Separate URL with Content-Disposition: attachment — a visible Download
    // button, because long-pressing a <video> is not a control anyone finds.
    const { data: attachment } = await supabase.storage
      .from("ride-clips")
      .createSignedUrl(clip.storage_path, 3600, { download: true });
    let thumbUrl: string | null = null;
    if (clip.thumbnail_path) {
      const { data: thumb } = await supabase.storage
        .from("ride-clips")
        .createSignedUrl(clip.thumbnail_path, 3600);
      thumbUrl = thumb?.signedUrl ?? null;
    }
    signed.push({
      id: clip.id,
      videoUrl: video.signedUrl,
      downloadUrl: attachment?.signedUrl ?? null,
      thumbUrl,
      capturedAt: clip.captured_at,
      durationMs: clip.duration_ms,
    });
  }
  return signed.length > 0 ? signed : "expired";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default async function ClipSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await resolveLink(token);

  if (result === "missing" || result === "expired") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">
          {result === "expired" ? "This link has expired" : "Link not found"}
        </h1>
        <p className="text-sm opacity-70">
          Lesson clip links are temporary. Ask whoever shared it to send a new
          one — or find the clips in the StancePro app if you were tagged.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Lesson clips</h1>
        <p className="mt-1 text-sm opacity-70">
          {result.length} video{result.length === 1 ? "" : "s"}, original
          quality. This link expires — save what you want to keep.
        </p>
      </header>
      <div className="flex flex-col gap-6">
        {result.map((clip) => (
          <figure key={clip.id}>
            <video
              controls
              playsInline
              preload="metadata"
              poster={clip.thumbUrl ?? undefined}
              src={clip.videoUrl}
              className="w-full rounded-xl bg-black"
            />
            <figcaption className="mt-1 flex items-center justify-between text-xs">
              <span className="opacity-60">{timeLabel(clip.capturedAt)}</span>
              {clip.downloadUrl && (
                <a
                  href={clip.downloadUrl}
                  className="rounded-full border border-current px-3 py-1 opacity-80 hover:opacity-100"
                >
                  Download
                </a>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <footer className="mt-10 text-center text-xs opacity-50">
        Shared with StancePro — ride tracking and AI coaching for snow sports.
      </footer>
    </main>
  );
}
