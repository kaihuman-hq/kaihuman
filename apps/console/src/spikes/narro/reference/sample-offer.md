---
template: ../templates/offer.mjs
extends: ../company.yaml
date: 2026-11-12
acceptance: true
client:
  name: Muster AG
  contact: Herr Max Muster
  address: [Hauptstraße 1, 70173 Stuttgart]
subject: Angebot – Produkt X, Komplettpaket mit Quellcode und Rahmenvertrag
items:
  - description: Core
    details: "Pflicht, Basis aller Module. Prüft XRechnung, ZUGFeRD/Factur-X und Peppol BIS."
    qty: 1
    unit: Lizenz
    price: 95000
    vat: 19
  - description: Core Rule-Updater
    details: "Benötigt: Core. Spielt neue amtliche Regelstände ein, geprüft gegen den KoSIT-Validator."
    qty: 1
    unit: Lizenz
    price: 20000
    vat: 19
  - description: Assessor
    details: "Benötigt: Core. Umsatzsteuer-Ermittlung und Stammdatenprüfung."
    qty: 1
    unit: Lizenz
    price: 20000
    vat: 19
  - description: Transcript
    details: "Benötigt: Core. Aus PDF-Rechnungen und Scans werden E-Rechnungen. Anonymizer enthalten."
    qty: 1
    unit: Lizenz
    price: 50000
    vat: 19
  - description: Anonymizer
    details: "Benötigt: Core. Entfernt personenbezogene Daten; inklusive bei Transcript und Wizard."
    qty: 1
    unit: Lizenz
    price: 0
    vat: 19
  - description: Studio
    details: "Benötigt: Core. Wie Produkt, aber mit mehr Funktionalität: erstellen, prüfen, korrigieren."
    qty: 1
    unit: Lizenz
    price: 45000
    vat: 19
  - description: Test Pack
    details: "Benötigt: Core. 1.665 geprüfte Musterrechnungen, Vergleich mit 18 anderen Prüf-Engines."
    qty: 1
    unit: Lizenz
    price: 35000
    vat: 19
  - description: Test Pack Wizard
    details: "Benötigt: Test Pack (und damit Core). Testsätze aus Ihren Rechnungen; Anonymizer enthalten."
    qty: 1
    unit: Lizenz
    price: 10000
    vat: 19
  - description: Counsel
    details: "Benötigt: Core. Kommandozeile für Stapelverarbeitung und MCP-Server für KI-Assistenten."
    qty: 1
    unit: Lizenz
    price: 30000
    vat: 19
  - description: Lead Magnet
    details: "Benötigt: Core. Öffentliche E-Rechnungs-Prüfung mit Erklärseiten zu jeder Regel."
    qty: 1
    unit: Lizenz
    price: 20000
    vat: 19
  - description: Produkt
    details: "Benötigt: Core. Die Prüf- und Erzeugungs-App, die Sie bereits nutzen. Ohne Berechnung."
    qty: 1
    unit: Lizenz
    price: 0
    vat: 19
  - description: Produkt X (Anwendung)
    details: "Die Oberfläche, in der die Module zusammenlaufen (siehe Abschnitt 3). Ohne Berechnung."
    qty: 1
    unit: Lizenz
    price: 0
    vat: 19
  - description: Vorteil Komplettpaket
    qty: 1
    unit: Pauschale
    price: -75000
    vat: 19
  - description: Nachlass für die enge Zusammenarbeit (Rahmenvertrag, Abschnitt 8)
    qty: 1
    unit: Pauschale
    price: -200000
    vat: 19
---

Sehr geehrter Herr Muster, (short letter …)

---

## Teil 1: Überblick

Alle Preise sind netto, zzgl. gesetzlicher USt.

### Jetzt: das Komplettpaket (einmalig)

| Modul | Was es tut | Einzelpreis |
|---|---|---:|
| **Core** | Prüft XRechnung, ZUGFeRD/Factur-X, Peppol (Pflicht) | 95.000 € |
| Core Rule-Updater | Spielt neue amtliche Regelstände ein | 20.000 € |
…

---

## Teil 2: Das Angebot im Detail

![Diagramm](../assets/diagram.svg)

## 4. Preis

<!-- items -->

## 5. Lieferumfang
…
