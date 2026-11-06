# Kassabuch

Privates Haushaltsbuch als Web-App (PWA) fürs iPhone: Einträge, mehrere Karten, Monatsbudgets, Statistik und KI-Belegprüfung.

## Datenschutz
- Dieses Repo enthält **nur den App-Code**. Keine Einträge, Beträge oder Schlüssel.
- Alle Daten liegen in IndexedDB **auf dem Gerät**. Kein Server, kein Konto, kein Tracking, keine externen Schriften oder Skripte.
- Der optionale Belegscan schickt nur das Belegfoto direkt vom Gerät an die Claude API (`api.anthropic.com`). Der API-Key wird nur auf dem Gerät gespeichert.

## Installation am iPhone
1. Seite in **Safari** öffnen.
2. Teilen → **Zum Home-Bildschirm**.
3. App vom Home-Bildschirm starten.

## KI-Belegscan (optional)
1. In der Claude Console (platform.claude.com) einen API-Key anlegen, Guthaben aufladen und ein monatliches **Ausgabenlimit** setzen.
2. In der App: Einstellungen → KI-Belegscan → Key einfügen.

## Backup
Daten existieren nur auf diesem Gerät. Regelmäßig in den Einstellungen **Backup sichern** und die Datei in „Dateien“ / iCloud Drive ablegen. „Backup laden“ führt ein Backup wieder zusammen.

## Release (für Updates)
Bei jeder Änderung gemeinsam erhöhen: `APP_VERSION` in `index.html`, `version.json` und `CACHE` in `sw.js`. Die App zeigt dann beim nächsten Öffnen „Neue Version – Jetzt neu laden“.

## Bank-PDFs
Transaktions-PDFs von Revolut, Trade Republic und Raiffeisen werden **lokal im Browser** gelesen (pdf.js, `vendor/`, Apache-2.0-Lizenz in `vendor/pdfjs-LICENSE.txt`). Es wird nichts hochgeladen. Gespeichert werden nur die letzten 4 Stellen von Karte und IBAN zur Zuordnung.
