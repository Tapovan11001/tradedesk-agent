import { Agent, defineTool, type ModelClient, type TraceEvent } from "./harness/index.ts";
import type { JsonSchema } from "./harness/types.ts";
import { checkShipment, verdict } from "./core/checks.ts";
import { lookupHs } from "./core/hs.ts";
import type { Invoice, Issue, PackingList } from "./core/types.ts";

const str = (description?: string): JsonSchema => ({ type: "string", description });
const num = (description?: string): JsonSchema => ({ type: "number", description });

const invoiceSchema: JsonSchema = {
  type: "object",
  properties: {
    invoiceNo: str(), date: str("YYYY-MM-DD"), exporter: str(), iec: str("Importer-Exporter Code exactly as printed"),
    consignee: str(), currency: str("ISO code, e.g. USD"), incoterm: str("e.g. FOB, CIF"),
    portOfLoading: str(), portOfDischarge: str(), countryOfOrigin: str(), countryOfDestination: str(),
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { line: { type: "integer" }, description: str(), hsCode: str(), qty: num(), unit: str(), unitPrice: num(), amount: num() },
        required: ["line", "description", "hsCode", "qty", "unit", "unitPrice", "amount"],
      },
    },
    freight: num("Omit if not shown"), insurance: num("Omit if not shown"), total: num(),
  },
  required: ["invoiceNo", "date", "exporter", "iec", "consignee", "currency", "incoterm", "portOfLoading", "portOfDischarge", "countryOfOrigin", "countryOfDestination", "lines", "total"],
};

const packingSchema: JsonSchema = {
  type: "object",
  properties: {
    invoiceNo: str("The invoice number the packing list refers to"), date: str("YYYY-MM-DD"),
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { line: { type: "integer" }, description: str(), hsCode: str(), qty: num(), unit: str(), packages: num(), netKg: num(), grossKg: num() },
        required: ["line", "description", "hsCode", "qty", "unit", "packages", "netKg", "grossKg"],
      },
    },
    totalPackages: num(), totalNetKg: num(), totalGrossKg: num(),
  },
  required: ["invoiceNo", "date", "lines", "totalPackages", "totalNetKg", "totalGrossKg"],
};

export const SYSTEM = `You check export documents for Indian exporters before they go to customs.

The user pastes a commercial invoice and a packing list (copied from PDFs, so the layout may be messy).

1. Read both documents and call check_documents with every field copied EXACTLY as printed. Do not fix anything while extracting: if a total looks wrong, copy the wrong total. The checker's job is to find mistakes; yours is to give it a faithful copy. If a field is genuinely not on the document, use an empty string.
2. If the checker flags an HS code, call lookup_hs_code to see what the description usually falls under.
3. Reply with:
   - one line saying whether the shipment is ready to file,
   - the problems in order of importance, each with the exact fix (which document, which field, what value) when it can be worked out, and what to physically check when it can't,
   - a short, polite email the exporter can send to their CHA or freight forwarder listing the corrections.
Never invent values that aren't in the documents. Use plain language a busy export manager can act on.`;

export function makeTradeDeskAgent(model: ModelClient, onEvent?: (e: TraceEvent) => void) {
  const lastCheck: { issues: Issue[] | null } = { issues: null };

  const checkDocuments = defineTool<{ invoice: Invoice; packing: PackingList }>({
    name: "check_documents",
    description: "Run the rule-based cross-check on an invoice and packing list. Returns every issue found and a verdict.",
    input: { type: "object", properties: { invoice: invoiceSchema, packing: packingSchema }, required: ["invoice", "packing"] },
    run: ({ invoice, packing }) => {
      const issues = checkShipment({ invoice, packing });
      lastCheck.issues = issues;
      return { verdict: verdict(issues).headline, issues };
    },
  });

  const lookupHsCode = defineTool<{ query: string }>({
    name: "lookup_hs_code",
    description: "Look up the 6-digit HS heading for a product description or code. Returns matching headings with their official descriptions.",
    input: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: ({ query }) => {
      const hits = lookupHs(query);
      return hits.length ? hits.slice(0, 3) : "No match in the reference table. Check the ITC-HS schedule directly.";
    },
  });

  const agent = new Agent({ model, system: SYSTEM, tools: [checkDocuments, lookupHsCode], limits: { maxSteps: 6 }, onEvent });
  return { agent, lastCheck };
}
