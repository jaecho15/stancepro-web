import type { Metadata } from "next";
import { fetchSkiRules, fetchSnowboardRules } from "@/lib/stance/fetch-rules";
import { CalculatorTabs } from "@/components/calculator/CalculatorTabs";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ski & Snowboard Stance Calculator - Width, Angles, Length & DIN | StancePro",
  description:
    "Calculate your ideal snowboard stance width, binding angles and board length — or your ski length, mount point and DIN reference range. The same science-backed engine as the StancePro app — free with a StancePro account.",
  keywords: [
    "snowboard stance calculator",
    "binding angle calculator",
    "stance width",
    "snowboard size calculator",
    "ski size calculator",
    "ski length calculator",
    "DIN calculator",
    "ski binding mount point",
    "duck stance",
    "carving stance",
  ],
  alternates: {
    canonical: "/calculator",
  },
  openGraph: {
    title: "Ski & Snowboard Stance Calculator | StancePro",
    description:
      "Dial in your snowboard stance or ski length, mount point and DIN reference with the StancePro engine — free with a StancePro account.",
    url: "https://stance-pro.com/calculator",
  },
};

export default async function CalculatorPage() {
  const [snowboardRules, skiRules] = await Promise.all([
    fetchSnowboardRules(),
    fetchSkiRules(),
  ]);

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
              Ski &amp; Snowboard <span className="gradient-text">Stance Calculator</span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Snowboard stance width, binding angles and board length — or ski
              length, mount point and DIN reference — computed by the same
              engine that powers the StancePro app.
            </p>
          </div>

          <CalculatorTabs snowboardRules={snowboardRules} skiRules={skiRules} />
        </div>
      </section>
    </div>
  );
}
