# TradeDesk: catching export paperwork mistakes before customs does

## The problem

Every export shipment from India needs at least two documents that agree with each other: a commercial invoice and a packing list. They're usually made by different people from different spreadsheets, and small mismatches are common. A quantity off by 20, a line total typed wrong, a different HS code on one document. Customs or the CHA catches it, the shipping bill is held, documents are re-issued, and the shipment can miss its vessel.

## What I built

A web app and agent that reads both documents and returns a verdict (HOLD or CLEAR), a list of problems in order of importance, the exact fix where one can be computed, and a ready-to-send email to the CHA.

## Key decisions

**Rules in code, reading in the model.** The obvious approach is to give both documents to a model and ask what's wrong. I didn't, because a model can miss an arithmetic slip or invent one, and nobody can test that properly. Instead the checks are ordinary code with unit tests, and the model's only job is to turn messy PDF text into structured fields. That splits the problem into one part that's fully testable and one that's measurable with an eval.

**Copy, don't correct.** The prompt tells the model to copy values exactly as printed, wrong totals included. An early worry was that a helpful model would silently "fix" the mistakes while extracting, which would hide exactly what the tool exists to find.

**Fix what can be computed, flag what can't.** A wrong line amount has one right answer, so the app can fix it. A quantity mismatch doesn't: someone has to check what was actually packed. The app separates the two.

## Result

- 12 checks covering arithmetic, cross-document consistency, weights, HS codes, IEC and Incoterms.
- Catches all six planted mistakes in the sample shipment, and passes the clean one with no false alarms.
- 9 unit tests plus an end-to-end eval that checks the agent's extraction gives the checker the same answer as clean data.

## Next

- PDF upload with text extraction.
- More document types: certificate of origin and the shipping bill itself.
- A bigger HS table, checked against the current ITC-HS schedule.
