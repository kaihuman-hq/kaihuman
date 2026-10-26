# Verfahrensdokumentation

Stand: […]  ·  Verantwortlich: […]  ·  Unternehmen: […]

Diese Vorlage beschreibt, wie Angebote, Rechnungen und Zahlungen mit kaihuman erfasst, geschützt und aufbewahrt werden. Ersetze jeden Platzhalter […] und streiche, was nicht zutrifft.

## 1. Allgemeine Beschreibung

- Unternehmen und Tätigkeit: […]
- Zweck des Verfahrens: Erstellen, Nummerieren, Archivieren und Nachverfolgen von Angeboten, Rechnungen, Stornorechnungen / Rechnungskorrekturen, Zahlungen und Ausgaben.
- Eingesetzte Software: kaihuman (Konsole und Prüf-Workflow), Git, GitHub, Generator für PDF […] (und E-Rechnung-XML […]).
- Zeitraum, für den diese Fassung gilt: […]

## 2. Anwenderdokumentation

Belegfluss: Entwurf → Ausstellung → PDF/XML → Versand → Zahlung.

1. **Entwurf:** Ein Entwurf liegt unter `.kh/business/drafts/` ohne Nummer und kann geändert werden. Er entsteht in der Konsole, aus erfassten Stunden oder durch einen Agenten. Ersteller: […]
2. **Ausstellung:** Nur die kaihuman Konsole stellt aus. Sie prüft den Entwurf, vergibt die nächste Nummer der Reihe, übernimmt Aussteller- und Empfängerdaten und berechnet die Summen. Alles geschieht in einem Commit.
3. **PDF/XML:** Aus der ausgestellten Datei erzeugt […] das PDF (und die XML-Datei). Die SHA-256-Prüfsumme liegt als `<Nummer>.sha256` daneben.
4. **Versand:** Versandweg: […] (E-Mail, Freigabelink). Der Versand wird in `events.jsonl` festgehalten.
5. **Zahlung:** Zahlungseingänge werden in `payments/<Jahr>.jsonl` erfasst. Offen, teilbezahlt, bezahlt und überfällig werden daraus berechnet, nie gespeichert. Abgleich mit dem Bankkonto: […] (Rhythmus).

Nummernkreise: Rechnungen und Stornorechnungen / Rechnungskorrekturen `RE-{jjjj}-{nnnn}`, Angebote `AN-{jjjj}-{nnn}` (Änderung in `business.yaml`: […]).

## 3. Technische Systemdokumentation

- **Git-Repository:** Alle Daten liegen als Textdateien in `.kh/business/` im privaten Repository […]. Git speichert jede Version mit Autor und Zeitpunkt.
- **GitHub:** Das Repository ist privat. Zugriff haben: […]. Konto-Absicherung (2FA): […]
- **Branch-Schutz:** Der Hauptzweig `[…]` ist gegen Force-Push und Löschen geschützt. Die Historie wird nie umgeschrieben, auch nicht, um private Dateien zu entfernen.
- **kaihuman Konsole:** Version […]. Sie ist das einzige Werkzeug zum Ausstellen von Belegen.
- **Prüf-Workflow:** `.github/workflows/business-check.yml` führt `.kh/business/.tools/business-check.mjs` bei jeder Änderung unter `.kh/business/` aus. Er prüft Dateiformate, Summen, lückenlose Nummern und Verweise, und er meldet jede Änderung oder Löschung ausgestellter Dateien gegenüber dem Stand vor dem Push.
- **Generator:** […] erzeugt PDF […] und XML […] aus den ausgestellten Dateien. Version: […]
- **Datenformate:** YAML (Datensätze), JSONL (Zeit, Zahlungen, Ereignisse), Markdown (Text). Beträge sind ganze Cent-Beträge, Mengen und Sätze Dezimalzeichenketten.

## 4. Betriebsdokumentation

- **Datensicherung:** Das GitHub-Repository ist die Hauptkopie. Weitere Kopie: […] (Ort, Rhythmus, Wiederherstellungstest am […]).
- **Zugriff:** Lesen und Schreiben: […]. Steuerberater erhält einen Jahresexport (Archiv von `.kh/business/` mit CSV-Übersichten und Prüfsummenliste), keinen Zugriff auf das Repository.
- **Aufbewahrung:** 8 Jahre. Jedes ausgestellte Dokument trägt `retain_until` (31. Dezember des Ausstellungsjahres plus 8 Jahre). Vorher wird nichts gelöscht, das Repository wird nicht gelöscht.
- **Jahresexport:** Zum Jahresabschluss […] erstellt und an […] übergeben.
- **Änderungen am Verfahren:** Diese Datei wird bei jeder Änderung angepasst. Die Git-Historie belegt frühere Fassungen.

## 5. Internes Kontrollsystem

- **Unveränderliche Rechnungen:** Ausgestellte Dateien unter `offers/` und `invoices/` werden nie geändert oder gelöscht. Der Prüf-Workflow schlägt bei jeder Änderung fehl. Erlaubt ist nur das Hinzufügen von `<Nummer>.pdf`, `<Nummer>.xml` und `<Nummer>.sha256`.
- **Stornorechnung statt Änderung:** Fehler werden mit einer Stornorechnung / Rechnungskorrektur (Typ 381, eigene Nummer aus der Rechnungsreihe, Verweis auf das Original) korrigiert, danach folgt bei Bedarf eine neue Rechnung.
- **Lückenlose Nummern:** Die Nummer ist die höchste vorhandene Nummer des Jahres plus eins. Der Prüf-Workflow meldet Lücken.
- **SHA-256:** Zu jedem erzeugten PDF liegt die Prüfsumme in `<Nummer>.sha256`. Abweichungen sind an der Prüfsumme erkennbar.
- **Kontrolle:** Der Prüf-Workflow wird […] (Rhythmus) auf Fehler kontrolliert. Verantwortlich: […]

---

Diese Dokumentation und die Einrichtung sollten vom Steuerberater geprüft werden. kaihuman ist kein zertifiziertes GoBD-System.
