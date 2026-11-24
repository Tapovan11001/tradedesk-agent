// The two documents every export shipment needs to agree on.
// Field names follow what's printed on a typical Indian export invoice.

export interface InvoiceLine {
  line: number;
  description: string;
  hsCode: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  invoiceNo: string;
  date: string; // YYYY-MM-DD
  exporter: string;
  iec: string; // Importer-Exporter Code, 10 characters
  consignee: string;
  currency: string;
  incoterm: string;
  portOfLoading: string;
  portOfDischarge: string;
  countryOfOrigin: string;
  countryOfDestination: string;
  lines: InvoiceLine[];
  freight?: number;
  insurance?: number;
  total: number;
}

export interface PackingLine {
  line: number;
  description: string;
  hsCode: string;
  qty: number;
  unit: string;
  packages: number;
  netKg: number;
  grossKg: number;
}

export interface PackingList {
  invoiceNo: string;
  date: string;
  lines: PackingLine[];
  totalPackages: number;
  totalNetKg: number;
  totalGrossKg: number;
}

export type Severity = "blocker" | "warning" | "info";

export interface Issue {
  /** Stable id of the rule that raised it, e.g. "line-amount". */
  rule: string;
  severity: Severity;
  /** Where to look, e.g. "invoice.lines[2].amount". Used to highlight cells. */
  field: string;
  message: string;
  /** A concrete fix when the right value can be computed. */
  fix?: { doc: "invoice" | "packing"; path: string; value: string | number };
}

export interface Shipment {
  invoice: Invoice;
  packing: PackingList;
}
