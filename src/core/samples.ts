import type { Shipment } from "./types.ts";

// Fictional companies and shipments. Numbers are realistic, names are made up.

/** Towels and bed linen to Germany. Six planted mistakes, the kind that really happen. */
export const towelsToHamburg: Shipment = {
  invoice: {
    invoiceNo: "KHT/EXP/26-27/0147",
    date: "2026-11-18",
    exporter: "Kaveri Home Textiles Pvt Ltd, Karur, Tamil Nadu",
    iec: "AAKCK4821M",
    consignee: "Nordhaus Wohntextil GmbH, Hamburg",
    currency: "EUR",
    incoterm: "CIF",
    portOfLoading: "Tuticorin (INTUT)",
    portOfDischarge: "Hamburg (DEHAM)",
    countryOfOrigin: "India",
    countryOfDestination: "Germany",
    lines: [
      { line: 1, description: "Cotton terry bath towels 70x140 cm, 500 GSM", hsCode: "63026090", qty: 1200, unit: "PCS", unitPrice: 4.85, amount: 5820.0 },
      { line: 2, description: "Cotton terry hand towels 50x90 cm, 500 GSM", hsCode: "63026090", qty: 2400, unit: "PCS", unitPrice: 1.95, amount: 4608.0 },
      { line: 3, description: "Cotton bed sheets, plain dyed, 230x260 cm", hsCode: "63023100", qty: 600, unit: "PCS", unitPrice: 7.4, amount: 4440.0 },
    ],
    freight: 820,
    total: 15688.0,
  },
  packing: {
    invoiceNo: "KHT/EXP/26-27/0174",
    date: "2026-11-18",
    lines: [
      { line: 1, description: "Cotton terry bath towels 70x140 cm", hsCode: "63026090", qty: 1180, unit: "PCS", packages: 60, netKg: 588, grossKg: 640 },
      { line: 2, description: "Cotton terry hand towels 50x90 cm", hsCode: "63026090", qty: 2400, unit: "PCS", packages: 40, netKg: 540, grossKg: 575 },
      { line: 3, description: "Cotton bed sheets, plain dyed", hsCode: "63022190", qty: 600, unit: "PCS", packages: 30, netKg: 540, grossKg: 528 },
    ],
    totalPackages: 130,
    totalNetKg: 1668,
    totalGrossKg: 1743,
  },
};

/** Basmati rice to Dubai. Clean: everything should pass. */
export const riceToJebelAli: Shipment = {
  invoice: {
    invoiceNo: "SFA/2026/1182",
    date: "2026-11-20",
    exporter: "Saffron Fields Agro Exports, Karnal, Haryana",
    iec: "AAJFS7719Q",
    consignee: "Al Noor Foodstuff Trading LLC, Dubai",
    currency: "USD",
    incoterm: "FOB",
    portOfLoading: "Mundra (INMUN)",
    portOfDischarge: "Jebel Ali (AEJEA)",
    countryOfOrigin: "India",
    countryOfDestination: "United Arab Emirates",
    lines: [
      { line: 1, description: "1121 Basmati rice, steam, 25 kg PP bags", hsCode: "10063020", qty: 960, unit: "BAGS", unitPrice: 35.5, amount: 34080.0 },
      { line: 2, description: "1121 Basmati rice, 5 kg retail pouches", hsCode: "10063020", qty: 2000, unit: "PCS", unitPrice: 8.1, amount: 16200.0 },
    ],
    total: 50280.0,
  },
  packing: {
    invoiceNo: "SFA/2026/1182",
    date: "2026-11-20",
    lines: [
      { line: 1, description: "1121 Basmati rice, steam, 25 kg PP bags", hsCode: "10063020", qty: 960, unit: "BAGS", packages: 960, netKg: 24000, grossKg: 24192 },
      { line: 2, description: "1121 Basmati rice, 5 kg pouches (10 per carton)", hsCode: "10063020", qty: 2000, unit: "PCS", packages: 200, netKg: 10000, grossKg: 10340 },
    ],
    totalPackages: 1160,
    totalNetKg: 34000,
    totalGrossKg: 34532,
  },
};

export const SAMPLES = [
  { id: "towels", title: "Towels to Hamburg", note: "CIF, EUR · has mistakes", shipment: towelsToHamburg },
  { id: "rice", title: "Basmati to Jebel Ali", note: "FOB, USD · clean", shipment: riceToJebelAli },
];

/** Render a shipment as the kind of plain text you'd copy out of a PDF. Used as live-mode input. */
export function asPlainText(s: Shipment): string {
  const i = s.invoice, p = s.packing;
  const inv = [
    "COMMERCIAL INVOICE",
    `Invoice No: ${i.invoiceNo}    Date: ${i.date}`,
    `Exporter: ${i.exporter}`,
    `IEC: ${i.iec}`,
    `Consignee: ${i.consignee}`,
    `Port of Loading: ${i.portOfLoading}   Port of Discharge: ${i.portOfDischarge}`,
    `Country of Origin: ${i.countryOfOrigin}   Final Destination: ${i.countryOfDestination}`,
    `Terms: ${i.incoterm}   Currency: ${i.currency}`,
    "",
    "Sr  Description                                   HS Code    Qty      Rate     Amount",
    ...i.lines.map((l) => `${l.line}   ${l.description.padEnd(45)} ${l.hsCode}  ${String(l.qty).padStart(5)} ${l.unit}  ${l.unitPrice.toFixed(2).padStart(6)}  ${l.amount.toFixed(2).padStart(9)}`),
    i.freight ? `Freight: ${i.freight.toFixed(2)}` : "",
    i.insurance ? `Insurance: ${i.insurance.toFixed(2)}` : "",
    `TOTAL ${i.incoterm} ${i.currency} ${i.total.toFixed(2)}`,
  ].filter((x) => x !== "").join("\n");
  const pk = [
    "PACKING LIST",
    `Ref Invoice No: ${p.invoiceNo}    Date: ${p.date}`,
    "",
    "Sr  Description                              HS Code    Qty        Pkgs  Net kg  Gross kg",
    ...p.lines.map((l) => `${l.line}   ${l.description.padEnd(40)} ${l.hsCode}  ${String(l.qty).padStart(5)} ${l.unit}  ${String(l.packages).padStart(5)} ${String(l.netKg).padStart(7)} ${String(l.grossKg).padStart(8)}`),
    `TOTAL  Packages: ${p.totalPackages}   Net: ${p.totalNetKg} kg   Gross: ${p.totalGrossKg} kg`,
  ].join("\n");
  return inv + "\n\n----------------------------------------\n\n" + pk;
}
