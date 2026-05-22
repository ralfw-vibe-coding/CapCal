# Buchungen ohne Aufgabe

## Grundsatz

Buchungen im Kalender können, müssen aber nicht mit einer Aufgabe verknüpft sein.
Tasks entstehen ausschließlich durch explizite Aktion im Tree-Panel.

---

## Motivation

Im Kalender werden nicht nur Aufgaben verplant, sondern auch andere Zeitblöcke:
- Meetings, Termine (kommen aus GCal)
- Puffer, Erholungszeiten
- Arbeit, die keiner konkreten Aufgabe zugeordnet ist

Es wäre falsch, dafür automatisch einen Task anzulegen.

---

## Datenmodell

```ts
type Booking = {
  id: string;
  date: string;
  startTime?: string;
  durationMinutes: number;
  taskId?: string;      // optional — kein Pflichtfeld
  label?: string;       // Freitext-Titel, wenn kein Task verknüpft
  description?: string; // freies Notizfeld, für alle Buchungen
};
```

Wenn `taskId` gesetzt: Titel des Blocks = Task-Titel (dynamisch, folgt Umbenennungen).
Wenn kein `taskId`: Titel = `label` (statischer Freitext, direkt auf dem Block editierbar).

`description` ist für alle Buchungen verfügbar — auch task-verknüpfte.
Beispiele: "Intro-Abschnitt geschrieben", "Review-Feedback eingearbeitet", "Meeting mit X".

---

## Buchungs-Bearbeitungsdialog

Der Dialog zum Bearbeiten einer Buchung wird ausgebaut:

```
┌─────────────────────────────────────────┐
│  Buchung bearbeiten                     │
│                                         │
│  Titel      [Freitext       ] ← nur bei unverknüpfter Buchung
│  Aufgabe    [── keine ──  ▼] ← Task aus Tree verknüpfen (optional)
│                                         │
│  Datum      [22.05.2026    ]            │
│  Uhrzeit    [09:00         ]            │
│  Dauer      [90 min        ]            │
│                                         │
│  Beschreibung                           │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Löschen]              [Speichern]     │
└─────────────────────────────────────────┘
```

- **Titel**: nur editierbar, wenn kein Task verknüpft. Bei Task-Verknüpfung wird der Task-Titel angezeigt (read-only).
- **Aufgabe**: Dropdown mit Tasks aus dem Tree. Auswahl verknüpft die Buchung; "keine" entfernt die Verknüpfung.
- **Beschreibung**: mehrzeiliges Freitext-Feld, optional, für alle Buchungen.

---

## Auswirkungen auf andere Bereiche

**Soll/Ist-Zeiten** (→ soll-ist-zeiten.md):
Ist-Zeit eines Tasks = Summe der Buchungen mit `taskId = task.id`.
Unverknüpfte Buchungen fließen nicht in Aufgaben-Zeiten ein.

**Kapazitätsauslastung**:
Alle Buchungen zählen zur Auslastung des Tages — egal ob mit oder ohne Task.

**Task-Aktivitätslog** (→ task-activity-log.md):
`task.booked` / `task.booking_changed` / `task.booking_removed` werden nur
bei verknüpften Buchungen geloggt.

**Tagesvorlagen** (→ tagesvorlagen.md):
Slots ohne `taskId` werden mit ihrem `label` gespeichert und beim Anwenden
direkt als unverknüpfte Buchung angelegt — kein Task nötig.

**Cal-Panel**:
Beim manuellen Anlegen eines Blocks im Kalender:
- Kein automatisches Task-Anlegen mehr
- User kann optional einen Task aus dem Tree verknüpfen
- Oder einfach ein Label eingeben und fertig

## Umsetzung

Umgesetzt am 2026-05-22:

- `Booking.taskId` ist optional.
- `Booking.label` und `Booking.description` wurden ergänzt.
- Direktes Anlegen im Kalender erzeugt nun eine unverknüpfte Buchung mit Label statt automatisch eine Aufgabe.
- Buchungskarten ohne Aufgabe werden grau und leicht gestreift dargestellt.
- Buchungskarten ohne Aufgabe zeigen ein Kalender-Icon statt eines Task-Status.
- Der Buchungsdialog bietet für freie Buchungen ein editierbares Label.
- Der Buchungsdialog bietet für alle Buchungen eine Aufgaben-Auswahl zum Verknüpfen/Entknüpfen.
- Der Buchungsdialog bietet eine Beschreibung als Textarea.
- Soll/Ist-Berechnung ignoriert unverknüpfte Buchungen; Tageskapazität zählt sie weiterhin.
