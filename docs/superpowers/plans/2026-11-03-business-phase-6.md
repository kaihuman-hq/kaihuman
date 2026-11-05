# Business phase 6: e-invoices — plan

Spec: `docs/superpowers/specs/2026-10-26-business-design.md` §3 "Fields for e-invoices", §8, §10 phase 6.
Goal: pure serialisers `toEn16931` → XRechnung 3.0 UBL 2.1 (Invoice/CreditNote) and UN/CEFACT CII D16B
(XRechnung CIUS, or EN 16931 guideline for ZUGFeRD/Factur-X), KoSIT-checked in CI, console downloads.

## Tasks
1. `packages/formats/src/business/xml.ts` (tiny builder + escaping), `xrechnung.ts` (`toUbl`, `toCii`,
   `xrechnungGaps`, electronic-address scheme), golden fixtures `packages/formats/fixtures/business/einvoice/*.xml`
   (invoice S 19/7, reverse charge AE, small-business E, credit note 381) + structural tests.
2. CI job `einvoice` in `.github/workflows/ci.yml`: Java 21, KoSIT validator 1.6.3 (Maven Central) +
   XRechnung config 3.0.2 / 2026-08-31, sha256-pinned, `actions/cache`, validates every golden and fails
   unless all are acceptable.
3. Console: XML column (present / missing, same style as PDF) and "Download XRechnung (UBL)" / "Download CII"
   on issued invoice and credit note rows (ClientPage), generated client-side; gaps shown as a warning.
4. Docs: business.md (e-invoice section, ZUGFeRD PDF/A-3 embedding for external generators), features,
   progress, roadmap tick; README if fitting.

## Ledger (rulings)
- Ruling: KoSIT runs only in CI; running a downloaded jar in the sandbox was refused by policy — cost: fixture
  validity is proven by CI, not locally; goldens are checked by hand against the rules.
- Ruling: no XML dependency; ~40-line builder in-repo — cost: none beyond upkeep.
- Ruling: the serialiser never invents data. XRechnung-only requirements the record may lack (BT-10 buyer
  reference, seller phone BR-DE-6, electronic addresses BT-34/BT-49) are reported by `xrechnungGaps` and shown in
  the console; the file is still offered (CII with the EN 16931 guideline does not need them) — cost: a user can
  download an XRechnung that KoSIT rejects, but is told why.
- Ruling: electronic address scheme: explicit `SCHEME:value` (4-digit EAS code or `EM`) is used as written; an
  e-mail gets `EM`; a Leitweg-ID gets `0204`. Fallbacks: seller → contact e-mail (EM); buyer → Leitweg-ID (0204),
  then contact e-mail (EM) — cost: heuristic, documented.
- Ruling: credit notes without payment instructions get BT-81 = `1` (instrument not defined) to satisfy BR-DE-1,
  and BT-20 "refund" text when there is no due date (BR-CO-25) — cost: generic wording.
- Ruling: a seller without VAT id gets its tax number as BT-29 (UBL `PartyIdentification`, CII
  `SellerTradeParty/ID`) besides BT-32, because BR-CO-26 (fatal) accepts only BT-29/30/31; a seller with
  neither is a gap. Tax number is written for the seller only (EN 16931 has none for the buyer); category O
  gets `VATEX-EU-O` (BR-O-10); blank text writes no element — cost: the tax number appears twice.
- Ruling: CII guideline option `xrechnung` (default) | `en16931` (ZUGFeRD/Factur-X EN 16931 profile) — the body is
  the same, so one serialiser covers both.
- Ruling: `toEn16931` and computeTotals unchanged; serialisers only format its strings — rounding identical by
  construction.
- Ruling: no business-check/SKILL change, so BUSINESS_TOOLS_VERSION is not bumped.
- Ruling: no console page per document exists; downloads live in the client page's invoice table (the place that
  already shows "PDF missing").
