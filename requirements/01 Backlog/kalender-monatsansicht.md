# Kalender: Monatsansicht

## Ziel

Neben der bestehenden Tagesansicht (Detailplanung) gibt es eine **Monatsansicht**
für den schnellen Überblick: Wie ist der Monat insgesamt verplant?

---

## Umschalten

Ein Toggle im Kalender-Panel-Header wechselt zwischen Tag- und Monatsansicht.
Die gewählte Ansicht wird in den Settings gespeichert.

---

## Darstellung

Ein Raster aller Tage des Monats. Jeder Tag ist eine Kachel.

### Variante A — Kachel mit Balken

Kleine Kachel mit Datum, Wochentag und Auslastungsbalken:

```
┌──────┐  ┌──────┐  ┌──────┐
│ Mo   │  │ Di   │  │ Mi   │
│ 1    │  │ 2    │  │ 3    │
│ ████░│  │ ██░░░│  │ ░░░░░│
└──────┘  └──────┘  └──────┘
```

Vorteil: Datum + Auslastung klar getrennt, vertraut.

### Variante B — Kachel als Balken

Die gesamte Kachel ist eingefärbt entsprechend der Auslastung.
Nur ein schmaler Header bleibt weiß/neutral mit Datum und Wochentag.

```
┌──────┐  ┌──────┐  ┌──────┐
│Mo  1 │  │Di  2 │  │Mi  3 │
│██████│  │████░░│  │░░░░░░│
│██████│  │████░░│  │░░░░░░│
│██████│  │████░░│  │░░░░░░│
└──────┘  └──────┘  └──────┘
```

Vorteil: maximale visuelle Wirkung, Muster im Monat sofort erkennbar
(volle Woche, freier Freitag, etc.). Farbverlauf von leer (weiß/hellgrau)
bis voll (Akzentfarbe).

**Empfehlung: Variante B** — die Logik ist dieselbe wie beim Tagesbalken,
aber die flächige Einfärbung macht den Monatsüberblick auf einen Blick lesbar.

---

## Auslastungsberechnung pro Tag

Dieselbe Logik wie in der Tagesansicht:

```
Auslastung = (gebuchte Minuten + GCal-Event-Minuten) / Tageskapazität
```

- 0 % → weiß / hellgrau
- 100 % → volle Akzentfarbe
- > 100 % → Überbucht-Farbe (z.B. orange/rot)
- Kein Arbeitstag (Wochenende, falls ausgeblendet) → gedimmte Kachel

---

## Navigation

- Monatsweise vor/zurück blättern (Pfeile im Header)
- Klick auf einen Tag → wechselt in die Tagesansicht und springt zu diesem Tag

---

## Wochenenden

- Werden angezeigt, wenn in den Settings "Wochenenden anzeigen" aktiv
- Andernfalls nur Mo–Fr pro Woche, kompakteres Raster

---

## Offene Fragen

- Soll der aktuelle Tag hervorgehoben werden (z.B. Rahmen)?
