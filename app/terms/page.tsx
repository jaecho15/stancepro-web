import { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@supabase/supabase-js";

export const metadata: Metadata = {
  title: "Terms of Service - StancePro",
  description: "StancePro Terms of Service - Rules and guidelines for using our service.",
};

type LegalDocument = {
  id: number;
  document_key: string;
  version: string;
  title: string;
  summary: string | null;
  content: string;
  effective_at: string | null;
  published_at: string | null;
  updated_at: string | null;
};

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ryiitcblrrqvjvxkobpf.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

async function getCurrentTermsDocument(): Promise<LegalDocument | null> {
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from("legal_documents")
    .select("id, document_key, version, title, summary, content, effective_at, published_at, updated_at")
    .eq("document_key", "terms_of_service")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function TermsUnavailablePage() {
  return (
    <div className="container mx-auto px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <p className="text-slate-300 mb-3">
            The current Terms of Service are temporarily unavailable.
          </p>
          <p className="text-slate-400">
            Please try again shortly. If you need a copy immediately, contact{" "}
            <a href="mailto:admin@stance-pro.com" className="text-brand-400 hover:underline">
              admin@stance-pro.com
            </a>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function TermsPage() {
  noStore();
  const document = await getCurrentTermsDocument();

  if (!document) {
    return <TermsUnavailablePage />;
  }

  return (
    <div className="container mx-auto px-6 py-20">
      <div className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-4xl font-bold mb-8">{document.title}</h1>
        <div className="not-prose rounded-2xl border border-slate-800 bg-slate-900/60 p-5 mb-8">
          <p className="text-slate-400 mb-2">
            Effective date: {formatDate(document.effective_at) ?? "Not set"}
          </p>
          <p className="text-slate-400 mb-2">Version: {document.version}</p>
          {document.summary ? (
            <p className="text-slate-300">{document.summary}</p>
          ) : null}
        </div>

        <div className="not-prose whitespace-pre-wrap text-slate-300 leading-7">
          {document.content}
        </div>
      </div>
    </div>
  );
}







