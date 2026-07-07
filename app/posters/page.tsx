const POSTERS = [
  { slug: "carve", label: "Carve — hero" },
  { slug: "powder", label: "Powder — hero" },
  { slug: "setup", label: "Setup — feature" },
  { slug: "coaching", label: "Coaching — feature" },
  { slug: "ride_nav", label: "Ride nav — feature" },
] as const;

const POSTER_ASSET_VERSION = "20260707-stamp-position";

export default function PostersGalleryPage() {
  return (
    <main className="min-h-screen bg-[#0f1c40] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
            StancePro marketing
          </p>
          <h1 className="text-3xl font-bold">Poster previews</h1>
          <p className="text-slate-300">
            Official 5-poster set (preview PNGs). Internal review with ratings
            lives at{" "}
            <a href="/internal/brand-review" className="text-sky-300 underline">
              /internal/brand-review
            </a>
            .
          </p>
        </header>

        <div className="grid gap-10">
          {POSTERS.map(({ slug, label }) => (
            <section key={slug} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-200">{label}</h2>
              <a
                href={`/brand-review/posters/poster_${slug}_preview.png?v=${POSTER_ASSET_VERSION}`}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-lg"
              >
                <img
                  src={`/brand-review/posters/poster_${slug}_preview.png?v=${POSTER_ASSET_VERSION}`}
                  alt={label}
                  className="h-auto w-full"
                  loading={slug === "carve" ? "eager" : "lazy"}
                />
              </a>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
