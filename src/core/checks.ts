import { suggestHs } from "./hs.ts";
import type { Issue, Shipment } from "./types.ts";

// Every check is plain code: same input, same issues, no model involved.
// The agent's job is getting messy documents INTO this shape and explaining
// the result; deciding what's wrong is done here so it can be tested.

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "JPY", "SGD", "AUD", "CAD", "SAR", "CHF"];
const MONEY_TOLERANCE = 0.01;
const KG_TOLERANCE = 0.05;

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function checkShipment({ invoice, packing }: Shipment): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  // ---- header fields ----
  const required: [keyof typeof invoice, string][] = [
    ["invoiceNo", "Invoice number"], ["exporter", "Exporter"], ["consignee", "Consignee"],
    ["portOfLoading", "Port of loading"], ["portOfDischarge", "Port of discharge"],
    ["countryOfOrigin", "Country of origin"], ["countryOfDestination", "Country of final destination"],
  ];
  for (const [key, label] of required) {
    if (!String(invoice[key] ?? "").trim()) add({ rule: "required", severity: "blocker", field: `invoice.${key}`, message: `${label} is missing on the invoice.` });
  }
  if (!/^[A-Z0-9]{10}$/.test((invoice.iec ?? "").trim())) {
    add({ rule: "iec", severity: "blocker", field: "invoice.iec", message: `IEC "${invoice.iec || "(blank)"}" should be 10 letters or digits. Customs won't file the shipping bill without a valid IEC.` });
  }
  if (!CURRENCIES.includes(invoice.currency)) {
    add({ rule: "currency", severity: "warning", field: "invoice.currency", message: `"${invoice.currency}" isn't a currency code this checker knows. Use the ISO code (USD, EUR, AED...).` });
  }
  if (!INCOTERMS.includes(invoice.incoterm)) {
    add({ rule: "incoterm", severity: "blocker", field: "invoice.incoterm", message: `"${invoice.incoterm}" isn't an Incoterms 2020 rule.` });
  }

  // ---- the two documents must describe the same shipment ----
  if (invoice.invoiceNo.trim() !== packing.invoiceNo.trim()) {
    add({
      rule: "invoice-ref", severity: "blocker", field: "packing.invoiceNo",
      message: `Packing list refers to invoice ${packing.invoiceNo}, but the invoice is ${invoice.invoiceNo}.`,
      fix: { doc: "packing", path: "invoiceNo", value: invoice.invoiceNo },
    });
  }
  const daysApart = Math.abs(Date.parse(invoice.date) - Date.parse(packing.date)) / 86_400_000;
  if (Number.isFinite(daysApart) && daysApart > 7) {
    add({ rule: "dates", severity: "warning", field: "packing.date", message: `Invoice and packing list are dated ${Math.round(daysApart)} days apart. They're normally issued together.` });
  }

  // ---- invoice arithmetic ----
  let lineSum = 0;
  invoice.lines.forEach((l, i) => {
    const expected = round2(l.qty * l.unitPrice);
    lineSum += l.amount;
    if (!near(expected, l.amount, MONEY_TOLERANCE)) {
      add({
        rule: "line-amount", severity: "blocker", field: `invoice.lines[${i}].amount`,
        message: `Line ${l.line}: ${l.qty} × ${l.unitPrice} = ${expected.toFixed(2)}, but the amount says ${l.amount.toFixed(2)}.`,
        fix: { doc: "invoice", path: `lines[${i}].amount`, value: expected },
      });
    }
  });
  const addOns = invoice.incoterm === "CIF" || invoice.incoterm === "CIP" ? (invoice.freight ?? 0) + (invoice.insurance ?? 0) : invoice.incoterm === "CFR" || invoice.incoterm === "CPT" ? invoice.freight ?? 0 : 0;
  const expectedTotal = round2(invoice.lines.reduce((s, l) => s + round2(l.qty * l.unitPrice), 0) + addOns);
  if (!near(expectedTotal, invoice.total, MONEY_TOLERANCE)) {
    add({
      rule: "invoice-total", severity: "blocker", field: "invoice.total",
      message: `Invoice total is ${invoice.total.toFixed(2)} but the lines${addOns ? " plus freight/insurance" : ""} add up to ${expectedTotal.toFixed(2)}.`,
      fix: { doc: "invoice", path: "total", value: expectedTotal },
    });
  }
  if ((invoice.incoterm === "CIF" || invoice.incoterm === "CIP") && !invoice.insurance) {
    add({ rule: "insurance", severity: "warning", field: "invoice.insurance", message: `Terms are ${invoice.incoterm}, so you're paying for insurance, but no insurance amount is shown. Customs values CIF shipments with it.` });
  }
  if ((invoice.incoterm === "CIF" || invoice.incoterm === "CFR") && !invoice.freight) {
    add({ rule: "freight", severity: "warning", field: "invoice.freight", message: `Terms are ${invoice.incoterm} but no freight amount is shown.` });
  }

  // ---- line-by-line match ----
  if (invoice.lines.length !== packing.lines.length) {
    add({ rule: "line-count", severity: "blocker", field: "packing.lines", message: `Invoice has ${invoice.lines.length} lines, packing list has ${packing.lines.length}.` });
  }
  invoice.lines.forEach((inv, i) => {
    const pk = packing.lines.find((p) => p.line === inv.line);
    if (!pk) return;
    const pi = packing.lines.indexOf(pk);
    if (inv.qty !== pk.qty || inv.unit.toLowerCase() !== pk.unit.toLowerCase()) {
      add({
        rule: "qty-match", severity: "blocker", field: `packing.lines[${pi}].qty`,
        message: `Line ${inv.line}: invoice says ${inv.qty} ${inv.unit}, packing list says ${pk.qty} ${pk.unit}. One of them is wrong; check what was actually packed.`,
      });
    }
    const a = digits(inv.hsCode), b = digits(pk.hsCode);
    if (a !== b) {
      add({ rule: "hs-match", severity: "blocker", field: `packing.lines[${pi}].hsCode`, message: `Line ${inv.line}: HS code is ${inv.hsCode} on the invoice but ${pk.hsCode} on the packing list.` });
    }
    if (a.length !== 8) {
      add({ rule: "hs-format", severity: "blocker", field: `invoice.lines[${i}].hsCode`, message: `Line ${inv.line}: "${inv.hsCode}" should be an 8-digit ITC-HS code for an Indian shipping bill.` });
    }
    const guess = suggestHs(inv.description);
    if (guess && a.length >= 6 && !a.startsWith(guess.code6)) {
      add({
        rule: "hs-plausible", severity: "warning", field: `invoice.lines[${i}].hsCode`,
        message: `Line ${inv.line}: "${inv.description}" usually falls under ${fmtHs(guess.code6)} (${guess.description}), but it's declared as ${inv.hsCode}. Worth a second look before filing.`,
      });
    }

    // weights
    if (pk.grossKg < pk.netKg) {
      add({ rule: "gross-net", severity: "blocker", field: `packing.lines[${pi}].grossKg`, message: `Line ${pk.line}: gross weight (${pk.grossKg} kg) is less than net weight (${pk.netKg} kg). Gross includes packaging, so it can't be lower.` });
    } else if (pk.netKg > 0 && (pk.grossKg - pk.netKg) / pk.netKg > 0.3) {
      add({ rule: "tare", severity: "info", field: `packing.lines[${pi}].grossKg`, message: `Line ${pk.line}: packaging is ${Math.round(((pk.grossKg - pk.netKg) / pk.netKg) * 100)}% of net weight. Fine if that's right, but it's on the high side.` });
    }
  });

  // ---- packing list totals ----
  const sum = (k: "packages" | "netKg" | "grossKg") => round2(packing.lines.reduce((s, l) => s + l[k], 0));
  const totals: ["packages" | "netKg" | "grossKg", "totalPackages" | "totalNetKg" | "totalGrossKg", string, number][] = [
    ["packages", "totalPackages", "packages", 0],
    ["netKg", "totalNetKg", "kg net", KG_TOLERANCE],
    ["grossKg", "totalGrossKg", "kg gross", KG_TOLERANCE],
  ];
  for (const [k, total, label, tol] of totals) {
    const s = sum(k);
    if (!near(s, packing[total], tol)) {
      add({
        rule: "packing-total", severity: "blocker", field: `packing.${total}`,
        message: `Packing list total says ${packing[total]} ${label}, but the lines add up to ${s}.`,
        fix: { doc: "packing", path: total, value: s },
      });
    }
  }

  return issues.sort((a, b) => rank(a.severity) - rank(b.severity));
}

