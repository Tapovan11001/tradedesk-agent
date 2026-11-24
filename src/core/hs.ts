// A small reference table of HS headings at the internationally harmonised
// 6-digit level. India's ITC-HS adds 2 more digits for the national tariff
// line; those last two digits must be checked against the current ITC-HS
// schedule, which this table does not try to replace.

export interface HsEntry {
  code6: string;
  description: string;
  keywords: string[];
}

export const HS_TABLE: HsEntry[] = [
  { code6: "630260", description: "Toilet and kitchen linen, of terry towelling or similar terry fabrics, of cotton", keywords: ["towel", "terry", "bath towel", "hand towel"] },
  { code6: "630231", description: "Bed linen of cotton (not printed, not knitted)", keywords: ["bed sheet", "bedsheet", "pillow cover", "duvet cover", "bed linen"] },
  { code6: "630221", description: "Printed bed linen of cotton", keywords: ["printed bed sheet", "printed bedsheet", "printed bed linen"] },
  { code6: "610910", description: "T-shirts, singlets and other vests, knitted or crocheted, of cotton", keywords: ["t-shirt", "tshirt", "tee", "vest"] },
  { code6: "100630", description: "Semi-milled or wholly milled rice", keywords: ["rice", "basmati", "sona masoori"] },
  { code6: "091030", description: "Turmeric (curcuma)", keywords: ["turmeric", "haldi"] },
  { code6: "090411", description: "Pepper, neither crushed nor ground", keywords: ["black pepper", "pepper whole"] },
  { code6: "090240", description: "Black tea (fermented) and partly fermented tea, in packings over 3 kg", keywords: ["black tea", "tea", "assam tea", "darjeeling"] },
  { code6: "691200", description: "Ceramic tableware and kitchenware, other than porcelain", keywords: ["ceramic", "stoneware", "mug", "plate", "bowl"] },
  { code6: "420221", description: "Handbags with outer surface of leather", keywords: ["leather handbag", "leather bag", "handbag"] },
];

export function lookupHs(query: string): HsEntry[] {
  const q = query.toLowerCase();
  const byCode = HS_TABLE.filter((e) => q.replace(/\D/g, "").startsWith(e.code6));
  if (byCode.length) return byCode;
  return HS_TABLE.map((e) => ({ e, score: e.keywords.filter((k) => q.includes(k)).reduce((s, k) => s + k.length, 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
}

/** Best-guess 6-digit heading for a description, or null if the table has nothing. */
export function suggestHs(description: string): HsEntry | null {
  return lookupHs(description)[0] ?? null;
}
