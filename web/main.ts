import { applyFixes, checkShipment, verdict } from "../src/core/checks.ts";
import { SAMPLES, asPlainText } from "../src/core/samples.ts";
import type { Issue, Shipment } from "../src/core/types.ts";
import { makeTradeDeskAgent } from "../src/agent.ts";
import { anthropicModel } from "../src/harness/models/anthropic.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let original: Shipment = SAMPLES[0].shipment;
let shipment: Shipment = original;
let issues: Issue[] = [];
let fixedFields = new Set<string>();
let tab: "invoice" | "packing" = "invoice";

// ---------- rendering ----------
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number | undefined) => (n === undefined ? "" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qty = (n: number) => n.toLocaleString("en-IN");

function field(path: string, label: string, value: unknown, wide = false) {
  return `<div class="f${wide ? " wide" : ""}" data-f="${path}"><span class="k">${label}</span><span class="v">${esc(value) || "&nbsp;"}</span></div>`;
}

function renderInvoice(s: Shipment): string {
  const i = s.invoice;
  const rows = i.lines.map((l, n) => `
    <tr>
      <td class="n">${l.line}</td>
      <td>${esc(l.description)}</td>
      <td class="mono" data-f="invoice.lines[${n}].hsCode">${esc(l.hsCode)}</td>
      <td class="n" data-f="invoice.lines[${n}].qty">${qty(l.qty)} ${esc(l.unit)}</td>
      <td class="n">${money(l.unitPrice)}</td>
      <td class="n" data-f="invoice.lines[${n}].amount">${money(l.amount)}</td>
    </tr>`).join("");
  const extra = [
    i.freight !== undefined || ["CIF", "CFR", "CIP", "CPT"].includes(i.incoterm) ? `<tr><td colspan="5">Freight</td><td class="n" data-f="invoice.freight">${money(i.freight) || "—"}</td></tr>` : "",
    i.insurance !== undefined || ["CIF", "CIP"].includes(i.incoterm) ? `<tr><td colspan="5">Insurance</td><td class="n" data-f="invoice.insurance">${money(i.insurance) || "—"}</td></tr>` : "",
  ].join("");
  return `
    <h2 class="doc-title">Commercial Invoice</h2>
    <div class="fields">
      ${field("invoice.invoiceNo", "Invoice no.", i.invoiceNo)}${field("invoice.date", "Date", i.date)}
      ${field("invoice.exporter", "Exporter", i.exporter)}${field("invoice.iec", "IEC", i.iec)}
      ${field("invoice.consignee", "Consignee", i.consignee, true)}
      ${field("invoice.portOfLoading", "Port of loading", i.portOfLoading)}${field("invoice.portOfDischarge", "Port of discharge", i.portOfDischarge)}
      ${field("invoice.countryOfOrigin", "Country of origin", i.countryOfOrigin)}${field("invoice.countryOfDestination", "Final destination", i.countryOfDestination)}
      ${field("invoice.incoterm", "Terms of delivery", i.incoterm)}${field("invoice.currency", "Currency", i.currency)}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th class="n">Sr</th><th>Description of goods</th><th>HS code</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead>
      <tbody>${rows}${extra}</tbody>
      <tfoot><tr><td colspan="5">Total ${esc(i.incoterm)} ${esc(i.currency)}</td><td class="n" data-f="invoice.total">${money(i.total)}</td></tr></tfoot>
    </table></div>`;
}

function renderPacking(s: Shipment): string {
  const p = s.packing;
  const rows = p.lines.map((l, n) => `
    <tr>
      <td class="n">${l.line}</td>
      <td>${esc(l.description)}</td>
      <td class="mono" data-f="packing.lines[${n}].hsCode">${esc(l.hsCode)}</td>
      <td class="n" data-f="packing.lines[${n}].qty">${qty(l.qty)} ${esc(l.unit)}</td>
      <td class="n">${qty(l.packages)}</td>
      <td class="n" data-f="packing.lines[${n}].netKg">${qty(l.netKg)}</td>
      <td class="n" data-f="packing.lines[${n}].grossKg">${qty(l.grossKg)}</td>
    </tr>`).join("");
  return `
    <h2 class="doc-title">Packing List</h2>
    <div class="fields">
      ${field("packing.invoiceNo", "Against invoice no.", p.invoiceNo)}${field("packing.date", "Date", p.date)}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th class="n">Sr</th><th>Description</th><th>HS code</th><th class="n">Qty</th><th class="n">Pkgs</th><th class="n">Net kg</th><th class="n">Gross kg</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4">Total</td>
        <td class="n" data-f="packing.totalPackages">${qty(p.totalPackages)}</td>
        <td class="n" data-f="packing.totalNetKg">${qty(p.totalNetKg)}</td>
        <td class="n" data-f="packing.totalGrossKg">${qty(p.totalGrossKg)}</td></tr></tfoot>
    </table></div>`;
}

function render() {
  $("doc").innerHTML = tab === "invoice" ? renderInvoice(shipment) : renderPacking(shipment);
  for (const el of $("doc").querySelectorAll<HTMLElement>("[data-f]")) {
    const f = el.dataset.f!;
    const hit = issues.find((i) => i.field === f);
    if (hit) el.classList.add(`sev-${hit.severity}`);
    else if (fixedFields.has(f)) el.classList.add("fixed");
  }
  const per = (doc: string) => issues.filter((i) => i.field.startsWith(doc) && i.severity !== "info").length || "";
  $("count-invoice").textContent = String(per("invoice"));
  $("count-packing").textContent = String(per("packing"));

  const v = verdict(issues);
  $("verdict").classList.toggle("ok", v.ok);
  $("stamp").textContent = v.ok ? "CLEAR" : "HOLD";
  $("headline").textContent = v.headline;
  $<HTMLButtonElement>("fix").disabled = !issues.some((i) => i.fix);

  const list = $("issues");
  list.replaceChildren(
    ...issues.map((i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = `issue ${i.severity}`;
      b.innerHTML = `<span class="meta"><span class="sev"></span><span class="where"></span></span><span class="msg"></span>`;
      b.querySelector(".sev")!.textContent = i.severity;
      b.querySelector(".where")!.textContent = i.field.startsWith("invoice") ? "Invoice" : "Packing list";
      b.querySelector(".msg")!.textContent = i.message;
      if (i.fix) {
        const fx = document.createElement("span");
        fx.className = "fixline";
        fx.textContent = `Fix: set to ${typeof i.fix.value === "number" ? money(i.fix.value) : i.fix.value}`;
        b.append(fx);
      }
      b.addEventListener("click", () => focusField(i.field));
      li.append(b);
      return li;
    }),
  );
}

function focusField(f: string) {
  const want = f.startsWith("invoice") ? "invoice" : "packing";
  if (tab !== want) setTab(want);
  const el = $("doc").querySelector<HTMLElement>(`[data-f="${CSS.escape(f)}"]`) ?? $("doc").querySelector<HTMLElement>(`[data-f^="${CSS.escape(f)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function setTab(t: typeof tab) {
  tab = t;
  $("tab-invoice").classList.toggle("on", t === "invoice");
  $("tab-packing").classList.toggle("on", t === "packing");
  $("tab-invoice").setAttribute("aria-selected", String(t === "invoice"));
  $("tab-packing").setAttribute("aria-selected", String(t === "packing"));
  render();
}

function load(s: Shipment) {
  original = s;
  shipment = s;
  fixedFields = new Set();
  issues = checkShipment(shipment);
  render();
}

// ---------- controls ----------
const chips = $("samples");
for (const s of SAMPLES) {
  const b = document.createElement("button");
  b.className = "chip";
  b.dataset.id = s.id;
  b.innerHTML = `<span></span><small></small>`;
  b.querySelector("span")!.textContent = s.title;
  b.querySelector("small")!.textContent = s.note;
  b.addEventListener("click", () => {
    for (const c of chips.querySelectorAll<HTMLElement>(".chip")) c.setAttribute("aria-pressed", String(c === b));
    $<HTMLTextAreaElement>("raw").value = asPlainText(s.shipment);
    $("agent-out").hidden = true;
    load(s.shipment);
  });
  chips.append(b);
}
(chips.firstElementChild as HTMLElement).setAttribute("aria-pressed", "true");
$<HTMLTextAreaElement>("raw").value = asPlainText(SAMPLES[0].shipment);

$("tab-invoice").addEventListener("click", () => setTab("invoice"));
$("tab-packing").addEventListener("click", () => setTab("packing"));

$("fix").addEventListener("click", () => {
  for (const i of issues) if (i.fix) fixedFields.add(i.field);
  shipment = applyFixes(shipment, issues);
  issues = checkShipment(shipment);
  render();
});
$("reset").addEventListener("click", () => {
  shipment = original;
  fixedFields = new Set();
  issues = checkShipment(shipment);
  render();
});

function setMode(live: boolean) {
  $("mode-sample").classList.toggle("on", !live);
  $("mode-live").classList.toggle("on", live);
  $("mode-sample").setAttribute("aria-checked", String(!live));
  $("mode-live").setAttribute("aria-checked", String(live));
  $("live-bar").hidden = !live;
  $("sample-bar").hidden = live;
}
$("mode-sample").addEventListener("click", () => setMode(false));
$("mode-live").addEventListener("click", () => setMode(true));

try {
  const k = sessionStorage.getItem("td-key");
  if (k) $<HTMLInputElement>("api-key").value = k;
} catch {}

$("run").addEventListener("click", async () => {
  const key = $<HTMLInputElement>("api-key").value.trim();
  const status = $("run-status");
  if (!key) {
    status.textContent = "Paste an Anthropic API key first.";
    $<HTMLInputElement>("api-key").focus();
    return;
  }
  try { sessionStorage.setItem("td-key", key); } catch {}
  const btn = $<HTMLButtonElement>("run");
  btn.disabled = true;
  status.textContent = "Reading the documents…";
  const model = anthropicModel({ apiKey: key, browser: true, model: $<HTMLSelectElement>("model-id").value, maxTokens: 8000 });
  let lastInput: Shipment | null = null;
  const { agent, lastCheck } = makeTradeDeskAgent(model, (e) => {
    if (e.kind === "tool_call" && e.name === "check_documents") {
      status.textContent = "Cross-checking…";
      lastInput = e.input as Shipment;
    }
    if (e.kind === "tool_call" && e.name === "lookup_hs_code") status.textContent = "Looking up HS headings…";
    if (e.kind === "model_call" && e.stopReason === "end_turn") status.textContent = "Writing the report…";
  });
  try {
    const r = await agent.run($<HTMLTextAreaElement>("raw").value);
    if (lastInput && lastCheck.issues) {
      const s = lastInput as Shipment;
      original = s;
      shipment = s;
      fixedFields = new Set();
      issues = lastCheck.issues;
      render();
    }
    $("agent-out").hidden = !r.output;
    $("agent-text").textContent = r.output;
    const err = r.trace.find((e) => e.kind === "error");
    status.textContent =
      r.status === "done" ? `Done in ${r.steps} steps, ${(r.usage.inputTokens + r.usage.outputTokens).toLocaleString()} tokens.` :
      err && err.kind === "error" ? friendly(err.message) : `Stopped: ${r.status.replace("_", " ")}.`;
  } finally {
    btn.disabled = false;
  }
});

function friendly(msg: string) {
  if (/401|authentication|api-key/i.test(msg)) return "The API key was rejected.";
  if (/fetch|network|connection/i.test(msg)) return "Couldn't reach the Claude API from this page. Open the hosted site if this preview blocks outside requests.";
  return msg;
}

load(SAMPLES[0].shipment);