export function verdict(issues: Issue[]): { ok: boolean; headline: string } {
  const blockers = issues.filter((i) => i.severity === "blocker").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  if (blockers) return { ok: false, headline: `${blockers} blocker${blockers > 1 ? "s" : ""}${warnings ? ` and ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}. Fix before filing the shipping bill.` };
  if (warnings) return { ok: true, headline: `No blockers. ${warnings} warning${warnings > 1 ? "s" : ""} worth a look.` };
  return { ok: true, headline: "Invoice and packing list agree. Good to file." };
}

/** Apply every computable fix. Returns a new shipment; does not mutate. */
export function applyFixes(s: Shipment, issues: Issue[]): Shipment {
  const next: Shipment = structuredClone(s);
  for (const i of issues) {
    if (!i.fix) continue;
    const root: any = i.fix.doc === "invoice" ? next.invoice : next.packing;
    setPath(root, i.fix.path, i.fix.value);
  }
  return next;
}

function setPath(obj: any, path: string, value: unknown) {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p];
  cur[parts[parts.length - 1]] = value;
}

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const fmtHs = (c: string) => `${c.slice(0, 4)}.${c.slice(4, 6)}`;
const rank = (s: Issue["severity"]) => ({ blocker: 0, warning: 1, info: 2 })[s];
