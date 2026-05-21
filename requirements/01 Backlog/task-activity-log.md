# Task Activity Log

## Ziel

Jede relevante Änderung an einer Aufgabe wird als Event protokolliert.
So lässt sich nachvollziehen, wer wann was mit einer Aufgabe gemacht hat.

---

## Datenmodell

```sql
CREATE TABLE task_events (
  id            SERIAL PRIMARY KEY,
  taskspace_id  INTEGER NOT NULL REFERENCES taskspaces(id),
  task_id       TEXT NOT NULL,          -- task.id (unveränderlich, auch nach Task-Löschung)
  user_id       INTEGER REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type    TEXT NOT NULL,
  payload       JSONB                   -- event-spezifische Details
);
```

`task_id` bleibt als Fremdschlüssel erhalten, auch wenn der Task gelöscht wurde —
so ist die Historie eines gelöschten Tasks noch nachvollziehbar.

---

## Event-Typen

| event_type               | payload                                      |
|--------------------------|----------------------------------------------|
| `task.created`           | `{ title }`                                  |
| `task.deleted`           | `{ title }`                                  |
| `task.title_changed`     | `{ from, to }`                               |
| `task.status_changed`    | `{ from, to }`                               |
| `task.estimate_changed`  | `{ fromMinutes, toMinutes }`                 |
| `task.due_date_changed`  | `{ from, to }`                               |
| `task.owner_added`       | `{ userId }`                                 |
| `task.owner_removed`     | `{ userId }`                                 |
| `task.booked`            | `{ date, durationMinutes, startTime? }`      |
| `task.booking_changed`   | `{ date, fromMinutes, toMinutes }`           |
| `task.booking_removed`   | `{ date, durationMinutes }`                  |
| `task.prio_added`        | –                                            |
| `task.prio_removed`      | –                                            |

---

## Event-Erzeugung (serverseitig)

Events werden **nicht** vom Frontend gesendet, sondern vom Server beim Speichern erzeugt.
Der Server vergleicht die eingehende Version mit der vorherigen (Diff) und leitet daraus
die Events ab. Das ist konsistent mit der ohnehin nötigen Merge-Logik.

Vorteil: das Frontend muss nichts wissen von Events, keine doppelte Logik.

---

## UI: Task-Aktivitätslog

In der Task-Detailansicht (z.B. Aufklappen oder Hover-Panel) gibt es einen
Aktivitäts-Bereich ähnlich wie bei Trello:

```
Aktivität
─────────────────────────────────────────
RW  hat Status geändert: Ready → Done
    heute, 14:32

AK  hat Schätzung geändert: 30min → 45min
    gestern, 09:15

RW  hat Aufgabe angelegt
    21.05.2026, 11:00
```

- Neueste Einträge oben
- Anzeige: Kürzel des Users, Beschreibung, Zeitstempel
- Zeitstempel: relativ ("heute", "gestern") für jüngere Einträge, absolut für ältere

---

## UI: Taskspace-Aktivitätsfeed (optional, später)

Eine globale Ansicht aller Events im Taskspace — nützlich um zu sehen,
was das Team zuletzt gemacht hat. Nicht im ersten Rollout.

---

## Offene Fragen

- Sollen Events für Prio-Umsortierungen protokolliert werden? (viel Rauschen, wenig Wert)
- Wie lange werden Events aufbewahrt? (z.B. max. 90 Tage, oder unbegrenzt)
