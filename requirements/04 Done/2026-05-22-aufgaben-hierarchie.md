# Aufgaben-Hierarchie & Tree View - Stufe 1

## Ziel

Aufgaben koennen optional hierarchisch strukturiert werden. Die bestehende flache Nutzung bleibt moeglich.

Das Aufgaben-Panel bekommt drei Ansichten:

| Ansicht | Zweck |
|---------|-------|
| **Liste** | Flache Aufgabenliste wie bisher, mit Hinweisen auf Parent/Children |
| **Board** | Kanban nach Status wie bisher, mit Hinweisen auf Parent/Children |
| **Hierarchie** | Echte eingerueckte Baumdarstellung |

## Datenmodell

```ts
type Task = {
  // bestehende Felder
  parentId?: string;
  treeOrder: number;
};
```

- `parentId` fehlt bei Root-Aufgaben.
- `treeOrder` wird als Reihenfolge unter Geschwistern verstanden.
- Alte Daten ohne `parentId` bleiben Root-Aufgaben.

## Hierarchie View

Stufe 1 nutzt einen klassischen eingerueckten Baum:

```text
Projekt G
  Phase 1
    Recherche abschliessen
    Konzept schreiben
  Phase 2
```

Funktionen:

- Aufgabe als Root-Aufgabe anlegen.
- Aufgabe als Kind einer bestehenden Aufgabe anlegen.
- Teilbaeume ein- und ausklappen.
- Aufgaben per Drag & Drop unter einen anderen Parent verschieben.
- Aufgaben per Drag & Drop unter Geschwistern sortieren.
- Alle bestehenden Aufgabenoperationen bleiben verfuegbar.

## List View

Die flache Liste bleibt erhalten.

Hinweise auf Hierarchie:

- Aufgaben mit Parent zeigen einen kleinen Parent/Breadcrumb-Chip.
- Aufgaben mit Kindern zeigen einen kleinen Children-Chip mit Anzahl.
- Klick auf einen Hierarchie-Chip wechselt in die Hierarchie-Ansicht und scrollt zur Aufgabe.

## Board View

Das Board bleibt nach Status organisiert.

Hinweise auf Hierarchie:

- Aufgaben mit Parent zeigen einen kleinen Parent-Chip.
- Aufgaben mit Kindern zeigen einen kleinen Children-Chip mit Anzahl.
- Klick auf einen Hierarchie-Chip wechselt in die Hierarchie-Ansicht und scrollt zur Aufgabe.

## Prio und Cal

- Prio bleibt flach.
- Cal bleibt unveraendert.
- Aufgaben aller Hierarchie-Ebenen koennen priorisiert und gebucht werden.

## Loeschregel

In Stufe 1 wird das Loeschen einer Aufgabe blockiert, wenn sie Kinder hat.

Begruendung: Das vermeidet versehentliche Datenverluste. Optionen wie "Kinder hochstufen" oder "Teilbaum loeschen" kommen spaeter.

## Nicht in Stufe 1

- Aggregierte Schaetzungen oder Ist-Zeiten ueber Nachkommen.
- Status-Automatik fuer Eltern.
- Miller Columns.
- Alle aufklappen / alle zuklappen.
- Erweiterte Loeschoptionen.

## Umsetzung

Umgesetzt am 2026-05-22:

- Aufgabenmodell um `parentId` erweitert.
- Normalisierung fuer alte Daten ohne Hierarchie ergaenzt.
- Aufgaben-Panel um die Ansicht `Hierarchie` erweitert.
- Hierarchie-Ansicht als eingerueckter Baum mit lokalen Collapse-Controls umgesetzt.
- Unteraufgaben koennen in den Details einer Aufgabe angelegt werden.
- Drag & Drop in der Hierarchie kann Aufgaben vor Geschwister einsortieren oder als Unteraufgabe ablegen.
- Liste und Board zeigen Parent-/Children-Hinweise als Chips.
- Klick auf diese Chips wechselt zur Hierarchie-Ansicht und scrollt zur Aufgabe.
- Aufgaben mit Unteraufgaben koennen in Stufe 1 nicht geloescht werden; der Trash-Button ist deaktiviert.
- Stufe-2-Themen wurden in `requirements/01 Backlog/aufgaben-hierarchie-stufe-2.md` ausgelagert.
