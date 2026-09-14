"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Banknote,
  BadgeCheck,
  ChevronRight,
  Inbox,
  MonitorPlay,
  PauseCircle,
  PenLine,
  Timer,
  Video,
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
function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="flex flex-col items-center">
      <div className="w-full max-w-[260px] overflow-hidden rounded-[2rem] border border-white/10 bg-mountain-950 shadow-2xl shadow-black/40">
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
          <li key={n.title} className="flex flex-1 flex-col items-stretch gap-3 md:flex-row">
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

/** Numbered step for "how to begin". */
function Step({ n, title, points }: { n: number; title: string; points: readonly string[] }) {
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

const CARD_TONES = [
  ["from-brand-500", "to-brand-600"],
  ["from-purple-500", "to-purple-600"],
  ["from-amber-500", "to-amber-600"],
  ["from-emerald-500", "to-emerald-600"],
] as const;

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

      {/* 1. hero */}
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

      {/* 2. video feedback, with tools */}
      <Section
        eyebrow={t.tools.eyebrow}
        title={t.tools.title}
        accent={t.tools.accent}
        lede={t.tools.lede}
      >
        <div className="mb-14 grid gap-6 md:grid-cols-3">
          {t.tools.cards.map((c, i) => (
            <Card
              key={c.title}
              icon={[MonitorPlay, PenLine, Timer][i]}
              title={c.title}
              points={c.points}
              from={CARD_TONES[i][0]}
              to={CARD_TONES[i][1]}
            />
          ))}
        </div>
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-10">
          <Shot
            src={`${SHOTS}/coach-review-tools.webp`}
            alt={t.tools.shots[0].alt}
            caption={t.tools.shots[0].caption}
          />
          <Shot
            src={`${SHOTS}/coach-sessions.webp`}
            alt={t.tools.shots[1].alt}
            caption={t.tools.shots[1].caption}
          />
        </div>
      </Section>

      {/* 3. how work reaches you */}
      <Section
        eyebrow={t.reach.eyebrow}
        title={t.reach.title}
        accent={t.reach.accent}
        lede={t.reach.lede}
      >
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-6 md:grid-cols-2">
            {t.reach.cards.map((c, i) => (
              <Card
                key={c.title}
                icon={[Video, Inbox, BadgeCheck, Timer][i]}
                title={c.title}
                points={c.points}
                from={CARD_TONES[i][0]}
                to={CARD_TONES[i][1]}
              />
            ))}
          </div>
          <Shot
            src={`${SHOTS}/coach-request-modes.webp`}
            alt={t.reach.shotAlt}
            caption={t.reach.shotCaption}
          />
        </div>
      </Section>

      {/* 4. getting paid */}
      <Section
        eyebrow={t.pay.eyebrow}
        title={t.pay.title}
        accent={t.pay.accent}
        lede={t.pay.lede}
      >
        <div className="glass mb-12 space-y-8 rounded-2xl p-6 md:p-8">
          <FlowLane label={t.pay.flow.riderLabel} accent="text-purple-300" nodes={t.pay.flow.riderNodes} />
          <FlowLane label={t.pay.flow.coachLabel} accent="text-brand-300" nodes={t.pay.flow.coachNodes} />
          <p className="flex items-start gap-2.5 border-t border-white/10 pt-6 text-sm text-slate-400">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <span>{t.pay.flow.note}</span>
          </p>
        </div>
        <div className="grid items-start gap-12 lg:grid-cols-[auto_1fr]">
          <Shot
            src={`${SHOTS}/coach-earnings.webp`}
            alt={t.pay.shotAlt}
            caption={t.pay.shotCaption}
          />
          <Card
            icon={Banknote}
            title={t.pay.card.title}
            points={t.pay.card.points}
            from={CARD_TONES[3][0]}
            to={CARD_TONES[3][1]}
          />
        </div>
      </Section>

      {/* 5. how to begin */}
      <Section
        eyebrow={t.begin.eyebrow}
        title={t.begin.title}
        accent={t.begin.accent}
        lede={t.begin.lede}
      >
        <ol className="mb-14 grid gap-10 md:grid-cols-3">
          {t.begin.steps.map((s, i) => (
            <Step key={s.title} n={i + 1} title={s.title} points={s.points} />
          ))}
        </ol>
        <div className="grid gap-10 sm:grid-cols-3">
          <Shot
            src={`${SHOTS}/coach-application-profile.webp`}
            alt={t.begin.shots[0].alt}
            caption={t.begin.shots[0].caption}
          />
          <Shot
            src={`${SHOTS}/coach-application-certificate.webp`}
            alt={t.begin.shots[1].alt}
            caption={t.begin.shots[1].caption}
          />
          <Shot
            src={`${SHOTS}/coach-payout.webp`}
            alt={t.begin.shots[2].alt}
            caption={t.begin.shots[2].caption}
          />
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
        <p className="mx-auto mt-8 max-w-4xl text-center text-xs text-slate-600">{t.disclaimer}</p>
      </section>
    </div>
  );
}

