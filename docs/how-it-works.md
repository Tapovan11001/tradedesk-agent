# How it works

Exporters send two documents with every shipment: an invoice (what was sold, and for how much) and a packing list (what is inside the boxes). If they disagree, customs holds the shipment. TradeDesk compares them line by line. It checks that quantities match, that every amount and total adds up, that the HS codes (customs product categories) are the same on both, and that the weights make sense. Each problem is marked on the document itself, with the exact fix when it can be calculated. Paste real documents and Claude reads them and fills in the fields, then the same checks run on what it found.

_Created by Aarav Makhija._
