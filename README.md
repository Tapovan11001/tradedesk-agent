# TradeDesk

Checks an export invoice against its packing list before either one reaches your CHA (customs broker). It flags quantities that don't match, amounts that don't add up, HS codes that differ between the two documents, gross weights lower than net, a missing IEC, a CIF invoice with no insurance, and more. Where the right value can be worked out, it tells you the exact fix.

**Live:** {{live-url}} (the sample documents work without an API key)

## How it works in 100 words

Exporters send two documents with every shipment: an invoice (what was sold, and for how much) and a packing list (what is inside the boxes). If they disagree, customs holds the shipment. TradeDesk compares them line by line. It checks that quantities match, that every amount and total adds up, that the HS codes (customs product categories) are the same on both, and that the weights make sense. Each problem is marked on the document itself, with the exact fix when it can be calculated. Paste real documents and Claude reads them and fills in the fields, then the same checks run on what it found.

_Created by Aarov Makhija._

## Why I built this

When an invoice says 1,200 pieces and the packing list says 1,180, the shipment stops. The shipping bill gets held, the CHA calls, someone re-issues documents, and the container misses its cut-off. These mistakes are almost always small and arithmetic, and they're exactly the kind of thing a computer should catch before a person has to.

## How it works

There are two parts, and the split is deliberate.

1. **The checker** ([`src/core/checks.ts`](src/core/checks.ts)) is plain TypeScript. It takes a structured invoice and packing list and returns a list of issues, each with a severity (blocker, warning, info), the field it's about, a message, and a fix when one can be computed. No AI involved: same input, same answer, fully unit-tested.
2. **The agent** ([`src/agent.ts`](src/agent.ts)) handles the messy part: reading documents copied out of PDFs. Claude reads the text and calls the `check_documents` tool with every field copied exactly as printed. It's told not to correct anything while copying, because finding mistakes is the checker's job. Then it looks up HS headings for anything flagged and writes a plain-language report plus an email to the CHA.

The agent runs on [TinyHarness](https://github.com/Tapovan11001/tinyharness), my small agent loop, vendored in `src/harness/`. If Claude's extraction has the wrong shape (a missing total, a quantity as text), the harness rejects it with a readable error and Claude fixes it on the next step.

```
pasted PDF text ──▶ Claude extracts fields ──▶ check_documents (rules) ──▶ issues
                                   ▲                    │
                                   └── schema errors ───┘
                                                        ▼
                                  Claude: report + email to CHA
```

## What it checks

| Rule | Severity | Example |
|---|---|---|
| Invoice number on packing list matches | Blocker | `0174` vs `0147` |
| Line amount = qty × rate | Blocker | 2400 × 1.95 written as 4,608 |
| Invoice total = lines (+ freight/insurance for CIF/CFR) | Blocker | |
| Quantity and unit match per line | Blocker | 1,200 PCS vs 1,180 PCS |
| HS code matches per line, and is 8 digits | Blocker | 63023100 vs 63022190 |
| Gross weight ≥ net weight | Blocker | 528 kg gross, 540 kg net |
| Packing list totals add up | Blocker | |
| IEC is 10 characters, Incoterm is valid | Blocker | |
| HS heading plausible for the description | Warning | towels declared under a bed-linen heading |
| CIF/CIP with no insurance, CIF/CFR with no freight | Warning | |
| Invoice and packing list dated more than 7 days apart | Warning | |
| Packaging over 30% of net weight | Info | |

HS codes are checked at the internationally shared 6-digit level against a small reference table. The last two digits of an Indian ITC-HS code are a national tariff line and still need checking against the current schedule.

## Run it

```bash
npm install
npm test         # 9 tests: every rule, the fixer, and the agent wiring
npm run eval     # end-to-end on both samples (scripted model)
npm run dev      # web app at localhost:5173
LIVE=1 ANTHROPIC_API_KEY=... npm run eval   # same eval, with Claude reading the raw text
```

## Project layout

| Path | What's in it |
|---|---|
| `src/core/types.ts` | Invoice, packing list and issue shapes |
| `src/core/checks.ts` | The rules, the verdict, and the auto-fixer |
| `src/core/hs.ts` | 6-digit HS reference table and lookup |
| `src/core/samples.ts` | Two fictional shipments (one with six planted mistakes, one clean) |
| `src/agent.ts` | Tools, schemas and the system prompt |
| `src/harness/` | TinyHarness, vendored |
| `web/` | The app: documents rendered as paper, problem cells highlighted |

## Limits

- Text input only. PDFs need copying to text first (or a PDF-to-text step, which is next).
- The HS table is small and only covers a few product families.
- It checks consistency, not compliance. It won't tell you whether a product needs a licence or certificate of origin.

## Case study

[docs/case-study.md](docs/case-study.md)

## License

MIT
