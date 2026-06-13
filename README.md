# Körperdaten

Persönliches Körperdaten-Tracking mit rotierender 3D-Hologramm-Figur. Misst Fortschritt
Richtung Trainingsziele: Gewicht, Körperfett, Muskelmasse, Umfänge. Lücken werden im
Hintergrund per Formel gefüllt (US-Navy-Körperfett, Lee-Muskelmasse, BMI, Fett-/Magermasse).
Alle Daten bleiben lokal im Browser (localStorage), kein Server, kein Account.

## Benutzen (fertige App)

Doppelklick auf `dist/index.html`. Läuft komplett offline aus einer einzigen Datei,
inklusive 3D-Figur, Schriften und Styles. Diese Datei kannst du kopieren, mailen oder
auf einen USB-Stick legen.

## Entwicklung

```bash
npm install      # einmalig
npm run dev      # Dev-Server mit Hot-Reload -> http://localhost:5173
npm run build    # baut alles in dist/index.html (eine Datei)
npm run preview  # gebaute Datei lokal testen
```

## Aufbau

```
index.html              HTML-Gerüst (Dev-Entry)
src/
  main.js               Verdrahtung: Render-Loop, Event-Bus
  store.js              Zustand + localStorage + Event-Bus
  formulas.js           Navy-Körperfett, Lee-Muskelmasse, BMI
  metrics.js            Metrik-Definitionen, Serien, Trend-Logik
  util.js               Formatierung, Datum
  three/
    figure.js           Prozedurale Hologramm-Figur + Mess-Ringe
    bodyScene.js        3D-Viewer, Rotation, HUD-Labels, Picking
  ui/
    stats.js  zones.js  chart.js  table.js  form.js  settings.js  toast.js
  styles/main.css       Design-System (Tokens, Hologramm-Optik)
```

## Erst messen, dann rechnen

Damit die automatischen Werte (≈) erscheinen, in den **Einstellungen** Größe, Geschlecht
und Geburtsjahr hinterlegen. Körperfett nach US-Navy braucht zusätzlich Hals- und
Taillenumfang (bei Frauen auch Hüfte) in der jeweiligen Messung.

## Daten sichern

`↓ Export` schreibt eine JSON-Datei mit allen Einträgen und Einstellungen. `↑ Import`
führt sie wieder zusammen (per Datum). Die alte Einzeldatei-Version liegt als
`legacy-v1.html` daneben; ihr Datenformat ist kompatibel.
