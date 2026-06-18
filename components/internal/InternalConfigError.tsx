export function InternalConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1c40] px-6 py-16">
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-bold text-white">Internal tools unavailable</h1>
        <p className="text-slate-300">
          Supabase is not configured for this deployment. Add{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-brand-200">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-brand-200">
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          </code>{" "}
          (or{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-brand-200">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>
          ) in Vercel, then redeploy.
        </p>
      </div>
    </div>
  );
}
