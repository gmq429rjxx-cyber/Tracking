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
Daten existieren nur auf diesem Gerät. Regelmäßig in den Einstellungen **Backup sichern** und die Datei in „Dateien“ / iCloud Drive ablegen. Standardmäßig sind die Belegfotos enthalten (abschaltbar). „Backup laden“ stellt auf einem leeren Gerät alles wieder her und ergänzt sonst nur Fehlendes.

## Release (für Updates)
Bei jeder Änderung gemeinsam erhöhen: `APP_VERSION` in `js/core.js`, `version.json` und `CACHE` in `sw.js`. Die App zeigt dann beim nächsten Öffnen „Neue Version – Jetzt neu laden“.

## Bank-PDFs
Transaktions-PDFs von Revolut, Trade Republic und Raiffeisen werden **lokal im Browser** gelesen (pdf.js, `vendor/`, Apache-2.0-Lizenz in `vendor/pdfjs-LICENSE.txt`). Es wird nichts hochgeladen. Gespeichert werden nur die letzten 4 Stellen von Karte und IBAN zur Zuordnung.

## Aufbau
`index.html` (Gerüst) · `app.css` (Gestaltung) · `js/core.js` (Hilfen, Datenmodell, Speicher) · `js/motion.js` (Federn, Haptik, Sheet-Gesten) · `js/data.js` (Start, Daueraufträge) · `js/views.js` (Ansichten) · `js/sheets.js` (Dialoge) · `js/scan.js` (Beleg-Scan, Apple Pay) · `js/bankimport.js` + `bank.js` (Bank-PDFs) · `js/settings.js` (Einstellungen, Backup, Aufräumen) · `js/pdf.js` (Bericht als PDF, ohne Bibliothek) · `js/events.js` (Gesten, Steuerung). Klassische Skripte ohne Build-Schritt, Reihenfolge wie in `index.html`.

## Tests
`node tests/run.cjs` startet einen lokalen Server und prüft die App im Browser (Playwright/Chromium): Erfassen, Kontostand, Abgleich, Gesten, Sparziele, Artikelsuche, Beleg-Scan, Backup mit Fotos, Bank-Parser, Netzwerkgrenzen. Es werden nur fiktive Beispieldaten aus `tests/fixtures/` verwendet; Anfragen an die Claude-API werden abgefangen. Auf GitHub laufen die Tests bei jedem Push in Chromium und WebKit (`BROWSER=webkit`, Safari-Technik); veröffentlicht wird nur, wenn beide grün sind (`.github/workflows/test.yml`).