const COPY = {
  en: {
    hero: {
      eyebrow: "Coaching on StancePro",
      title: "Take your coaching online",
      accent: "with StancePro",
      lede:
        "Riders film a 30-second run and send it to a coach. You watch it on your phone, talk over it while you draw on the screen, and send it back — and you're paid for every review you send.",
    },
    tools: {
      eyebrow: "Video feedback",
      title: "Coach like you're standing next to them,",
      accent: "with real tools",
      lede: "Everything happens on your phone, inside the app.",
      shots: [
        {
          alt: "Coach recording a review with drawing tools and captions",
          caption: "Draw and talk over the video. Your words become captions.",
        },
        {
          alt: "My Coaching Sessions list",
          caption: "Every review you've taken on, in one list.",
        },
      ],
      cards: [
        {
          title: "Mark up the video",
          points: [
            "Play, pause, step frame by frame",
            "Draw on the screen while you talk — your voice is recorded over the clip",
            "Add your own face in the corner, or a skeleton overlay to point out body position",
          ],
        },
        {
          title: "A written note, started for you",
          points: [
            "Everything you say becomes captions automatically",
            "The app can draft a summary from them — you edit it before it goes out",
            "Attach another video, or a clip from our Training Media library",
          ],
        },
        {
          title: "16 hours to deliver",
          points: [
            "Once you accept, the review is yours for 16 hours",
            "Can't get to it? It goes back to the other coaches",
            "When you send, you can sign off skills on the rider's progress tracker",
          ],
        },
      ],
    },
    reach: {
      eyebrow: "Getting work",
      title: "Riders pick you,",
      accent: "or the app asks everyone who's open",
      lede: "Two ways work arrives. You choose which ones you're open to.",
      cards: [
        {
          title: "What arrives",
          points: [
            "One clip, 30 seconds max, from the rider's phone",
            "A short title, a few lines on what to look at, and their stance and gear setup",
            "Their language — captions and notes are translated across 7 languages, so you don't need to speak it",
          ],
        },
        {
          title: "Two ways it reaches you",
          points: [
            "A rider picks you by name from the coach list",
            "Or the app sends the request to every coach who's open — first to accept takes it",
            "Riders are told to expect a reply within a day",
          ],
        },
        {
          title: "Your three settings",
          points: [
            "Open to Requests — both kinds",
            "Direct Request Only — only riders who pick you",
            "Off Duty — nothing until you switch back on",
          ],
        },
        {
          title: "Time and limits",
          points: [
            "2 hours to accept, with a reminder before time runs out",
            "Up to 3 reviews on the go at once (2 for Advanced Coaching) — a sent review counts until the rider's 24 hours are up",
            "Pass on a request and it won't come back to you; the others can still take it",
          ],
        },
      ],
      shotAlt: "Request Status screen with Open to Requests, Direct Request Only and Off Duty",
      shotCaption: "Your switch, under My Earnings → Request Status.",
    },
    pay: {
      eyebrow: "Getting paid",
      title: "A set amount",
      accent: "for every review you send",
      lede:
        "No prices to set, nothing to negotiate. Each type of review pays a fixed amount, the same for every coach. Here's how the money moves.",
      flow: {
        riderLabel: "The rider",
        riderNodes: [
          { title: "Buys credits", body: "Credit packs, or credits included with a Pro subscription." },
          {
            title: "Requests a review",
            body: "Picks Coaching or Advanced Coaching. The credits are taken right then.",
          },
        ],
        coachLabel: "You",
        coachNodes: [
          { title: "Send your review", body: "Your payment is recorded as pending the moment you send." },
          {
            title: "It's approved",
            body: "The rider accepts it, or 24 hours pass without them raising a problem.",
          },
          { title: "It's queued", body: "Lined up for transfer to the bank account you gave us." },
          { title: "You're paid", body: "We send the transfer and cover the transfer fee." },
        ],
        note:
          "Two things can hold it up: if the rider raises a problem, StancePro reviews it and decides — a rider can't cancel your payment alone; and if your bank details aren't in yet, the money waits until they are. Transfers are sent by StancePro, so allow a little time.",
      },
      card: {
        title: "What you get paid",
        points: [
          "A fixed amount per review, set by the type the rider ordered",
          "The same for every coach — no bidding, no haggling",
          "The rider pays StancePro; you get the fixed fee, and StancePro keeps the difference to run the platform",
        ],
      },
      shotAlt: "My Earnings dashboard",
      shotCaption: "Earnings, pending payments, rating and history — all under My Earnings.",
    },
    begin: {
      eyebrow: "How to begin",
      title: "Three steps,",
      accent: "all inside the app",
      lede: "Coaching tab → Become a Coach. Riders can see you once all three are done.",
      steps: [
        {
          title: "Apply",
          points: [
            "Your certificates (association, level, year, a photo as proof), specialties, languages and a short bio",
            "One sample review — coach one of our clips as you would a paying rider",
            "Accept the Coach Services Agreement",
          ],
        },
        {
          title: "Get approved",
          points: [
            "We check your certificates and set your level",
            "Advanced Coaching requests go only to Trainer/Examiner-level coaches",
            "Turned down? Edit the same application and send it again",
          ],
        },
        {
          title: "Add your bank details",
          points: [
            "This is the switch — until it's in, riders can't see you",
            "Country, currency, account — a few minutes",
            "Paid in 42 countries; the form shows only your country's fields",
          ],
        },
      ],
      shots: [
        {
          alt: "Certifications and specialties in the coach application",
          caption: "Certificates, specialties and languages on one form.",
        },
        {
          alt: "Adding a certificate with sport, association, level and year",
          caption: "Each certificate needs a photo as proof.",
        },
        {
          alt: "Bank details and agreement status in My Earnings",
          caption: "Bank details and agreement status, under My Earnings.",
        },
      ],
    },
    cta: {
      title: "Ready to start?",
      body: "Get the app, open the Coaching tab, and tap Become a Coach.",
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
      title: "온라인 코칭을 시작하세요,",
      accent: "StancePro와 함께",
      lede:
        "라이더가 30초짜리 라이딩 영상을 찍어 코치에게 보냅니다. 코치는 휴대폰으로 그 영상을 보면서 말로 설명하고 화면에 그려서 돌려보냅니다 — 보낸 리뷰 한 편마다 보수를 받습니다.",
    },
    tools: {
      eyebrow: "영상 피드백",
      title: "옆에 서서 봐주듯이,",
      accent: "제대로 된 도구로",
      lede: "전 과정이 휴대폰 안, 앱 안에서 끝납니다.",
      shots: [
        {
          alt: "그리기 도구와 자막이 있는 코치 녹화 화면",
          caption: "영상 위에 그리면서 말합니다. 말한 내용은 자막이 됩니다.",
        },
        {
          alt: "My Coaching Sessions 목록",
          caption: "맡은 리뷰가 한 목록에 모입니다.",
        },
      ],
      cards: [
        {
          title: "영상 위에 바로 표시",
          points: [
            "재생, 정지, 한 프레임씩 이동",
            "말하면서 화면에 그리기 — 목소리는 클립 위에 녹음됨",
            "구석에 코치 얼굴을 띄우거나, 몸 위치를 짚어줄 스켈레톤 오버레이 켜기",
          ],
        },
        {
          title: "서면 메모, 초안은 앱이",
          points: [
            "말한 내용이 전부 자동으로 자막이 됨",
            "앱이 그 자막으로 요약 초안을 써 줌 — 보내기 전에 코치가 고침",
            "다른 영상이나 Training Media 라이브러리의 클립을 첨부",
          ],
        },
        {
          title: "전달까지 16시간",
          points: [
            "수락하면 그 리뷰는 16시간 동안 코치의 것",
            "시간 안에 못 하면 다른 코치들에게 다시 넘어감",
            "보낼 때 라이더의 진도표에서 해낸 기술을 인정해 줄 수 있음",
          ],
        },
      ],
    },
    reach: {
      eyebrow: "일이 들어오는 방식",
      title: "라이더가 코치를 고르거나,",
      accent: "앱이 열려 있는 코치 모두에게 묻습니다",
      lede: "일이 오는 길은 둘입니다. 어느 쪽을 받을지는 코치가 정합니다.",
      cards: [
        {
          title: "무엇이 오는가",
          points: [
            "라이더 휴대폰에 있는 클립 하나, 최대 30초",
            "짧은 제목, 봐줬으면 하는 부분 몇 줄, 그리고 저장된 스탠스·장비 셋업",
            "라이더의 언어 — 자막과 메모는 7개 언어 사이에서 번역되므로 그 언어를 몰라도 됨",
          ],
        },
        {
          title: "오는 길 두 가지",
          points: [
            "라이더가 코치 목록에서 직접 지목",
            "또는 앱이 열려 있는 코치 전원에게 요청을 보냄 — 먼저 수락한 코치가 가져감",
            "라이더는 하루 안에 답이 온다고 안내받음",
          ],
        },
        {
          title: "설정 세 가지",
          points: [
            "Open to Requests — 둘 다 받음",
            "Direct Request Only — 직접 지목한 라이더만",
            "Off Duty — 다시 켤 때까지 아무것도 안 옴",
          ],
        },
        {
          title: "시간과 한도",
          points: [
            "수락까지 2시간, 시간이 다 되기 전에 알림",
            "동시에 3건까지 (Advanced Coaching은 2건) — 보낸 리뷰도 라이더의 24시간이 끝날 때까지 셈",
            "거절한 요청은 다시 오지 않음 — 다른 코치들은 계속 받을 수 있음",
          ],
        },
      ],
      shotAlt: "Open to Requests · Direct Request Only · Off Duty 선택 화면",
      shotCaption: "My Earnings → Request Status에서 코치가 직접 바꿉니다.",
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
          { title: "크레딧 구매", body: "크레딧 팩을 사거나, Pro 구독에 포함된 크레딧을 받습니다." },
          { title: "리뷰 요청", body: "Coaching과 Advanced Coaching 중 고릅니다. 크레딧은 이때 차감됩니다." },
        ],
        coachLabel: "코치",
        coachNodes: [
          { title: "리뷰 전송", body: "보내는 순간 보수가 대기 상태로 기록됩니다." },
          { title: "승인", body: "라이더가 수락하거나, 이의 없이 24시간이 지나면 승인됩니다." },
          { title: "송금 대기", body: "등록한 은행 계좌로 보낼 순서에 오릅니다." },
          { title: "입금", body: "StancePro가 송금하고 송금 수수료도 부담합니다." },
        ],
        note:
          "멈출 수 있는 지점은 둘입니다. 라이더가 문제를 제기하면 StancePro가 리뷰를 보고 판단합니다 — 라이더 혼자서 코치의 보수를 취소할 수는 없습니다. 은행 계좌가 아직 없으면 계좌를 넣을 때까지 돈이 기다립니다. 송금은 StancePro가 직접 보내므로 며칠 여유를 두시면 됩니다.",
      },
      card: {
        title: "얼마를 받는가",
        points: [
          "리뷰 한 편마다 정해진 금액 — 라이더가 고른 리뷰 종류로 결정",
          "모든 코치가 동일 — 입찰도 흥정도 없음",
          "라이더는 StancePro에 지불하고 코치는 정해진 보수를 받음 — 그 차액은 StancePro가 플랫폼 운영에 씀",
        ],
      },
      shotAlt: "My Earnings 화면",
      shotCaption: "수입, 대기 중인 보수, 평점, 이력 — 전부 My Earnings에 있습니다.",
    },
    begin: {
      eyebrow: "시작하는 법",
      title: "세 단계,",
      accent: "전부 앱 안에서",
      lede: "Coaching 탭 → Become a Coach. 세 단계가 끝나면 라이더에게 보이기 시작합니다.",
      steps: [
        {
          title: "신청",
          points: [
            "자격증(협회·레벨·연도·증빙 사진), 전문 분야, 언어, 짧은 소개글",
            "샘플 리뷰 하나 — 제시된 클립을 실제 고객 라이더에게 하듯 코칭",
            "Coach Services Agreement 동의",
          ],
        },
        {
          title: "승인",
          points: [
            "자격증을 확인하고 코치 레벨을 정함",
            "Advanced Coaching 요청은 Trainer/Examiner 레벨 코치에게만",
            "반려되면 같은 신청서를 고쳐서 다시 제출",
          ],
        },
        {
          title: "은행 계좌 등록",
          points: [
            "이게 진짜 스위치 — 넣기 전까지는 라이더에게 안 보임",
            "국가, 통화, 계좌 정보 — 몇 분이면 끝남",
            "42개국으로 송금 가능, 폼에는 그 나라 항목만 나타남",
          ],
        },
      ],
      shots: [
        {
          alt: "코치 신청서의 자격증·전문 분야 화면",
          caption: "자격증, 전문 분야, 언어가 한 폼에 들어갑니다.",
        },
        {
          alt: "종목·협회·레벨·연도를 넣는 자격증 추가 화면",
          caption: "자격증마다 증빙 사진이 필요합니다.",
        },
        {
          alt: "My Earnings의 은행 계좌·계약 상태",
          caption: "은행 계좌와 계약 상태는 My Earnings에서 봅니다.",
        },
      ],
    },
    cta: {
      title: "시작해 볼까요?",
      body: "앱을 받고 Coaching 탭에서 Become a Coach를 누르세요.",
      primary: "앱 받기",
      secondary: "Coach Services Agreement 읽기",
      note: "신청 전 궁금한 점은 Support 페이지로 문의해 주세요.",
    },
    disclaimer:
      "화면은 예시 데이터로 표시했습니다. 스크린샷의 코치·라이더 이름, 금액, 평점, 계좌 정보는 모두 가상입니다.",
  },
} as const;
