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
      title: "Review riders' videos.",
      accent: "Get paid for each one.",
      lede:
        "A rider films a 30-second run and sends it to a coach. You watch it in the app, talk over it while you draw on the screen, and send it back. This page explains how to apply, how work reaches you, and how you get paid.",
    },
    request: {
      eyebrow: "What you'll be reviewing",
      title: "A 30-second clip,",
      accent: "and what the rider wants help with",
      lede:
        "Riders can pick Self Analysis, AI Analysis, or Coach Feedback. Only Coach Feedback comes to you — and riders who want a real coach choose it directly, without going through AI first.",
      cards: [
        {
          title: "One clip, 30 seconds or less",
          points: [
            "A video already on the rider's phone — nothing is filmed live",
            "30 seconds is the limit; the app blocks anything longer",
            "That one clip is the whole job — you review it, nothing else",
          ],
        },
        {
          title: "What they want help with",
          points: [
            "A short title, like \"Frontside 180\" or \"Heel-side carve\"",
            "A few sentences on what they'd like you to look at",
            "Snowboard or ski, and whether it's general riding, a jump or spin, or a rail or box",
          ],
        },
        {
          title: "Their setup and language",
          points: [
            "The stance and gear they've saved in the app — binding angles, width, board or skis",
            "The language they'd like your feedback in",
            "You don't need to speak it — your captions and written feedback are translated between English, Korean, Japanese, Chinese, German, French and Thai",
          ],
        },
        {
          title: "They expect it within a day",
          points: [
            "The app tells riders a coach reply arrives \"within a day\"",
            "They're waiting for a video back, not a chat",
          ],
        },
      ],
      shotAlt: "The rider's three options: Self Analysis, AI Analysis and Coach Feedback",
      shotCaption: "What the rider sees. Coach Feedback is the one that comes to you.",
    },
    routing: {
      eyebrow: "Getting work",
      title: "Riders pick you,",
      accent: "or the app picks for them",
      lede:
        "A rider can choose you by name from the list of coaches, or let the app find them a coach. You decide which of those you want to receive — and you can switch off completely when you're busy.",
      cards: [
        {
          title: "Your three settings",
          points: [
            "Open to Requests — you get both: riders who pick you, and riders the app matches to you",
            "Direct Request Only — only riders who pick you by name",
            "Off Duty — nothing comes in until you switch back on",
          ],
        },
        {
          title: "When the app picks, it asks one coach at a time",
          points: [
            "A request goes to one coach, not to everyone at once",
            "If you pass, or don't answer in time, it moves to the next coach",
            "So when the app asks you, the job is yours if you want it",
          ],
        },
        {
          title: "You have 2 hours to say yes",
          points: [
            "Same 2 hours whether a rider picked you or the app did",
            "You get a push notification when it arrives, and a reminder before time runs out",
            "If you pass, it simply goes to the next coach",
          ],
        },
        {
          title: "Who the app asks first",
          points: [
            "Coaches who've done fewer reviews in the last 24 hours go first — so work is shared around",
            "Then coaches who send reviews back fastest, then whoever has waited longest since their last one",
            "Your star rating only comes in as a tie-breaker",
            "You can have 3 reviews on the go at once (2 for Advanced Coaching). A review you've already sent still counts until the rider's 24 hours are up",
          ],
        },
      ],
      shotAlt: "Request Status screen with Open to Requests, Direct Request Only and Off Duty",
      shotCaption: "Your switch, under My Earnings → Request Status.",
    },
    apply: {
      eyebrow: "Applying",
      title: "Fill in one form,",
      accent: "and record one sample review",
      lede:
        "You apply inside the app: Coaching tab → Become a Coach. The form takes your certificates and a short profile. The sample review is where you actually show us how you coach.",
      steps: [
        {
          title: "Your certificates",
          points: [
            "How many years you've been coaching",
            "At least one instructor certificate — which association, what level, what year",
            "A photo of the certificate as proof",
            "Levels go from 1 to 3, plus Trainer/Examiner. Tick the Examiner box if that's you",
          ],
        },
        {
          title: "Your profile",
          points: [
            "Your specialties — freestyle, freeride, powder, park, backcountry, carving, teaching beginners, advanced technique",
            "Every language you can coach in",
            "A short bio — riders read this when choosing a coach",
          ],
        },
        {
          title: "One sample review",
          points: [
            "Pick one of our sample clips",
            "Review it exactly as you would for a paying rider — voice, drawing, and a written note",
            "Certified in both snowboard and ski? Record one for each",
          ],
        },
        {
          title: "Agree and submit",
          points: [
            "You accept the Coach Services Agreement before submitting — it's linked in the form",
            "We can't approve an application without it",
            "If we say no, you can edit the same application and send it again",
          ],
        },
      ],
      shots: [
        {
          alt: "Certificates and specialties in the coach application",
          caption: "Certificates, specialties and languages are all on one form.",
        },
        {
          alt: "List of accepted certifying associations",
          caption: "The associations we accept — or choose Other.",
        },
        {
          alt: "Adding a certificate with sport, association, level and year",
          caption: "Each certificate needs a photo as proof.",
        },
        {
          alt: "Bio and Coach Services Agreement section",
          caption: "Your bio, and the agreement you accept before submitting.",
        },
      ],
    },
    approval: {
      eyebrow: "After you're approved",
      title: "Add your bank details,",
      accent: "and you're live",
      lede:
        "Being approved sets your coach level. But riders can't see you until your bank details are in — that's the actual switch.",
      cards: [
        {
          title: "Your level sets what you can take",
          points: [
            "We approve you at a level based on your certificates",
            "Advanced Coaching requests only go to Trainer/Examiner-level coaches",
            "Standard requests are open to every approved coach",
          ],
        },
        {
          title: "Bank details are the real switch",
          points: [
            "Until they're in, riders can't see you and the app won't send you requests",
            "The approval notification takes you straight to that screen",
            "It takes a few minutes — country, currency, account details",
          ],
        },
        {
          title: "Paid in 42 countries",
          points: [
            "Choose your country and the currency of your bank account",
            "The form only shows the fields your country's banks actually use",
          ],
        },
        {
          title: "The agreement",
          points: [
            "You accepted it when you applied",
            "If we update it, the app asks you to accept the new version before you take more work",
            "The full text is on this site any time",
          ],
        },
      ],
      shotAlt: "Bank details and agreement status in My Earnings",
      shotCaption: "Both live under My Earnings once you're set up.",
    },
    work: {
      eyebrow: "Doing a review",
      title: "You have 16 hours,",
      accent: "and everything you need on your phone",
      lede:
        "Once you accept, the review is yours for 16 hours. If you can't get to it in time, it goes back out to the other coaches.",
      shots: [
        {
          alt: "My Coaching Sessions list",
          caption: "Everything you've accepted, in one list.",
        },
        {
          alt: "Coach recording a review with drawing tools and captions",
          caption: "Talk while you draw on the video. Your words become captions automatically.",
        },
      ],
      cards: [
        {
          title: "Review it like you're standing next to them",
          points: [
            "Play, pause, and step through frame by frame",
            "Draw on the video while you talk",
            "Your voice is recorded over the clip",
            "Show your own face in the corner if you like",
            "Turn on a skeleton overlay to point out body position",
          ],
        },
        {
          title: "A written note, started for you",
          points: [
            "Everything you say becomes captions",
            "If you want, the app drafts a written summary from what you said and drew",
            "You edit it — nothing goes to the rider until you press send",
          ],
        },
        {
          title: "Send more than a video",
          points: [
            "Attach another video, or a clip from our Training Media library",
            "Sign off skills on the rider's progress tracker, so they see what they've earned",
          ],
        },
      ],
    },
    pay: {
      eyebrow: "Getting paid",
      title: "A set amount",
      accent: "for every review you send",
      lede:
        "You don't set prices and you don't negotiate. Each type of review pays a fixed amount, the same for every coach. Here's how the money moves.",
      flow: {
        riderLabel: "The rider",
        riderNodes: [
          {
            title: "Buys credits",
            body: "Riders buy credit packs, or get credits included with a Pro subscription.",
          },
          {
            title: "Requests a review",
            body: "They pick standard Coaching or Advanced Coaching. The credits are taken at that moment.",
          },
        ],
        coachLabel: "You",
        coachNodes: [
          {
            title: "Send your review",
            body: "As soon as you send it, your payment is recorded as pending.",
          },
          {
            title: "It's approved",
            body: "The rider accepts it, or 24 hours pass without them raising a problem.",
          },
          {
            title: "It's queued",
            body: "It's lined up for transfer to the bank account you gave us.",
          },
          {
            title: "You're paid",
            body: "We send the transfer and cover the transfer fee ourselves.",
          },
        ],
        note:
          "Two things can hold it up. If the rider raises a problem, StancePro looks at the review and decides — the rider can't cancel your payment on their own. And if your bank details aren't in yet, the money waits until they are. Transfers are sent by StancePro rather than automatically every day, so allow a little time.",
      },
      cards: [
        {
          title: "What you get paid",
          points: [
            "A fixed amount for every review you send",
            "The amount depends on which type of review the rider ordered",
            "Same for every coach — no bidding, no haggling",
            "We don't take a percentage of your payment",
          ],
        },
        {
          title: "What you can check any time",
          points: [
            "Total earned — today, this week, this month",
            "What's approved and waiting to be sent",
            "How many reviews you have on the go, your rating, and how many reviews you've done",
            "The payment status of every review",
          ],
        },
      ],
      shotAlt: "My Earnings dashboard",
      shotCaption: "Earnings, pending payments, rating and history in one place.",
    },
    cta: {
      title: "Ready to start?",
      body: "Get the app, open the Coaching tab, and tap Become a Coach. The whole application is in there.",
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
      title: "라이더의 영상을 봐주고,",
      accent: "한 편마다 보수를 받습니다",
      lede:
        "라이더가 30초짜리 라이딩 영상을 찍어 코치에게 보냅니다. 코치는 앱에서 그 영상을 보면서 말로 설명하고 화면에 그려서 돌려보냅니다. 신청 방법, 일이 들어오는 방식, 보수를 받는 과정을 이 페이지에 정리했습니다.",
    },
    request: {
      eyebrow: "무엇을 봐주게 되는가",
      title: "30초 클립 하나와,",
      accent: "라이더가 도움받고 싶은 것",
      lede:
        "라이더는 Self Analysis, AI Analysis, Coach Feedback 중 하나를 고릅니다. 코치에게 오는 것은 Coach Feedback뿐이고, 실제 코치를 원하는 라이더는 AI를 거치지 않고 바로 이걸 고릅니다.",
      cards: [
        {
          title: "클립 하나, 30초 이내",
          points: [
            "라이더 휴대폰에 이미 있는 영상 — 실시간 촬영은 없음",
            "30초가 상한이며, 더 긴 영상은 앱이 막음",
            "그 클립 하나가 일의 전부 — 그것만 봐주면 됨",
          ],
        },
        {
          title: "무엇을 봐달라는지",
          points: [
            "\"Frontside 180\", \"힐사이드 카빙\" 같은 짧은 제목",
            "어디를 봐주면 좋을지 적은 몇 문장",
            "스노보드인지 스키인지, 그리고 일반 라이딩·점프와 스핀·레일과 박스 중 무엇인지",
          ],
        },
        {
          title: "셋업과 언어",
          points: [
            "앱에 저장해 둔 스탠스와 장비 — 바인딩 각도, 스탠스 폭, 보드나 스키",
            "피드백을 받고 싶은 언어",
            "그 언어를 몰라도 됨 — 자막과 서면 피드백은 영어·한국어·일본어·중국어·독일어·프랑스어·태국어 사이에서 서로 번역됨",
          ],
        },
        {
          title: "하루 안에 오기를 기대함",
          points: [
            "앱은 라이더에게 코치 답변이 \"하루 안에\" 온다고 안내",
            "라이더는 대화가 아니라 영상 답변을 기다림",
          ],
        },
      ],
      shotAlt: "라이더의 세 가지 선택지: Self Analysis, AI Analysis, Coach Feedback",
      shotCaption: "라이더가 보는 화면입니다. 코치에게 오는 것은 Coach Feedback입니다.",
    },
    routing: {
      eyebrow: "일이 들어오는 방식",
      title: "라이더가 코치를 고르거나,",
      accent: "앱이 대신 골라줍니다",
      lede:
        "라이더는 코치 목록에서 이름을 보고 직접 고를 수도 있고, 앱에 맡길 수도 있습니다. 둘 중 무엇을 받을지는 코치가 정하고, 바쁠 땐 완전히 꺼둘 수 있습니다.",
      cards: [
        {
          title: "설정 세 가지",
          points: [
            "Open to Requests — 둘 다 받음: 코치를 직접 고른 라이더, 앱이 연결해 준 라이더",
            "Direct Request Only — 이름을 보고 직접 고른 라이더만",
            "Off Duty — 다시 켤 때까지 아무것도 안 들어옴",
          ],
        },
        {
          title: "앱이 고를 땐 한 번에 한 코치에게만",
          points: [
            "요청은 한 코치에게 감 — 모두에게 동시에 뿌리지 않음",
            "거절하거나 제때 답하지 않으면 다음 코치에게 넘어감",
            "그래서 앱이 물어보면, 원할 경우 그 일은 코치 것",
          ],
        },
        {
          title: "수락까지 2시간",
          points: [
            "라이더가 골랐든 앱이 골랐든 똑같이 2시간",
            "요청이 오면 푸시 알림, 시간이 다 되기 전에 한 번 더 알림",
            "거절하면 그냥 다음 코치에게 넘어감",
          ],
        },
        {
          title: "앱이 누구에게 먼저 물어보는가",
          points: [
            "최근 24시간 동안 리뷰를 덜 한 코치가 먼저 — 일이 골고루 돌아가도록",
            "그다음은 수락 후 리뷰를 빨리 보내는 코치, 그다음은 마지막 리뷰 이후 가장 오래 기다린 코치",
            "별점은 동점일 때만 작용",
            "동시에 3건까지 진행 가능 (Advanced Coaching은 2건). 이미 보낸 리뷰도 라이더의 24시간이 끝날 때까지는 진행 중으로 셈",
          ],
        },
      ],
      shotAlt: "Open to Requests · Direct Request Only · Off Duty 선택 화면",
      shotCaption: "My Earnings → Request Status에서 코치가 직접 바꿉니다.",
    },
    apply: {
      eyebrow: "신청",
      title: "폼 하나 작성하고,",
      accent: "샘플 리뷰 하나를 녹화합니다",
      lede:
        "신청은 앱 안에서 합니다. Coaching 탭 → Become a Coach. 폼에는 자격증과 짧은 프로필을 넣고, 샘플 리뷰에서 실제로 어떻게 코칭하는지를 보여주시면 됩니다.",
      steps: [
        {
          title: "자격증",
          points: [
            "코칭 경력 연차",
            "강사 자격증 최소 1개 — 어느 협회, 몇 레벨, 몇 년도",
            "증빙으로 자격증 사진 1장",
            "레벨은 1~3과 Trainer/Examiner. 해당되면 Examiner 항목에 체크",
          ],
        },
        {
          title: "프로필",
          points: [
            "전문 분야 — 프리스타일, 프리라이드, 파우더, 파크, 백컨트리, 카빙, 초보 강습, 고급 기술",
            "코칭 가능한 모든 언어",
            "짧은 소개글 — 라이더가 코치를 고를 때 읽는 글",
          ],
        },
        {
          title: "샘플 리뷰 하나",
          points: [
            "제시된 샘플 클립 중 하나 선택",
            "돈 낸 라이더에게 하듯 그대로 리뷰 — 음성, 그림, 짧은 글",
            "스노보드와 스키 자격증이 둘 다 있으면 각각 하나씩",
          ],
        },
        {
          title: "동의하고 제출",
          points: [
            "제출 전에 Coach Services Agreement에 동의 — 폼 안에 링크가 있음",
            "동의 없이는 승인 불가",
            "반려되면 같은 신청서를 고쳐서 다시 제출 가능",
          ],
        },
      ],
      shots: [
        {
          alt: "코치 신청서의 자격증·전문 분야 화면",
          caption: "자격증, 전문 분야, 언어가 한 폼에 들어갑니다.",
        },
        {
          alt: "인정 자격 협회 목록",
          caption: "인정하는 협회 목록입니다. 없으면 Other를 고릅니다.",
        },
        {
          alt: "종목·협회·레벨·연도를 넣는 자격증 추가 화면",
          caption: "자격증마다 증빙 사진이 필요합니다.",
        },
        {
          alt: "소개글과 Coach Services Agreement 화면",
          caption: "소개글, 그리고 제출 전에 동의하는 계약서입니다.",
        },
      ],
    },
    approval: {
      eyebrow: "승인 이후",
      title: "은행 계좌를 넣으면,",
      accent: "그때부터 활동 시작",
      lede:
        "승인은 코치 레벨을 정합니다. 하지만 은행 계좌를 넣기 전까지는 라이더에게 보이지 않습니다 — 진짜 스위치는 계좌입니다.",
      cards: [
        {
          title: "레벨이 받을 수 있는 일을 정함",
          points: [
            "자격증을 보고 레벨을 정해 승인",
            "Advanced Coaching 요청은 Trainer/Examiner 레벨 코치에게만",
            "일반 요청은 승인된 코치 모두에게 열림",
          ],
        },
        {
          title: "진짜 스위치는 은행 계좌",
          points: [
            "계좌를 넣기 전까지는 라이더에게 안 보이고 앱도 요청을 보내지 않음",
            "승인 알림을 누르면 바로 그 화면으로 이동",
            "몇 분이면 끝남 — 국가, 통화, 계좌 정보",
          ],
        },
        {
          title: "42개국으로 송금",
          points: [
            "국가와 은행 계좌의 통화를 선택",
            "그 나라 은행이 실제로 쓰는 항목만 폼에 나타남",
          ],
        },
        {
          title: "계약서",
          points: [
            "신청할 때 이미 동의한 것",
            "내용이 바뀌면 새 버전에 동의해야 다음 일을 받을 수 있음",
            "전문은 이 사이트에서 언제든 확인 가능",
          ],
        },
      ],
      shotAlt: "My Earnings의 은행 계좌·계약 상태",
      shotCaption: "설정이 끝나면 둘 다 My Earnings에서 보입니다.",
    },
    work: {
      eyebrow: "리뷰하기",
      title: "16시간이 주어지고,",
      accent: "필요한 건 전부 휴대폰 안에",
      lede:
        "수락하면 그 리뷰는 16시간 동안 코치의 것입니다. 시간 안에 못 하면 다른 코치들에게 다시 넘어갑니다.",
      shots: [
        {
          alt: "My Coaching Sessions 목록",
          caption: "수락한 리뷰가 한 목록에 모입니다.",
        },
        {
          alt: "그리기 도구와 자막이 있는 코치 녹화 화면",
          caption: "말하면서 영상 위에 그립니다. 말한 내용은 자동으로 자막이 됩니다.",
        },
      ],
      cards: [
        {
          title: "옆에 서서 봐주듯이",
          points: [
            "재생, 정지, 한 프레임씩 이동",
            "말하면서 영상 위에 그리기",
            "목소리가 클립 위에 녹음됨",
            "원하면 화면 구석에 코치 얼굴도 표시",
            "몸 위치를 짚어줄 스켈레톤 오버레이 켜기",
          ],
        },
        {
          title: "글로 된 메모, 초안은 앱이",
          points: [
            "말한 내용이 전부 자막으로",
            "원하면 말하고 그린 내용을 바탕으로 앱이 글 초안을 써 줌",
            "코치가 고쳐서 보냄 — 보내기 전엔 라이더에게 아무것도 안 감",
          ],
        },
        {
          title: "영상 말고도 더",
          points: [
            "다른 영상이나 Training Media 라이브러리의 클립을 첨부",
            "라이더의 진도표에서 해낸 기술을 인정 — 라이더가 바로 확인",
          ],
        },
      ],
    },
    pay: {
      eyebrow: "보수",
      title: "보낸 리뷰 한 편마다",
      accent: "정해진 금액",
      lede:
        "가격을 정하거나 흥정할 일이 없습니다. 리뷰 종류마다 금액이 정해져 있고 모든 코치에게 같습니다. 돈이 움직이는 순서는 이렇습니다.",
      flow: {
        riderLabel: "라이더",
        riderNodes: [
          {
            title: "크레딧 구매",
            body: "크레딧 팩을 사거나, Pro 구독에 포함된 크레딧을 받습니다.",
          },
          {
            title: "리뷰 요청",
            body: "일반 Coaching과 Advanced Coaching 중 고릅니다. 크레딧은 이때 차감됩니다.",
          },
        ],
        coachLabel: "코치",
        coachNodes: [
          {
            title: "리뷰 전송",
            body: "보내는 순간 보수가 대기 상태로 기록됩니다.",
          },
          {
            title: "승인",
            body: "라이더가 수락하거나, 이의 없이 24시간이 지나면 승인됩니다.",
          },
          {
            title: "송금 대기",
            body: "등록한 은행 계좌로 보낼 순서에 오릅니다.",
          },
          {
            title: "입금",
            body: "StancePro가 송금하고 송금 수수료도 부담합니다.",
          },
        ],
        note:
          "멈출 수 있는 지점은 둘입니다. 라이더가 문제를 제기하면 StancePro가 리뷰를 보고 판단합니다 — 라이더 혼자서 코치의 보수를 취소할 수는 없습니다. 은행 계좌가 아직 없으면 계좌를 넣을 때까지 돈이 기다립니다. 송금은 매일 자동으로 나가는 게 아니라 StancePro가 직접 보내므로 며칠 여유를 두시면 됩니다.",
      },
      cards: [
        {
          title: "얼마를 받는가",
          points: [
            "보낸 리뷰 한 편마다 정해진 금액",
            "금액은 라이더가 고른 리뷰 종류에 따라 다름",
            "모든 코치가 동일 — 입찰도 흥정도 없음",
            "코치 보수에서 비율로 떼는 수수료 없음",
          ],
        },
        {
          title: "언제든 확인할 수 있는 것",
          points: [
            "누적 수입 — 오늘, 이번 주, 이번 달",
            "승인돼서 송금을 기다리는 금액",
            "진행 중인 리뷰 수, 평점, 지금까지 한 리뷰 수",
            "리뷰마다 보수가 어느 단계인지",
          ],
        },
      ],
      shotAlt: "My Earnings 화면",
      shotCaption: "수입, 대기 중인 보수, 평점, 이력이 한 화면에 있습니다.",
    },
    cta: {
      title: "시작해 볼까요?",
      body: "앱을 받고 Coaching 탭에서 Become a Coach를 누르세요. 신청 과정 전체가 그 안에 있습니다.",
      primary: "앱 받기",
      secondary: "Coach Services Agreement 읽기",
      note: "신청 전 궁금한 점은 Support 페이지로 문의해 주세요.",
    },
    disclaimer:
      "화면은 예시 데이터로 표시했습니다. 스크린샷의 코치·라이더 이름, 금액, 평점, 계좌 정보는 모두 가상입니다.",
  },
} as const;
