# Custom Processes (Workflow-Schritte)

## Ziel

Aufgaben folgen normalerweise dem Standard-Status-Fluss (Backlog → Ready → Started → …).
Für komplexere Abläufe können eigene Prozesse mit frei definierten Schritten angelegt werden
und je Aufgabe zugewiesen werden.

---

## Konzept

Der Standard-Status ist ein impliziter Default-Prozess, der immer vorhanden ist.
Custom Processes sind benannte Alternativen mit eigenen Schritten.

Eine Aufgabe gehört immer zu genau einem Prozess:
- kein Prozess zugewiesen → Standard-Status (Backlog, Ready, Started, Blocked, Done, Aborted)
- Prozess zugewiesen → Schritte dieses Prozesses

Der aktuelle Schritt ist der "Status" der Aufgabe im Kontext ihres Prozesses.
Weiterschalten erfolgt immer manuell.

---

## Datenmodell

```ts
type ProcessStep = {
  id: string;
  label: string;
};

type Process = {
  id: string;
  name: string;
  steps: ProcessStep[];
};

// In AppState:
type AppState = {
  // ...
  processes: Process[];
};

// In Task:
type Task = {
  // ...
  processId?: string;      // undefined = Standard-Status
  currentStepId?: string;  // aktueller Schritt im zugewiesenen Prozess
};
```

Beispiel-Prozess "Artikel":
```json
{
  "id": "proc-artikel",
  "name": "Artikel",
  "steps": [
    { "id": "s1", "label": "Backlog" },
    { "id": "s2", "label": "Recherchieren" },
    { "id": "s3", "label": "Schreiben" },
    { "id": "s4", "label": "Review" },
    { "id": "s5", "label": "Veröffentlichen" },
    { "id": "s6", "label": "Done" }
  ]
}
```

---

## Prozesse definieren (Settings)

Im Settings-Panel gibt es einen Bereich "Prozesse":
- Liste aller definierten Prozesse
- Prozess anlegen: Name eingeben, Schritte hinzufügen/sortieren/löschen
- Prozess umbenennen, löschen (nur wenn kein Task diesen Prozess verwendet)
- Schritte per Drag & Drop umsortieren

---

## Prozess einer Aufgabe zuweisen

Im Task-Eintrag (Tree und Board):
- Dropdown "Prozess": Standard / \<Name der definierten Prozesse\>
- Bei Zuweisung eines Prozesses: `currentStepId` wird auf den ersten Schritt gesetzt
- Bei Entfernen des Prozesses: Task fällt auf Standard-Status zurück (Status = "Backlog")

---

## Schritt weiterschalten

Im Task-Eintrag gibt es neben dem aktuellen Schritt einen Weiter-Button (→):
- Setzt `currentStepId` auf den nächsten Schritt
- Letzter Schritt erreicht → kein Weiter-Button mehr (oder deaktiviert)
- Rückwärts-Button (←) optional: Schritt zurücksetzen

Alternativ: Schritt direkt aus einem Dropdown wählen (für Sprünge).

---

## Darstellung im Tree

Tasks mit Custom Process zeigen ihren aktuellen Schritt statt des Standard-Status:

```
[ ] Artikel: KI-Trends   [Schreiben]   45min
[ ] Artikel: Datenschutz [Recherchieren] 30min
[✓] Bugfix Login         [Done]         15min     ← Standard-Prozess
```

---

## Darstellung im Kanban Board

Im Board-Modus kann nach Prozess gefiltert werden:
- Filter "Standard" → Spalten = Standard-Status-Werte
- Filter "Artikel" → Spalten = Schritte des Prozesses "Artikel"
- Nur Tasks des gewählten Prozesses werden angezeigt

Tasks ohne passenden Prozess erscheinen nicht im gefilterten Board
(oder optional in einer Spalte "Anderer Prozess").

---

## Offene Fragen

- Sollen Prozesse taskspace-weit oder global (über Taskspaces hinweg) definiert werden?
- Gibt es eine maximale Anzahl Schritte pro Prozess?
- Soll ein Prozess auch "Blocked" / "Aborted" als Sonderzustände kennen,
  unabhängig vom aktuellen Schritt?
