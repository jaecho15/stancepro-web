const PALETTE = [
  "#38bdf8",
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#fb923c",
  "#a78bfa",
  "#2dd4bf",
  "#f87171",
  "#94a3b8",
];

export function vendorColorMap(vendors: string[]): Map<string, string> {
  const sorted = [...new Set(vendors)].sort();
  const map = new Map<string, string>();
  sorted.forEach((v, i) => map.set(v, PALETTE[i % PALETTE.length]));
  return map;
}
