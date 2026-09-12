"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Award,
  Banknote,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileSignature,
  Inbox,
  Languages,
  MonitorPlay,
  PauseCircle,
  PenLine,
  ShieldCheck,
  Timer,
  Video,
  Wallet,
} from "lucide-react";

type Lang = "en" | "ko";

const SHOTS = "/screenshots/coach";

/** Chevron-marked list — the house bullet for this page. */
function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p} className="flex gap-2.5 text-slate-400">
          <ChevronRight
            className="mt-[0.3rem] h-3.5 w-3.5 shrink-0 text-brand-400"
            aria-hidden="true"
          />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

/** Phone-shaped frame for an app screenshot. */
function Shot({
  src,
  alt,
  caption,
  tall = true,
}: {
  src: string;
  alt: string;
  caption: string;
  tall?: boolean;
}) {
  return (
    <figure className="flex flex-col items-center">
      <div
        className={`overflow-hidden rounded-[2rem] border border-white/10 bg-mountain-950 shadow-2xl shadow-black/40 ${
          tall ? "w-full max-w-[260px]" : "w-full max-w-[460px] rounded-2xl"
        }`}
      >
        <img src={src} alt={alt} className="block h-auto w-full" loading="lazy" />
      </div>
      <figcaption className="mt-4 max-w-[280px] text-center text-sm text-slate-400">
        {caption}
      </figcaption>
    </figure>
  );
}

