import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFixes, checkShipment, verdict } from "../src/core/checks.ts";
import { riceToJebelAli, towelsToHamburg } from "../src/core/samples.ts";
import { lookupHs } from "../src/core/hs.ts";

const rules = (s: typeof towelsToHamburg) => checkShipment(s).map((i) => i.rule).sort();

test("clean shipment passes", () => {
  assert.deepEqual(checkShipment(riceToJebelAli), []);
  assert.equal(verdict([]).ok, true);
});

test("finds every planted mistake in the towels shipment", () => {
  const found = rules(towelsToHamburg);
  for (const r of ["invoice-ref", "line-amount", "invoice-total", "qty-match", "hs-match", "gross-net", "insurance"]) {
    assert.ok(found.includes(r), `missing ${r}; got ${found.join(", ")}`);
  }
  assert.equal(verdict(checkShipment(towelsToHamburg)).ok, false);
});

test("blockers sort first", () => {
  const sev = checkShipment(towelsToHamburg).map((i) => i.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => ["blocker", "warning", "info"].indexOf(a) - ["blocker", "warning", "info"].indexOf(b)));
});

test("applyFixes repairs the arithmetic and references, leaves judgement calls alone", () => {
  const fixed = applyFixes(towelsToHamburg, checkShipment(towelsToHamburg));
  assert.equal(fixed.invoice.lines[1].amount, 4680);
  assert.equal(fixed.invoice.total, 15760);
  assert.equal(fixed.packing.invoiceNo, towelsToHamburg.invoice.invoiceNo);
  const left = rules(fixed);
  assert.ok(!left.includes("line-amount") && !left.includes("invoice-total") && !left.includes("invoice-ref"));
  assert.ok(left.includes("qty-match"), "quantity mismatch needs a human to check what was packed");
  assert.equal(towelsToHamburg.invoice.lines[1].amount, 4608, "original not mutated");
});

test("packing totals and CFR freight", () => {
  const s = structuredClone(riceToJebelAli);
  s.packing.totalGrossKg = 34000;
  s.invoice.incoterm = "CFR";
  const found = checkShipment(s);
  assert.ok(found.some((i) => i.rule === "packing-total" && i.fix?.value === 34532));
  assert.ok(found.some((i) => i.rule === "freight"));
  assert.ok(found.some((i) => i.rule === "invoice-total") === false, "CFR with no freight adds 0");
});

test("bad IEC, incoterm and HS format", () => {
  const s = structuredClone(riceToJebelAli);
  s.invoice.iec = "12345";
  s.invoice.incoterm = "FOR";
  s.invoice.lines[0].hsCode = "100630";
  s.packing.lines[0].hsCode = "100630";
  const found = checkShipment(s).map((i) => i.rule);
  assert.ok(found.includes("iec") && found.includes("incoterm") && found.includes("hs-format"));
});

test("HS lookup by keyword and by code", () => {
  assert.equal(lookupHs("printed bed sheets")[0].code6, "630221");
  assert.equal(lookupHs("bath towel")[0].code6, "630260");
  assert.equal(lookupHs("10063020")[0].code6, "100630");
  assert.deepEqual(lookupHs("spaceship"), []);
});
