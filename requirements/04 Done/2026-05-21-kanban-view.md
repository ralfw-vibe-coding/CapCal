# Kanban-Ansicht

## Ziel

Der Tree-Panel kann zwischen zwei Ansichten wechseln: **Tree** (wie bisher) und **Board** (Kanban).
Im Board-Modus werden Tasks nach Status in Spalten angezeigt.

---

## Umschalten

Ein Toggle-Button im Header des Tree-Panels wechselt zwischen Tree- und Board-Ansicht.
Die gewählte Ansicht wird in den Settings gespeichert (bleibt beim Reload erhalten).

---

## Layout im Board-Modus

Im Board-Modus wird das Tree-Panel breiter gestreckt — der Kalender wird ausgeblendet,
es sind nur noch Board + Prio nebeneinander sichtbar:

```
┌─────────────────────────────────────────┬──────────────┐
│  Board                                  │  Prio        │
│  [Backlog] [Ready] [Started] [Blocked]  │              │
│                                         │              │
└─────────────────────────────────────────┴──────────────┘
```

Der Kalender kann manuell wieder eingeblendet werden, das Board wird dann schmaler.

---

## Spalten

Spalten entsprechen den vorhandenen Status-Werten, in fixer Reihenfolge:

1. Backlog
2. Ready
3. Started
4. Blocked
5. Done
6. Aborted

Reihenfolge ist nicht veränderbar. Einzelne Spalten können ein-/ausgeblendet werden
(Einstellung pro Taskspace, wird in Settings gespeichert).

---

## Task-Karte

Jede Karte zeigt kompakt die wichtigsten Informationen:

```
┌─────────────────────────┐
│ Präsentation vorbereiten│
│ 45min  📅 23.05.  [RW]  │
└─────────────────────────┘
```

- Titel
- Schätzung
- Fälligkeitsdatum (falls gesetzt)
- Owner-Kürzel (falls gesetzt)

---

## Operationen

Alle Tree-Operationen sind auch im Board verfügbar:
- Task anlegen (+ Button in jeder Spalte, legt Task direkt mit dem Spalten-Status an)
- Task umbenennen (Klick auf Titel)
- Task löschen
- Schätzung ändern
- Fälligkeitsdatum ändern
- Owner setzen

Zusätzlich im Board:
- **Per Drag & Drop von Spalte zu Spalte verschieben** → ändert den Status des Tasks
- Alternativ: Status-Änderung über das bestehende Status-Menü direkt auf der Karte

---

## Spalten ein-/ausblenden

Im Board-Header gibt es einen Konfigurationsbereich (z.B. kleines Menü oder Chips):

```
Spalten: [✓ Backlog] [✓ Ready] [✓ Started] [✓ Blocked] [✗ Done] [✗ Aborted]
```

Einstellung wird in den Settings gespeichert (unter `boardHiddenStatuses: string[]`).

---

## Sortierung innerhalb einer Spalte

Tasks innerhalb einer Spalte sind nach `treeOrder` sortiert (wie im Tree).
Damit bleibt die relative Reihenfolge konsistent zwischen beiden Ansichten.
Umsortieren per Drag & Drop innerhalb einer Spalte ändert `treeOrder` entsprechend.

---

## Offene Fragen

- Soll der Textfilter aus dem Tree auch im Board wirken?
- Soll der Owner-Filter auch im Board verfügbar sein?

---

## Umsetzung

Erledigt am 2026-05-21:

- Aufgaben-Panel behält die Überschrift "Aufgaben"; intern bleibt es der Tree.
- Hinter der Überschrift kann zwischen den Ansichten "Liste" und "Board" per Chips umgeschaltet werden.
- Die aktuelle Ansicht wird als `taskView` im App-State gespeichert.
- Im Board werden Aufgaben nach Status in horizontal scrollbaren Spalten angezeigt.
- Board-Spalten können per Status-Chips ein- und ausgeblendet werden; gespeichert als `boardHiddenStatuses`.
- Suchtext und Statusfilter wirken in Liste und Board.
- Aufgaben können in Board-Spalten direkt angelegt werden und bekommen den jeweiligen Spaltenstatus.
- Aufgaben können im Detailpanel umbenannt werden.
- Drag & Drop zwischen Board-Spalten ändert den Status; Drag & Drop innerhalb einer Spalte verändert die Tree-Reihenfolge.
- Owner wurde bewusst ausgelassen, weil dieses Konzept noch nicht implementiert ist.
