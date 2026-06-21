export type FxQuote = { rate: number; date: string; source: string };

const cache = new Map<string, FxQuote>();

function cacheKey(date: string, from: string, to: string) {
  return `${date}|${from}|${to}`;
}

export async function fetchFxRate(
  date: string,
  from: string,
  to: string
): Promise<FxQuote> {
  if (from === to) return { rate: 1, date, source: "identity" };
  const key = cacheKey(date, from, to);
  const hit = cache.get(key);
  if (hit) return hit;

  const url = `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX lookup failed (${res.status})`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  const rate = body.rates?.[to];
  if (typeof rate !== "number") throw new Error(`No ${to} rate for ${date}`);
  const quote = { rate, date: body.date, source: "frankfurter.dev (ECB)" };
  cache.set(key, quote);
  return quote;
}

export async function prefetchNzdRates(dates: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(dates)].sort();
  const out = new Map<string, number>();
  await Promise.all(
    unique.map(async (date) => {
      try {
        const q = await fetchFxRate(date, "SGD", "NZD");
        out.set(date, q.rate);
      } catch {
        /* skip — row falls back to SGD display */
      }
    })
  );
  return out;
}

export function sgdToNzd(amountSgd: number, rate: number | undefined): number | null {
  if (rate == null) return null;
  return amountSgd * rate;
}
