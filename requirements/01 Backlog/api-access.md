# API-Zugang (API Key)

## Ziel

Ein vollständiger Taskspace kann per API-Key programmatisch exportiert und importiert werden —
unabhängig von der Browser-Session. Nützlich für Skripte, Backups, externe Integrationen,
Migration zwischen Instanzen.

---

## API-Key

- Pro Taskspace können ein oder mehrere API-Keys angelegt werden (in den Settings)
- Jeder Key hat eine Berechtigung: `readonly` oder `readwrite`
- Keys können benannt werden (z.B. "Backup-Skript", "Trello-Sync")
- Keys können jederzeit widerrufen werden
- Key wird nur einmal angezeigt (beim Anlegen) — nicht wiederherstellbar

Datenmodell:
```sql
CREATE TABLE api_keys (
  id           SERIAL PRIMARY KEY,
  taskspace_id INTEGER NOT NULL REFERENCES taskspaces(id),
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,   -- nur Hash gespeichert, nie der Klartext
  permission   TEXT NOT NULL,          -- 'readonly' | 'readwrite'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

Verwendung im Request:
```
Authorization: Bearer <api-key>
```

---

## Exportformat

Der Export enthält den vollständigen Taskspace-Inhalt:

```json
{
  "version": 44,
  "exportedAt": "2026-05-22T14:32:00Z",
  "taskspace": {
    "name": "Mein Taskspace"
  },
  "data": {
    "settings":         { ... },
    "tasks":            [ ... ],
    "prioTaskIds":      [ ... ],
    "prioDurations":    { ... },
    "bookings":         [ ... ],
    "dailyCapacities":  { ... },
    "processes":        [ ... ]
  }
}
```

`taskspace.name` und andere Metadaten werden mitexportiert, damit ein Import in einen
neuen Taskspace ohne manuelle Nacharbeit funktioniert.

---

## Endpunkte

### Export

```
GET /api/v1/taskspaces/:id/export
Authorization: Bearer <api-key>

200 OK → { "version": 44, "exportedAt": "...", "taskspace": { ... }, "data": { ... } }
```

Gibt immer den aktuellen Stand zurück (neueste Version).

---

### Import

```
POST /api/v1/taskspaces/:id/import
Authorization: Bearer <api-key>
Content-Type: application/json

Body: {
  "baseVersion": 44,        // optional — erzwingt Versionsprüfung
  "overwriteSettings": true, // optional, default: true
  "data": { ... }
}

200 OK          → { "version": 45, "data": { ... } }
409 Conflict    → { "currentVersion": 46 }   // nur wenn baseVersion angegeben und veraltet
400 Bad Request → { "errors": [ ... ] }      // Schema- oder Konsistenzfehler
```

Ohne `baseVersion`: Import überschreibt immer (last-write-wins).
Mit `baseVersion`: Import schlägt fehl, wenn remote bereits eine neuere Version existiert.

`overwriteSettings`:
- `true` (default): Settings aus dem Import-Body werden übernommen
- `false`: Settings der aktuell gespeicherten Version bleiben erhalten —
  nur Tasks, Buchungen, Kapazitäten, Prozesse etc. werden ersetzt.
  Nützlich für regelmäßige Daten-Syncs, bei denen jeder User seine
  eigenen Ansichtseinstellungen behalten soll.

### Import als neuer Taskspace

```
POST /api/v1/taskspaces
Authorization: Bearer <api-key>
Content-Type: application/json

Body: {
  "data": { ... }   // exportierter Taskspace-Inhalt
}

201 Created → { "taskspaceId": "...", "version": 1 }
```

Nützlich für Migration oder Kopie eines Taskspace.

---

## Schema-Validierung

Beim Import wird geprüft, ob die Struktur dem erwarteten AppState-Schema entspricht:
- Pflichtfelder vorhanden (`tasks`, `bookings`, `prioTaskIds`, etc.)
- Typen korrekt (string, number, boolean, array, object)
- Enum-Werte gültig (z.B. `status` nur aus erlaubten Werten)

---

## Konsistenzregeln

### ID-Referenzen (keine verwaisten Verweise)

| Feld | muss referenzieren |
|------|-------------------|
| `bookings[].taskId` | existierende `tasks[].id` |
| `prioTaskIds[]` | existierende `tasks[].id` |
| `prioDurations` (keys) | existierende `tasks[].id` |
| `tasks[].processId` | existierenden `processes[].id` |
| `tasks[].currentStepId` | existierenden Schritt in `tasks[].processId` |

### Eindeutigkeit

- `tasks[].id` eindeutig
- `bookings[].id` eindeutig
- `processes[].id` eindeutig
- `prioTaskIds[]` keine Duplikate

### Datum und Uhrzeit

- `bookings[].date` gültiges Datum (YYYY-MM-DD)
- `bookings[].startTime` gültige Uhrzeit (HH:MM), falls vorhanden
- `tasks[].dueDate` gültiges Datum, falls vorhanden
- `dailyCapacities` keys: gültige Daten
- `settings.calendarStartTime` / `calendarEndTime`: gültige Uhrzeiten (HH:MM)
- `calendarStartTime` < `calendarEndTime`

### Numerische Werte

- `tasks[].estimateMinutes` > 0
- `bookings[].durationMinutes` > 0
- `dailyCapacities[].dayCapacityMinutes` > 0
- `dailyCapacities[].planningCapacityMinutes` > 0
- `planningCapacityMinutes` ≤ `dayCapacityMinutes`
- `settings.visibleDayCount` > 0

### Prozess-Konsistenz

- Wenn `task.processId` gesetzt: Prozess muss in `processes[]` existieren
- Wenn `task.currentStepId` gesetzt: `processId` muss ebenfalls gesetzt sein
- `currentStepId` muss ein Schritt des referenzierten Prozesses sein

### Warnungen (kein Fehler, aber im Response vermerkt)

Nicht alle Probleme blockieren den Import — manche werden als Warnung zurückgegeben:

- Zwei Buchungen desselben Tages mit überlappenden Zeiten
- `estimateMinutes` ungewöhnlich hoch (z.B. > 8h — möglicherweise Fehleingabe)
- Tasks mit Status `Started` ohne Buchung

```json
{
  "version": 45,
  "warnings": [
    { "code": "booking_overlap", "bookingIds": ["b1", "b2"], "date": "2026-05-22" }
  ],
  "data": { ... }
}
```

---

## Fehlerantwort

Bei Validierungsfehlern werden alle Fehler auf einmal zurückgegeben:

```json
{
  "errors": [
    { "code": "ref_not_found", "field": "bookings[2].taskId", "value": "task-xyz" },
    { "code": "invalid_date",  "field": "tasks[0].dueDate",   "value": "2026-13-01" },
    { "code": "range_error",   "field": "bookings[5].durationMinutes", "value": 0 }
  ]
}
```

---

## Offene Fragen

- Soll es einen separaten Endpunkt für Versionshistorie geben?
  (`GET /api/v1/taskspaces/:id/state/history?limit=10`)
- Soll ein Download einer bestimmten Version möglich sein?
  (`GET /api/v1/taskspaces/:id/state?version=42`)
- Soll die API versioniert werden (`/v1/`)? Empfehlung: ja, von Anfang an.
