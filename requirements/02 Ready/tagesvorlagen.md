# Tagesvorlagen

## Ziel

Einen Tag mit seiner Buchungsstruktur als Vorlage speichern und auf einen
anderen Tag anwenden können. Nützlich für wiederkehrende Tagesstrukturen.

---

## Was enthält eine Vorlage?

Eine Vorlage speichert die **Zeitstruktur** eines Tages:
- Buchungsslots mit Dauer und optionaler Startzeit
- Verweis auf den zugehörigen Task (per `taskId`)
- Nicht: das Datum — das wird beim Anwenden neu gesetzt

```ts
type DayTemplateSlot = {
  taskId?: string;         // Verweis auf Task — kann veraltet sein (Task gelöscht/done)
  label: string;           // Anzeigename: bei Task-Verweis = Task-Titel, sonst frei
  durationMinutes: number;
  startTime?: string;
};

type DayTemplate = {
  id: string;
  name: string;            // z.B. "Normaler Montag", "Sprint-Tag"
  slots: DayTemplateSlot[];
};
```

---

## Vorlage speichern

Ein Tag kann mit einem Klick als Vorlage gespeichert werden (aus dem Kalender-Panel).
- Name der Vorlage eingeben
- Alle Buchungen des Tages werden als Slots übernommen
- Task-IDs und -Titel werden mitgespeichert

---

## Vorlage anwenden

Vorlage auf einen anderen Tag anwenden (aus dem Kalender-Panel):

Für jeden Slot der Vorlage:
- **Task existiert noch** → Buchung für diesen Task anlegen ✓
- **Task nicht mehr vorhanden** (gelöscht oder Done) → siehe unten

### Design-Entscheidung: Was passiert mit veralteten Slots?

Wenn ein Task aus einer Vorlage nicht mehr existiert oder bereits Done ist,
gibt es zwei Optionen:

**Option A — Slot überspringen + Warnung:**
- Nur gültige Slots werden gebucht
- User bekommt Hinweis: "2 Slots konnten nicht angewendet werden (Tasks nicht mehr vorhanden)"
- Vorteil: keine ungewollten neuen Tasks, User behält Kontrolle
- Nachteil: Vorlage wird mit der Zeit "lückenhafter"

**Option B — Neuen Task automatisch anlegen:**
- Für jeden veralteten Slot wird ein neuer Task mit dem gespeicherten Label angelegt (Status: Backlog)
- Booking wird direkt mit dem neuen Task verknüpft
- Vorteil: Vorlage funktioniert immer vollständig
- Nachteil: Tasks entstehen implizit, nicht bewusst im Tree angelegt

**Empfehlung: Option A** — Tasks sollen bewusst im Tree angelegt werden,
nicht als Nebeneffekt einer Vorlagen-Anwendung.
Wiederkehrende Aufgaben (z.B. "Weekly Review") sollten im Tree als dauerhafte
Tasks existieren und einfach immer wieder gebucht werden.

---

## Tasks nur im Tree anlegen

Tasks entstehen ausschließlich durch explizite Aktion im Tree-Panel.
Kein anderer Bereich (Cal, Prio, Vorlagen) legt automatisch Tasks an.

Das hält den Task-Bestand sauber und intentional.

---

## Vorlage löschen

In den Settings oder in einem Vorlagen-Manager:
- Liste aller Vorlagen
- Umbenennen, Löschen
- Löschen einer Vorlage löscht keine Buchungen

---

## Wo werden Vorlagen gespeichert?

Vorlagen sind Teil des Taskspace-State (in `data`):

```ts
type AppState = {
  // ...
  dayTemplates: DayTemplate[];
};
```

Sie werden mit dem Taskspace exportiert/importiert und versioniert gespeichert.

---

## Offene Fragen

- Soll eine Vorlage auch die Tageskapazität des Quelltages speichern?
  (Nützlich wenn z.B. ein "kurzer Freitag" zur Vorlage wird)
- Soll beim Anwenden gewarnt werden, wenn der Zieltag bereits Buchungen hat?
