// Does the agent copy messy document text faithfully enough for the checker to
// find the same problems it finds on the clean data?
//
//   npm run eval          -> scripted model (checks the plumbing, free)
//   LIVE=1 npm run eval   -> Claude reads the raw text (needs ANTHROPIC_API_KEY)
import { formatReport, runEvals, scriptedModel, lastToolResults, type EvalCase } from "../src/harness/index.ts";
import { anthropicModel } from "../src/harness/models/anthropic.ts";
import { makeTradeDeskAgent } from "../src/agent.ts";
import { checkShipment } from "../src/core/checks.ts";
import { SAMPLES, asPlainText } from "../src/core/samples.ts";

const live = process.env.LIVE === "1";
const captured = new Map<string, string[]>();

const cases: EvalCase[] = SAMPLES.map((s) => {
  const expected = checkShipment(s.shipment).map((i) => i.rule).sort();
  return {
    id: s.id,
    name: `${s.title}: finds ${expected.length} issue(s)`,
    input: asPlainText(s.shipment),
    check: () => {
      const got = (captured.get(s.id) ?? []).sort();
      return JSON.stringify(got) === JSON.stringify(expected) || `expected [${expected}] got [${got}]`;
    },
  };
});

const report = await runEvals(cases, (c) => {
  const sample = SAMPLES.find((s) => s.id === c.id)!;
  const model = live
    ? anthropicModel()
    : scriptedModel([
        { tools: [{ name: "check_documents", input: { invoice: sample.shipment.invoice, packing: sample.shipment.packing } }] },
        (req) => ({ text: JSON.parse(lastToolResults(req)[0]).verdict }),
      ]);
  const { agent, lastCheck } = makeTradeDeskAgent(model, (e) => {
    if (e.kind === "run_end") captured.set(c.id!, (lastCheck.issues ?? []).map((i) => i.rule));
  });
  return agent;
});

console.log(formatReport(report));
process.exit(report.passed === report.total ? 0 : 1);
