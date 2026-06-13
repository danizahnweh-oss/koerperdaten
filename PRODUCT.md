# Product

## Register

product

## Users

Daniel, der seine eigenen Körperdaten trackt: Gewicht, Körperfett, Muskelmasse und Umfänge. Nutzung typischerweise morgens nach dem Messen (Handy oder Laptop), kurze Sessions: Wert eintragen, Trend checken, weitermachen. Einzelnutzer, keine Accounts, Daten bleiben lokal im Browser.

## Product Purpose

Persönliches Körperdaten-Tracking als einzelne HTML-Datei. Misst Fortschritt Richtung Trainingsziele: Muskelaufbau sichtbar machen, Fettabbau belegen. Erfolg heißt: Der Trend ist auf einen Blick erkennbar und das Eintragen kostet unter 30 Sekunden. Formeln (US-Navy-Körperfett, Lee-Muskelmasse, BMI, Fett-/Magermasse) füllen Lücken automatisch, damit auch ohne Körperfettwaage ein vollständiges Bild entsteht.

## Brand Personality

Sportlich, energisch, fordernd, futuristisch. Die App ist ein Trainingspartner, kein Arztbericht: große, selbstbewusste Zahlen, kräftiger Akzent, Fortschritt wird gefeiert statt nur protokolliert. Ton direkt und knapp, deutsch, ohne Floskeln. Optik seit v2: Hologramm-Ästhetik (Cyan auf Tiefblau, Space Grotesk + JetBrains Mono), rotierende 3D-Figur als Zentrum.

## Anti-references

- Nicht steril wie Excel: keine reinen Zahlenkolonnen ohne visuelle Verankerung. Daten brauchen Form (Chart, Körper-Visualisierung, Trend-Pfeile).
- Keine generische Health-App-Optik: kein austauschbares Karten-Raster ohne Hierarchie.

## Design Principles

1. **Der Körper ist das Interface.** Messwerte gehören an die Körperstelle, zu der sie gehören, nicht nur in Tabellen.
2. **Trend vor Momentaufnahme.** Jede Zahl zeigt ihre Richtung; ob das gut oder schlecht ist, hängt von der Metrik ab (Muskel rauf = gut, Taille rauf = schlecht).
3. **Eintragen in unter 30 Sekunden.** Ein Formular, keine Pflichtfelder außer Datum, heute ist vorausgefüllt.
4. **Berechnet ist ehrlich markiert.** Formelwerte (≈) sind von Messwerten unterscheidbar, damit kein falsches Vertrauen entsteht.
5. **Offline und portabel.** Quellcode ist ein Vite-Projekt (src/), aber `npm run build` bündelt alles in eine einzige dist/index.html, die per Doppelklick offline läuft; localStorage, Export/Import als Backup.

## Accessibility & Inclusion

Standard: Kontrast ≥ 4.5:1 für Fließtext, vollständige Tastatur-Bedienung, `prefers-reduced-motion` respektieren. Keine erhöhten Anforderungen.
