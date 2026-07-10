import type { Metadata } from "next";
import { fetchSnowboardRules } from "@/lib/stance/fetch-rules";
import { StanceCalculatorClient } from "@/components/calculator/StanceCalculatorClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Snowboard Stance Calculator - Width, Binding Angles & Board Length | StancePro",
  description:
    "Calculate your ideal snowboard stance width, binding angles, board length and highback lean in seconds. The same science-backed engine as the StancePro app — free with a StancePro account.",
  keywords: [
    "snowboard stance calculator",
    "binding angle calculator",
    "stance width",
    "snowboard size calculator",
    "duck stance",
    "carving stance",
  ],
  alternates: {
    canonical: "/calculator",
  },
  openGraph: {
    title: "Snowboard Stance Calculator | StancePro",
    description:
      "Dial in stance width, binding angles and board length with the StancePro engine — free with a StancePro account.",
    url: "https://stance-pro.com/calculator",
  },
};

export default async function CalculatorPage() {
  const rules = await fetchSnowboardRules();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <section className="relative container mx-auto px-6 pt-28 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Snowboard <span className="gradient-text">Stance Calculator</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Your stance width, binding angles, board length and highback lean —
              computed by the same engine that powers the StancePro app.
            </p>
          </div>

          <StanceCalculatorClient rules={rules} />
        </div>
      </section>
    </div>
  );
}
