# Undo/Redo fuer Taskspace-Aenderungen

## Ziel

CapCal soll lokale Undo/Redo-Funktionalitaet bekommen. User sollen echte
Aenderungen am Taskspace rueckgaengig machen und wiederherstellen koennen.

Undo/Redo bezieht sich dabei auf die JSON-Struktur des Taskspace, nicht auf
kurzlebige UI-Zustaende.

---

## Rahmen

- Undo/Redo gilt nur lokal in einem Browser-Fenster.
- Die Undo/Redo-History wird nicht auf dem Server persistiert.
- Die History ist bewusst kurz: ca. 10-15 User-Operationen.
- Nach Reload ist die Undo/Redo-History leer.
- Nach einer neuen Aenderung wird der Redo-Stack geleert.

---

## Granularitaet

Ein Undo-Schritt entsteht nur, wenn sich die Taskspace-JSON-Struktur wirklich
aendert.

Undo-relevant:

- Aufgabe anlegen, loeschen, archivieren
- Titel, Beschreibung, Status, Deadline, Aufwand aendern
- Tags aendern
- Checkliste aendern
- Aufgabe verschieben
- Parent/Child-Beziehung aendern oder loesen
- Buchung anlegen, loeschen, verschieben oder bearbeiten
- Tagesvorlage speichern, loeschen oder anwenden
- Taskspace importieren

Nicht undo-relevant:

- Hover, Fokus, offene Menues/Dialoge
- Drag-Preview
- Kalender scrollen oder lokale Perioden laden
- Panels auf-/zuklappen, soweit dies nur UI-Zustand ist
- einzelne Tastendruecke, solange kein Wert in die Taskspace-Struktur
  committet wurde

Textbearbeitung soll als semantische User-Operation behandelt werden, z.B.
Fokus bis Blur/Enter, nicht als Undo-Schritt pro Zeichen.

---

## Level 1: Snapshots

Die erste Implementierung speichert komplette Taskspace-Snapshots im lokalen
Memory des Browserfensters.

Prinzip:

```text
vor echter Aenderung:
  undoStack.push(currentTaskspace)
  undoStack = letzte 10-15 Eintraege
  redoStack = []

undo:
  redoStack.push(currentTaskspace)
  currentTaskspace = undoStack.pop()

redo:
  undoStack.push(currentTaskspace)
  currentTaskspace = redoStack.pop()
```

Vorteile:

- Einfach zu implementieren
- Passt zur heutigen Taskspace-JSON-Struktur
- Robust fuer alle bestehenden Operationen
- Kein Umbau der Persistenz notwendig

Nachteile:

- Mehr Speicherverbrauch als Patch-History
- Gruppierung von Text-, Drag- und Resize-Operationen muss bewusst gebaut
  werden

Fuer CapCal ist Level 1 der bevorzugte Einstieg.

---

## Level 2: Patch-History

Eine spaetere Ausbaustufe kann statt kompletter Snapshots technische
Strukturdifferenzen speichern.

Dabei geht es nicht um semantisches Domain Event Sourcing, sondern um ein
technisches Aenderungsjournal fuer den JSON-Baum.

Beispiel:

```text
set      /tasks/@123/title "einkaufen"
remove   /tasks/@123/dueDate
append   /tasks/@123/tags "project"
insert   /tasks/@123/tags[1] "test"
removeAt /tasks/@123/tags[2]
```

Gespeicherte Patches muessen genug Information fuer Undo und Redo enthalten,
also alte und neue Werte:

```json
{
  "op": "set",
  "path": "/tasks/@123/title",
  "oldValue": "einkaufen",
  "newValue": "Wocheneinkauf"
}
```

Fuer langlebige Entitaeten sollen stabile explizite IDs verwendet werden:

```json
{
  "tasks": {
    "@123": {
      "title": "einkaufen"
    }
  }
}
```

Arrays mit impliziten Indizes sind nur fuer einfache identitaetslose Werte
geeignet, z.B. Tags. Entitaeten mit eigener Identitaet wie Aufgaben,
Buchungen oder Checklisteneintraege sollten langfristig als Map plus
Order-Liste modelliert werden.

Vorteile:

- Weniger Speicherverbrauch
- Gute Grundlage fuer spaetere History-/Merge-Konzepte

Nachteile:

- Deutlich komplexere Implementierung
- Stabile Pfade und klare Regeln fuer Arrays notwendig
- Migration der heutigen Struktur waere wahrscheinlich sinnvoll

---

## UI

- Kleine Buttons fuer Undo/Redo im oberen Bedienbereich.
- Icons: `lucide/undo-2` und `lucide/redo-2`.
- Buttons sind disabled, wenn kein Undo/Redo moeglich ist.
- Tastatur:
  - `Cmd/Ctrl+Z` fuer Undo
  - `Cmd/Ctrl+Shift+Z` fuer Redo
  - optional `Cmd/Ctrl+Y` fuer Redo auf Windows

---

## Offene Fragen

- Welche Taskspace-Settings gelten als echte Taskspace-Aenderung und sollen
  undo-relevant sein?
- Sollen groessere Operationen wie Import immer nur ein einziger Undo-Schritt
  sein?
- Braucht es eine kleine Beschreibung des naechsten Undo-Schritts im Tooltip?
