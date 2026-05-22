# Task-Owner

## Ziel

Aufgaben können einem oder mehreren Mitgliedern des Taskspace zugewiesen werden.
Owner und Ersteller sind getrennte Konzepte.

---

## Begriffe

- **Creator**: wer den Task angelegt hat — wird automatisch gesetzt, nie geändert
- **Owner**: wer für den Task verantwortlich ist — optional, manuell gesetzt, kann mehrere sein

---

## Datenmodell

```ts
type Task = {
  // ... bestehende Felder ...
  createdBy?: string;    // user.id, wird beim Anlegen gesetzt
  ownerIds?: string[];   // user.ids, initial leer, manuell befüllt
};
```

Owner startet immer leer — auch in geteilten Taskspaces. Keine automatische Zuweisung.

---

## UI: Owner setzen

Im Task-Eintrag (Tree-Panel) gibt es ein Feld zum Zuweisen:
- Klick öffnet ein Dropdown mit den Mitgliedern des Taskspace
- Mehrfachauswahl möglich
- Anzeige: Kürzel-Chips, z.B. `[RW] [AK]`
- Eintrag entfernen durch erneuten Klick auf einen Chip

Im Einzelnutzer-Betrieb bleibt das Feld ausgeblendet oder deaktiviert — es gibt nur einen möglichen Owner, was keinen Mehrwert bringt.

```
[ ] Präsentation vorbereiten   [RW][AK]  30min  Ready
```

---

## UI: Filter nach Owner

Im Tree-Panel erweitert der bestehende Filter um eine Owner-Auswahl:
- Alle (Standard)
- Nur meine Tasks (Schnellfilter: `ownerIds` enthält den eigenen User)
- Auswahl eines oder mehrerer bestimmter Members

Ein Task erscheint im Filter, wenn er **mindestens einen** der ausgewählten Owner hat.
Der Filter kombiniert sich mit Status- und Textfilter (AND-Verknüpfung).

---

## Offene Fragen

- Soll der Creator in der UI sichtbar sein (z.B. als Tooltip)?
- Sollen Owner auch in Prio- und Kalender-Panel angezeigt werden?
