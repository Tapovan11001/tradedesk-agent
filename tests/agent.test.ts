import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTradeDeskAgent } from "../src/agent.ts";
import { scriptedModel, lastToolResults } from "../src/harness/index.ts";
import { towelsToHamburg } from "../src/core/samples.ts";

test("agent passes extracted documents to the checker and reports its verdict", async () => {
  const model = scriptedModel([
    { tools: [{ name: "check_documents", input: { invoice: towelsToHamburg.invoice, packing: towelsToHamburg.packing } }] },
    (req) => ({ text: JSON.parse(lastToolResults(req)[0]).verdict }),
  ]);
  const { agent, lastCheck } = makeTradeDeskAgent(model);
  const r = await agent.run("…pasted documents…");
  assert.equal(r.status, "done");
  assert.match(r.output, /6 blockers and 1 warning/);
  assert.equal(lastCheck.issues?.length, 7);
});

test("a malformed extraction is rejected before the checker runs", async () => {
  const bad = structuredClone(towelsToHamburg.invoice) as any;
  delete bad.total;
  bad.lines[0].qty = "1200";
  const model = scriptedModel([
    { tools: [{ name: "check_documents", input: { invoice: bad, packing: towelsToHamburg.packing } }] },
    (req) => ({ text: lastToolResults(req)[0] }),
  ]);
  const { agent, lastCheck } = makeTradeDeskAgent(model);
  const r = await agent.run("x");
  assert.match(r.output, /input.invoice.total is required/);
  assert.match(r.output, /input.invoice.lines\[0\].qty must be a number/);
  assert.equal(lastCheck.issues, null);
});