function Section({
  eyebrow,
  title,
  accent,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative container mx-auto px-6 py-20 md:py-24">
      <div className="mb-12 max-w-3xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-brand-400">
          {eyebrow}
        </p>
        <h2 className="mb-4 text-3xl font-bold md:text-4xl">
          {title} {accent ? <span className="gradient-text">{accent}</span> : null}
        </h2>
        {lede ? <p className="text-lg text-slate-400">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Card({
  icon: Icon,
  title,
  points,
  from,
  to,
}: {
  icon: React.ElementType;
  title: string;
  points: readonly string[];
  from: string;
  to: string;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${from} ${to}`}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mb-3 text-xl font-semibold">{title}</h3>
      <Points items={points} />
    </div>
  );
}

/** One lane of the money flow: boxes joined by arrows, stacking on mobile. */
function FlowLane({
  label,
  accent,
  nodes,
}: {
  label: string;
  accent: string;
  nodes: readonly { title: string; body: string }[];
}) {
  return (
    <div>
      <p className={`mb-3 text-xs font-semibold uppercase tracking-widest ${accent}`}>
        {label}
      </p>
      <ol className="flex flex-col gap-3 md:flex-row md:items-stretch">
        {nodes.map((n, i) => (
          <li
            key={n.title}
            className="flex flex-1 flex-col items-stretch gap-3 md:flex-row"
          >
            <div className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-1 text-sm font-semibold text-white">{n.title}</p>
              <p className="text-sm leading-relaxed text-slate-400">{n.body}</p>
            </div>
            {i < nodes.length - 1 ? (
              <>
                <ArrowDown
                  className="h-5 w-5 shrink-0 self-center text-brand-400/70 md:hidden"
                  aria-hidden="true"
                />
                <ArrowRight
                  className="hidden h-5 w-5 shrink-0 self-center text-brand-400/70 md:block"
                  aria-hidden="true"
                />
              </>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Numbered step for the application walkthrough. */
function Step({
  n,
  title,
  points,
}: {
  n: number;
  title: string;
  points: readonly string[];
}) {
  return (
    <li className="relative pl-14">
      <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-brand-300">
        {n}
      </span>
      <h3 className="mb-3 pt-1.5 text-lg font-semibold">{title}</h3>
      <Points items={points} />
    </li>
  );
}

export function CoachesContent() {
  const [lang, setLang] = useState<Lang>("en");
  const t = COPY[lang];

  return (
    <div className="relative overflow-hidden">
      {/* decorative orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -right-24 top-72 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl" />
      </div>

      {/* language toggle */}
      <div className="relative container mx-auto flex justify-end px-6 pt-8">
        <div className="glass inline-flex rounded-full p-1" role="group" aria-label="Language">
          {(["en", "ko"] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                lang === code
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {code === "en" ? "English" : "한국어"}
            </button>
          ))}
        </div>
      </div>

      {/* hero */}
      <section className="relative container mx-auto px-6 pb-16 pt-12">
        <div className="mx-auto max-w-4xl text-center">
          <span className="glass mb-6 inline-block rounded-full px-4 py-1.5 text-sm text-slate-300">
            {t.hero.eyebrow}
          </span>
          <h1 className="mb-6 text-4xl font-bold md:text-6xl">
            {t.hero.title} <span className="gradient-text">{t.hero.accent}</span>
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-400">{t.hero.lede}</p>
        </div>
      </section>

      {/* what riders send */}
      <Section
        eyebrow={t.request.eyebrow}
        title={t.request.title}
        accent={t.request.accent}
        lede={t.request.lede}
      >
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-6 md:grid-cols-2">
            {t.request.cards.map((c, i) => (
              <Card
                key={c.title}
                icon={[Video, ClipboardList, Languages, Timer][i]}
                title={c.title}
                points={c.points}
                from={["from-brand-500", "from-indigo-500", "from-purple-500", "from-sky-500"][i]}
                to={["to-brand-600", "to-indigo-600", "to-purple-600", "to-sky-600"][i]}
              />
            ))}
          </div>
          <Shot
            src={`${SHOTS}/rider-entry-lanes.webp`}
            alt={t.request.shotAlt}
            caption={t.request.shotCaption}
            tall={false}
          />
        </div>
      </Section>

      {/* how work reaches you */}
      <Section
        eyebrow={t.routing.eyebrow}
        title={t.routing.title}
        accent={t.routing.accent}
        lede={t.routing.lede}
      >
        <div className="grid items-start gap-12 lg:grid-cols-[auto_1fr]">
          <Shot
            src={`${SHOTS}/coach-request-modes.webp`}
            alt={t.routing.shotAlt}
            caption={t.routing.shotCaption}
          />
          <div className="grid gap-6 md:grid-cols-2">
            {t.routing.cards.map((c, i) => (
              <Card
                key={c.title}
                icon={[Inbox, BadgeCheck, Timer, ShieldCheck][i]}
                title={c.title}
                points={c.points}
                from={["from-brand-500", "from-emerald-500", "from-amber-500", "from-rose-500"][i]}
                to={["to-brand-600", "to-emerald-600", "to-amber-600", "to-rose-600"][i]}
              />
            ))}
          </div>
        </div>
      </Section>

      {/* applying */}
      <Section
        eyebrow={t.apply.eyebrow}
        title={t.apply.title}
        accent={t.apply.accent}
        lede={t.apply.lede}
      >
        <ol className="mb-14 grid gap-10 md:grid-cols-2">
          {t.apply.steps.map((s, i) => (
            <Step key={s.title} n={i + 1} title={s.title} points={s.points} />
          ))}
        </ol>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <Shot
            src={`${SHOTS}/coach-application-profile.webp`}
            alt={t.apply.shots[0].alt}
            caption={t.apply.shots[0].caption}
          />
          <Shot
            src={`${SHOTS}/coach-application-associations.webp`}
            alt={t.apply.shots[1].alt}
            caption={t.apply.shots[1].caption}
          />
          <Shot
            src={`${SHOTS}/coach-application-certificate.webp`}
            alt={t.apply.shots[2].alt}
            caption={t.apply.shots[2].caption}
          />
          <Shot
            src={`${SHOTS}/coach-application-contract.webp`}
            alt={t.apply.shots[3].alt}
            caption={t.apply.shots[3].caption}
          />
        </div>
      </Section>

      {/* after approval */}
      <Section
        eyebrow={t.approval.eyebrow}
        title={t.approval.title}
        accent={t.approval.accent}
        lede={t.approval.lede}
      >
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-6 md:grid-cols-2">
            {t.approval.cards.map((c, i) => (
              <Card
                key={c.title}
                icon={[Award, Wallet, CalendarClock, FileSignature][i]}
                title={c.title}
                points={c.points}
                from={["from-brand-500", "from-emerald-500", "from-indigo-500", "from-slate-500"][i]}
                to={["to-brand-600", "to-emerald-600", "to-indigo-600", "to-slate-600"][i]}
              />
            ))}
          </div>
          <Shot
            src={`${SHOTS}/coach-payout.webp`}
            alt={t.approval.shotAlt}
            caption={t.approval.shotCaption}
          />
        </div>
      </Section>

      {/* the work itself */}
      <Section
        eyebrow={t.work.eyebrow}
        title={t.work.title}
        accent={t.work.accent}
        lede={t.work.lede}
      >
        <div className="mb-14 grid gap-10 md:grid-cols-2">
          <Shot
            src={`${SHOTS}/coach-sessions.webp`}
            alt={t.work.shots[0].alt}
            caption={t.work.shots[0].caption}
          />
          <Shot
            src={`${SHOTS}/coach-review-tools.webp`}
            alt={t.work.shots[1].alt}
            caption={t.work.shots[1].caption}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {t.work.cards.map((c, i) => (
            <Card
              key={c.title}
              icon={[MonitorPlay, PenLine, Award][i]}
              title={c.title}
              points={c.points}
              from={["from-brand-500", "from-purple-500", "from-amber-500"][i]}
              to={["to-brand-600", "to-purple-600", "to-amber-600"][i]}
            />
          ))}
        </div>
      </Section>

      {/* getting paid */}
      <Section
        eyebrow={t.pay.eyebrow}
        title={t.pay.title}
        accent={t.pay.accent}
        lede={t.pay.lede}
      >
        {/* where the lesson fee goes, end to end */}
        <div className="glass mb-12 space-y-8 rounded-2xl p-6 md:p-8">
          <FlowLane
            label={t.pay.flow.riderLabel}
            accent="text-purple-300"
            nodes={t.pay.flow.riderNodes}
          />
          <FlowLane
            label={t.pay.flow.coachLabel}
            accent="text-brand-300"
            nodes={t.pay.flow.coachNodes}
          />
          <p className="flex items-start gap-2.5 border-t border-white/10 pt-6 text-sm text-slate-400">
            <PauseCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <span>{t.pay.flow.note}</span>
          </p>
        </div>

        <div className="grid items-start gap-12 lg:grid-cols-[auto_1fr]">
          <Shot
            src={`${SHOTS}/coach-earnings.webp`}
            alt={t.pay.shotAlt}
            caption={t.pay.shotCaption}
          />
          <div className="grid gap-6 md:grid-cols-2">
            {t.pay.cards.map((c, i) => (
              <Card
                key={c.title}
                icon={[Banknote, ShieldCheck][i]}
                title={c.title}
                points={c.points}
                from={["from-emerald-500", "from-amber-500"][i]}
                to={["to-emerald-600", "to-amber-600"][i]}
              />
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <section className="relative container mx-auto px-6 py-24">
        <div className="glass mx-auto max-w-4xl rounded-3xl p-8 text-center md:p-12">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">{t.cta.title}</h2>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-slate-400">{t.cta.body}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/download"
              className="rounded-full bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3 font-medium text-white transition-all hover:from-brand-400 hover:to-brand-500"
            >
              {t.cta.primary}
            </Link>
            <Link
              href="/coach-contract"
              className="glass rounded-full px-6 py-3 font-medium text-white transition-all hover:bg-white/10"
            >
              {t.cta.secondary}
            </Link>
          </div>
          <p className="mt-8 text-sm text-slate-500">{t.cta.note}</p>
        </div>
        <p className="mx-auto mt-8 max-w-4xl text-center text-xs text-slate-600">
          {t.disclaimer}
        </p>
      </section>
    </div>
  );
}

const COPY = {
  en: {
    hero: {
      eyebrow: "Coaching on StancePro",
      title: "Your coaching,",
      accent: "on every mountain",
      lede:
        "Riders film a run, send it to a coach, and get it back with your voice over it and your lines drawn on it. Here is exactly how applying, getting set up, and coaching work — no guesswork.",
    },
    request: {
      eyebrow: "What lands in your queue",
      title: "A short clip and",
      accent: "the rider's context",
      lede:
        "Coach Feedback is its own request type, not something that happens after an AI pass. Most requests come straight to a coach.",
      cards: [
        {
          title: "One clip, 30 seconds max",
          points: [
            "A single clip from the rider's phone library",
            "The 30-second cap is enforced on iOS and Android before sending",
            "No in-app camera in the request flow",
          ],
        },
        {
          title: "What they want looked at",
          points: [
            "A short objective and a free-text description",
            "Sport: snowboard or ski",
            "Discipline: Riding, Jump-Spin or Jibbing",
          ],
        },
        {
          title: "Their setup and language",
          points: [
            "Their saved stance setup",
            "Their saved gear setup",
            "A \"Rider prefers\" line for the languages they want feedback in",
          ],
        },
        {
          title: "A one-day expectation",
          points: [
            "The Coach Feedback lane is presented to riders as \"Within a day\"",
            "They arrive expecting a returned video, not a chat",
          ],
        },
      ],
      shotAlt: "The rider's three request lanes: Self Analysis, AI Analysis and Coach Feedback",
      shotCaption:
        "Riders choose between three separate lanes. Coach Feedback routes to a human coach directly.",
    },
    routing: {
      eyebrow: "How work reaches you",
      title: "You decide",
      accent: "how much comes in",
      lede:
        "Riders either let the platform match them or pick you by name. You control which of those you are open to, and you can close the tap entirely.",
      cards: [
        {
          title: "Three availability states",
          points: [
            "Open to Requests — you take queue offers",
            "Direct Request Only — just riders who choose you",
            "Off Duty — nothing comes in at all",
          ],
        },
        {
          title: "Offers go to one coach at a time",
          points: [
            "Auto-assign is not a broadcast",
            "The server offers a session to a single coach",
            "It only moves on if you pass or the window runs out",
          ],
        },
        {
          title: "Two hours to answer, either way",
          points: [
            "Each auto-assign offer holds for 120 minutes",
            "A direct request gives you the same 120 minutes",
            "A reminder push lands before it lapses — 15 minutes out on a queue offer, 10 on a direct request",
          ],
        },
        {
          title: "Turnaround, not popularity",
          points: [
            "Fewest sessions claimed in the last 24 hours",
            "Then fastest average response time",
            "Then longest since your last claim",
            "Star rating is not part of the ordering",
            "You hold at most 3 active sessions — 2 for Advanced Coaching",
          ],
        },
      ],
      shotAlt: "Request Status screen with Open to Requests, Direct Request Only and Off Duty",
      shotCaption: "Your own switch, in My Earnings → Request Status.",
    },
    apply: {
      eyebrow: "Applying",
      title: "One form,",
      accent: "and a real sample review",
      lede:
        "Everything is inside the app: Coaching tab → Become a Coach. The sample recording is the part that actually shows us how you coach.",
      steps: [
        {
          title: "Your credentials",
          points: [
            "Years of coaching experience",
            "At least one certificate: sport, association, level and year",
            "An Examiner toggle if you hold examiner-equivalent status",
            "A photo of the certificate itself as proof",
            "Levels run 1 to 3, plus Trainer/Examiner",
          ],
        },
        {
          title: "How you coach",
          points: [
            "Specialties: Freestyle, Freeride, Powder, Park, Backcountry, Alpine/Carving, Beginner Instruction, Advanced Techniques",
            "Every language you can coach in",
            "A short bio riders will read before choosing you",
          ],
        },
        {
          title: "Record a sample review",
          points: [
            "Pick one of our sample clips",
            "Coach the rider as if they were your client",
            "Deliver it through the same Complete Review form real coaches use",
            "One recording per sport your certificates cover",
          ],
        },
        {
          title: "Accept the agreement and submit",
          points: [
            "Accepting the current Coach Services Agreement is required to submit",
            "An admin cannot approve an application without it",
            "If an application is turned down, edit and resubmit it in place",
          ],
        },
      ],
      shots: [
        {
          alt: "Certifications and specialties in the coach application",
          caption: "Certificates, specialties and languages sit on one form.",
        },
        {
          alt: "List of accepted certifying associations",
          caption:
            "AASI, APSI, BASI, CASI, ESF, KSBA, SAJ, SBINZ, Swiss Snowsports — or Other.",
        },
        {
          alt: "Adding a certificate with sport, association, level and year",
          caption: "Each certificate needs a photo of the certificate as proof.",
        },
        {
          alt: "Bio and Coach Services Agreement section",
          caption: "The agreement is a hard gate on submitting.",
        },
      ],
    },
    approval: {
      eyebrow: "After approval",
      title: "One more step before",
      accent: "riders can see you",
      lede:
        "Approval sets your coaching level. Your payout account is what actually switches you on.",
      cards: [
        {
          title: "Your level decides your tiers",
          points: [
            "An admin reviews your application and approves you at a level",
            "Advanced Coaching requests route only to trainer/examiner-level coaches",
          ],
        },
        {
          title: "Payout setup is the real gate",
          points: [
            "Until it is ready you do not appear in the rider's coach picker",
            "You cannot claim queue work either",
            "Approval sends you straight to that screen",
          ],
        },
        {
          title: "42 payout countries",
          points: [
            "You choose your bank country and currency",
            "The form is fetched per country rather than hard-coded",
            "So you fill in the fields your country actually uses",
          ],
        },
        {
          title: "Contract stays current",
          points: [
            "Your acceptance is tracked against the live agreement version",
            "The full text is always readable on this site",
          ],
        },
      ],
      shotAlt: "Payout account and contract status in My Earnings",
      shotCaption: "Contract status and payout account, both visible in My Earnings.",
    },
    work: {
      eyebrow: "Coaching a session",
      title: "Sixteen hours,",
      accent: "and a real toolkit",
      lede:
        "Once you accept, the session is yours for 16 hours. Miss that and it goes back to the queue.",
      shots: [
        {
          alt: "My Coaching Sessions list",
          caption: "Everything you have taken on, in one list.",
        },
        {
          alt: "Coach recording a review with drawing tools and captions",
          caption:
            "Draw over the video while you talk. Captions are generated from your own voice.",
        },
      ],
      cards: [
        {
          title: "Review the way you'd review in person",
          points: [
            "Play, pause and step frame by frame",
            "Draw on the video while you talk",
            "Record your voice over the clip",
            "Show your front camera alongside it",
            "Toggle a pose overlay",
          ],
        },
        {
          title: "A draft from your own words",
          points: [
            "Captions are generated from your voice",
            "Turn those captions and your annotations into a structured written draft",
            "Edit it before anything goes out",
          ],
        },
        {
          title: "Move riders forward",
          points: [
            "Attach a video or a Training Media clip",
            "Award coach-verified milestones on the rider's progression map",
          ],
        },
      ],
    },
    pay: {
      eyebrow: "Getting paid",
      title: "A fixed amount,",
      accent: "per delivered session",
      lede:
        "No bidding, no negotiating, no revenue share. The rate is set by the request tier and is the same for every coach. Here is the whole path a lesson fee takes.",
      flow: {
        riderLabel: "Rider side",
        riderNodes: [
          {
            title: "Credits",
            body: "Riders buy a credit pack, or get bonus credits included with a Pro plan.",
          },
          {
            title: "A request",
            body: "They choose Coaching or Advanced Coaching. The credits are spent as the request is created.",
          },
        ],
        coachLabel: "Your side",
        coachNodes: [
          {
            title: "You deliver",
            body: "Submitting your review books your payout the same moment, as pending.",
          },
          {
            title: "Approved",
            body: "The rider accepts your response, or 24 hours pass with no dispute.",
          },
          {
            title: "Queued",
            body: "It queues against the bank account you verified during setup.",
          },
          {
            title: "Paid out",
            body: "StancePro sends the transfer. The sending fee is not taken out of your amount.",
          },
        ],
        note:
          "Two things can hold this up: a rider dispute pauses approval until it is resolved, and without a ready payout account the amount waits instead of queueing. Transfers are initiated by StancePro rather than on an automatic daily run.",
      },
      cards: [
        {
          title: "What sets your amount",
          points: [
            "A fixed amount for each session you deliver",
            "Decided by the tier the rider requested",
            "Identical for every coach — no bidding, no negotiation",
            "No revenue share or commission anywhere in the chain",
          ],
        },
        {
          title: "What you can see at any time",
          points: [
            "Total earned, plus today, this week and this month",
            "Pending payout still waiting on approval",
            "Active assignments, average rating and review count",
            "Per-session payout status in your session history",
          ],
        },
      ],
      shotAlt: "My Earnings dashboard",
      shotCaption: "Totals, pending payout, ratings and session history in one place.",
    },
    cta: {
      title: "Ready to coach on StancePro?",
      body:
        "Install the app, open the Coaching tab and tap Become a Coach. The whole application lives in there.",
      primary: "Get the app",
      secondary: "Read the Coach Services Agreement",
      note: "Questions before you apply? Reach us through the Support page.",
    },
    disclaimer:
      "App screens are shown with sample data. Coach and rider names, amounts, ratings and account details in these screenshots are fictional.",
  },
  ko: {
    hero: {
      eyebrow: "StancePro 코칭",
      title: "당신의 코칭을,",
      accent: "모든 산에서",
      lede:
        "라이더가 라이딩을 찍어 보내면, 코치의 목소리와 화면에 그린 선이 얹힌 영상으로 돌려받습니다. 신청부터 승인, 실제 코칭까지 어떻게 돌아가는지 그대로 정리했습니다.",
    },
    request: {
      eyebrow: "무엇이 들어오는가",
      title: "짧은 클립과",
      accent: "라이더의 맥락",
      lede:
        "Coach Feedback은 독립된 요청 종류입니다. AI 분석을 거쳐야 오는 것이 아니며, 대부분의 요청은 코치에게 바로 옵니다.",
      cards: [
        {
          title: "클립 하나, 최대 30초",
          points: [
            "라이더 휴대폰에 있는 클립 한 개",
            "30초 제한은 iOS·Android 양쪽에서 전송 전에 강제",
            "요청 과정에 앱 내 촬영 기능은 없음",
          ],
        },
        {
          title: "무엇을 봐달라는지",
          points: [
            "짧은 목표와 자유 서술",
            "종목: 스노보드 또는 스키",
            "세부 종목: Riding · Jump-Spin · Jibbing",
          ],
        },
        {
          title: "셋업과 선호 언어",
          points: [
            "저장된 스탠스 셋업",
            "저장된 기어 셋업",
            "어떤 언어로 피드백받고 싶은지 표시하는 \"Rider prefers\" 줄",
          ],
        },
        {
          title: "하루 안이라는 기대치",
          points: [
            "Coach Feedback 카드는 라이더에게 \"Within a day\"로 안내",
            "대화가 아니라 완성된 영상 회신을 기대하고 들어옴",
          ],
        },
      ],
      shotAlt: "라이더의 세 가지 요청 경로: Self Analysis, AI Analysis, Coach Feedback",
      shotCaption:
        "라이더는 세 경로 중에서 고릅니다. Coach Feedback은 사람 코치에게 바로 연결됩니다.",
    },
    routing: {
      eyebrow: "일이 도달하는 방식",
      title: "얼마나 받을지는",
      accent: "코치가 정합니다",
      lede:
        "라이더는 자동 배정에 맡기거나 코치를 직접 지목합니다. 둘 중 무엇을 받을지 코치가 고르고, 아예 닫아둘 수도 있습니다.",
      cards: [
        {
          title: "수신 상태 세 가지",
          points: [
            "Open to Requests — 큐 제안을 받음",
            "Direct Request Only — 지목한 라이더만",
            "Off Duty — 요청이 전혀 들어오지 않음",
          ],
        },
        {
          title: "제안은 한 번에 한 코치에게",
          points: [
            "자동 배정은 뿌리기가 아님",
            "서버가 한 명의 코치에게만 제안",
            "거절하거나 시간이 지나야 다음 코치로 넘어감",
          ],
        },
        {
          title: "어느 쪽이든 2시간",
          points: [
            "자동 배정 제안은 120분 유지",
            "지목 요청도 동일하게 120분",
            "만료 전 알림 푸시 — 큐 제안은 15분 전, 지목 요청은 10분 전",
          ],
        },
        {
          title: "인기가 아니라 회전율",
          points: [
            "최근 24시간 수임 건수가 적은 순",
            "그다음 평균 응답이 빠른 순",
            "그다음 마지막 수임이 오래된 순",
            "별점은 순서 결정에 들어가지 않음",
            "동시 진행은 최대 3건 — Advanced Coaching은 2건",
          ],
        },
      ],
      shotAlt: "Open to Requests · Direct Request Only · Off Duty 선택 화면",
      shotCaption: "My Earnings → Request Status에서 코치가 직접 바꿉니다.",
    },
    apply: {
      eyebrow: "신청",
      title: "폼 하나와",
      accent: "실제 샘플 코칭",
      lede:
        "전부 앱 안에서 진행합니다. Coaching 탭 → Become a Coach. 이 중 샘플 녹화가 실제 코칭 방식을 보여주는 핵심입니다.",
      steps: [
        {
          title: "자격",
          points: [
            "코칭 경력 연차",
            "자격증 최소 1개 — 종목·협회·레벨·취득 연도",
            "examiner 상당 자격이 있으면 Examiner 토글",
            "증빙으로 자격증 사진 1장",
            "레벨은 1~3과 Trainer/Examiner",
          ],
        },
        {
          title: "코칭 스타일",
          points: [
            "전문 분야: Freestyle · Freeride · Powder · Park · Backcountry · Alpine/Carving · Beginner Instruction · Advanced Techniques",
            "코칭 가능한 모든 언어",
            "라이더가 코치를 고르기 전에 읽는 짧은 소개글",
          ],
        },
        {
          title: "샘플 코칭 녹화",
          points: [
            "제시된 샘플 클립 중 하나 선택",
            "실제 고객을 대하듯 라이더를 코칭",
            "현직 코치가 쓰는 것과 같은 Complete Review 폼으로 전달",
            "자격증이 걸린 종목마다 1개씩",
          ],
        },
        {
          title: "계약 동의 후 제출",
          points: [
            "현행 Coach Services Agreement 동의는 제출 필수 조건",
            "동의가 없으면 관리자도 승인할 수 없음",
            "반려되면 같은 신청서를 고쳐 다시 제출 가능",
          ],
        },
      ],
      shots: [
        {
          alt: "코치 신청서의 자격증·전문 분야 화면",
          caption: "자격증·전문 분야·언어가 한 폼에 들어갑니다.",
        },
        {
          alt: "인정 자격 협회 목록",
          caption:
            "AASI · APSI · BASI · CASI · ESF · KSBA · SAJ · SBINZ · Swiss Snowsports, 그 외는 Other.",
        },
        {
          alt: "종목·협회·레벨·연도를 넣는 자격증 추가 화면",
          caption: "자격증마다 증빙 사진 1장이 필요합니다.",
        },
        {
          alt: "바이오와 Coach Services Agreement 화면",
          caption: "계약 동의는 제출을 막는 필수 관문입니다.",
        },
      ],
    },
    approval: {
      eyebrow: "승인 이후",
      title: "라이더에게 보이기까지",
      accent: "한 단계 더",
      lede:
        "승인은 코칭 레벨을 정합니다. 실제로 스위치를 켜는 것은 정산 계좌 등록입니다.",
      cards: [
        {
          title: "레벨이 받을 수 있는 요청을 정합니다",
          points: [
            "관리자가 신청서를 검토해 레벨을 부여",
            "Advanced Coaching 요청은 trainer/examiner 레벨 코치에게만 배정",
          ],
        },
        {
          title: "정산 계좌가 진짜 관문",
          points: [
            "등록이 끝나기 전에는 라이더의 코치 선택 화면에 뜨지 않음",
            "큐 작업도 수임할 수 없음",
            "승인 알림이 바로 그 화면으로 연결",
          ],
        },
        {
          title: "정산 가능 42개국",
          points: [
            "은행 국가와 통화를 직접 선택",
            "입력 양식은 고정이 아니라 국가별로 불러옴",
            "그래서 해당 국가에서 실제로 쓰는 항목만 채우면 됨",
          ],
        },
        {
          title: "계약은 최신 버전 기준",
          points: [
            "동의 기록은 현행 계약 버전과 대조해 관리",
            "전문은 이 사이트에서 언제든 확인 가능",
          ],
        },
      ],
      shotAlt: "My Earnings의 정산 계좌·계약 상태",
      shotCaption: "계약 상태와 정산 계좌 모두 My Earnings에서 확인합니다.",
    },
    work: {
      eyebrow: "세션 진행",
      title: "16시간과",
      accent: "제대로 된 도구",
      lede:
        "수락하면 그 세션은 16시간 동안 코치의 것입니다. 그 안에 끝내지 못하면 다시 큐로 돌아갑니다.",
      shots: [
        {
          alt: "My Coaching Sessions 목록",
          caption: "수임한 세션이 한 목록에 모입니다.",
        },
        {
          alt: "그리기 도구와 자막이 있는 코치 녹화 화면",
          caption:
            "말하면서 영상 위에 바로 그립니다. 자막은 코치의 음성에서 생성됩니다.",
        },
      ],
      cards: [
        {
          title: "대면 코칭처럼 짚어줍니다",
          points: [
            "재생·정지·프레임 단위 이동",
            "말하면서 영상 위에 바로 드로잉",
            "클립 위에 음성 녹음",
            "전면 카메라 화면을 함께 표시",
            "포즈 오버레이 켜고 끄기",
          ],
        },
        {
          title: "내 말에서 나온 초안",
          points: [
            "코치의 음성에서 자막이 생성됨",
            "그 자막과 주석을 구조화된 서면 초안으로 변환",
            "전달 전에 직접 고쳐 쓰면 됨",
          ],
        },
        {
          title: "라이더를 다음 단계로",
          points: [
            "영상이나 Training Media 클립 첨부",
            "라이더의 진도 맵에 코치 인증 단계 부여",
          ],
        },
      ],
    },
    pay: {
      eyebrow: "정산",
      title: "전달한 세션당",
      accent: "정액",
      lede:
        "입찰도, 협상도, 수익 배분도 없습니다. 금액은 요청 등급으로 정해지고 모든 코치에게 동일합니다. 강습료가 거치는 전 과정은 이렇습니다.",
      flow: {
        riderLabel: "라이더 쪽",
        riderNodes: [
          {
            title: "크레딧",
            body: "라이더가 크레딧 팩을 구매하거나, Pro 플랜에 포함된 보너스 크레딧을 받습니다.",
          },
          {
            title: "요청 생성",
            body: "Coaching 또는 Advanced Coaching을 선택합니다. 크레딧은 요청이 만들어질 때 차감됩니다.",
          },
        ],
        coachLabel: "코치 쪽",
        coachNodes: [
          {
            title: "전달",
            body: "리뷰를 제출하는 그 순간 정산 건이 pending 상태로 생성됩니다.",
          },
          {
            title: "승인",
            body: "라이더가 응답을 수락하거나, 이의 없이 24시간이 지나면 승인됩니다.",
          },
          {
            title: "대기열",
            body: "등록해 둔 은행 계좌를 대상으로 송금 대기열에 오릅니다.",
          },
          {
            title: "송금",
            body: "StancePro가 송금합니다. 송금 수수료는 코치 금액에서 빼지 않습니다.",
          },
        ],
        note:
          "흐름이 멈출 수 있는 지점은 둘입니다. 라이더가 이의를 제기하면 해결될 때까지 승인이 보류되고, 정산 계좌가 준비되지 않았으면 대기열에 오르지 못한 채 대기합니다. 송금은 매일 자동으로 도는 배치가 아니라 StancePro가 실행합니다.",
      },
      cards: [
        {
          title: "금액을 정하는 것",
          points: [
            "전달한 세션마다 정액",
            "라이더가 요청한 등급으로 결정",
            "모든 코치에게 동일 — 입찰도 협상도 없음",
            "전 과정 어디에도 수익 배분이나 수수료 공제 없음",
          ],
        },
        {
          title: "언제든 확인할 수 있는 것",
          points: [
            "누적 수입과 오늘·이번 주·이번 달 수입",
            "승인 대기 중인 정산 금액",
            "진행 중 세션, 평균 평점, 리뷰 수",
            "세션 이력의 건별 정산 상태",
          ],
        },
      ],
      shotAlt: "My Earnings 화면",
      shotCaption: "누적·대기 정산금, 평점, 세션 이력이 한 화면에 있습니다.",
    },
    cta: {
      title: "StancePro에서 코칭하시겠습니까?",
      body:
        "앱을 설치하고 Coaching 탭에서 Become a Coach를 누르면 됩니다. 신청 전 과정이 그 안에 있습니다.",
      primary: "앱 받기",
      secondary: "Coach Services Agreement 읽기",
      note: "신청 전 궁금한 점은 Support 페이지로 문의해 주세요.",
    },
    disclaimer:
      "화면은 예시 데이터로 표시했습니다. 스크린샷의 코치·라이더 이름, 금액, 평점, 계좌 정보는 모두 가상입니다.",
  },
} as const;
