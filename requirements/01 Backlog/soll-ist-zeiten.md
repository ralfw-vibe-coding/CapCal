# Soll/Ist-Zeiten

## Konzept

Eine Aufgabe hat zwei Zeitdimensionen:

- **Soll-Zeit** (`estimateMinutes`): die geschätzte Gesamtdauer — wie lange wird die Aufgabe brauchen?
- **Ist-Zeit**: die tatsächlich gebuchte Zeit — Summe aller Buchungen für diese Aufgabe

Beide Werte können stark voneinander abweichen. Das ist normal und informativ.

```
Aufgabe: Präsentation vorbereiten
  Soll:  4h 00min
  Ist:   2h 30min  (3 Buchungen: 1h + 1h + 30min)
```

---

## Ist-Zeit: berechnet, nicht gespeichert

Die Ist-Zeit wird **nicht** als eigenes Feld auf dem Task gespeichert.
Sie wird immer aus den Buchungen berechnet:

```ts
const istMinutes = bookings
  .filter(b => b.taskId === task.id)
  .reduce((sum, b) => sum + b.durationMinutes, 0);
```

Das ist immer konsistent — keine Redundanz, kein Sync-Problem.

---

## Darstellung

### Task-Karte (Tree, Board, Prio)

Wenn mindestens eine Buchung existiert, werden Soll und Ist nebeneinander angezeigt:

```
[ ] Präsentation vorbereiten    4h Soll · 2h30 Ist
```

Ohne Buchungen: nur Soll-Zeit, wie bisher.

Farb-Codierung der Ist-Zeit:
- Ist < Soll → neutral (Arbeit läuft noch)
- Ist ≥ Soll, Task nicht Done → gelb/orange (Schätzung überschritten, noch offen)
- Ist ≥ Soll, Task Done → grün (erledigt, egal ob über oder unter Schätzung)

### Kalender-Panel

Buchungsblöcke können weiterhin wie bisher angezeigt werden.
Zusätzlich ist es hilfreich, im Tooltip oder Label die kumulierte Ist-Zeit zu sehen:
"Präsentation — 2h30 von 4h00 gebucht"

---

## Schätzung nachbessern

Wenn die Ist-Zeit die Soll-Zeit überschreitet und die Aufgabe noch nicht Done ist,
wird sichtbar, dass die ursprüngliche Schätzung zu knapp war.

Der User kann die Soll-Zeit jederzeit manuell anpassen (wie bisher).
Es gibt keinen Automatismus, der die Schätzung verändert.

---

## Verhältnis zu "Done"

Das Abhaken einer Aufgabe (Done) bleibt manuell und unabhängig von Soll/Ist.
Mögliche Situationen, alle valide:

| Situation                        | Bedeutung                                      |
|----------------------------------|------------------------------------------------|
| Ist < Soll, Done                 | Schneller fertig als gedacht                   |
| Ist = Soll, Done                 | Schätzung war genau                            |
| Ist > Soll, Done                 | Hat länger gedauert als geschätzt              |
| Ist > Soll, nicht Done           | Schätzung war zu knapp, Arbeit läuft noch      |
| Keine Buchungen, Done            | Aufgabe erledigt ohne Kalender-Buchung         |

---

## Offene Fragen

- Soll die Ist-Zeit auch in der Kapazitätsauslastung pro Tag berücksichtigt werden?
  (Buchungen tun das bereits — die Ist-Zeit ist ja ihre Summe, also ja)
- Soll es eine Auswertungsansicht geben: Soll vs. Ist über alle Aufgaben?
  (Nützlich zum Kalibrieren der eigenen Schätzfähigkeit — aber eigenes Feature)
