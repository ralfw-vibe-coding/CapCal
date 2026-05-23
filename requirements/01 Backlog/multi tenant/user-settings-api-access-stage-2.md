# User Settings & API Access - Stufe 2

## Ziel

User Settings und API-Zugang werden fuer echte Multi-Tenant-/Multi-Taskspace-Nutzung erweitert.

Stufe 1 bleibt bewusst einfach: ein User hat genau einen Taskspace, und API-Zugriff bezieht sich auf diesen aktuellen Taskspace.

## Multi-Taskspace-API

Spaeter sollen API-Endpunkte nicht nur `current`, sondern konkrete Taskspaces adressieren:

```http
GET  /api/v1/taskspaces
GET  /api/v1/taskspaces/:id/export
POST /api/v1/taskspaces/:id/import
POST /api/v1/taskspaces
```

Regeln:

- API-Key authentifiziert den User.
- Der User darf nur auf Taskspaces zugreifen, fuer die er Rechte hat.
- Import in einen neuen Taskspace erzeugt Metadaten und initialen State.
- Export enthaelt Taskspace-Metadaten.

### API-Key

Der API-Key ist pro User, nicht pro Taskspace. Er authentifiziert den User und
gewaehrt Zugriff auf alle Taskspaces, fuer die der User berechtigt ist.

Verwendung im Request:

```http
Authorization: Bearer <api-key>
```

Der Klartext-Key wird nie gespeichert. Gespeichert werden Hash, optional ein
anzeigenaher Suffix und Metadaten wie `lastUsedAt`.

### Export

```http
GET /api/v1/taskspaces/:id/export
Authorization: Bearer <api-key>

200 OK -> {
  "version": 44,
  "exportedAt": "2026-05-22T14:32:00Z",
  "taskspace": {
    "id": "ts_...",
    "title": "Mein Taskspace"
  },
  "data": {
    "settings": {},
    "tasks": [],
    "prioTaskIds": [],
    "prioDurations": {},
    "bookings": [],
    "dailyCapacities": {}
  }
}
```

Der Export gibt immer den aktuellen Stand zurueck und fuehrt Taskspace-Metadaten
mit, damit ein Import in einen neuen Taskspace ohne manuelle Nacharbeit moeglich
ist.

### Import in bestehenden Taskspace

```http
POST /api/v1/taskspaces/:id/import
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "baseVersion": 44,
  "overwriteSettings": true,
  "data": {}
}

200 OK       -> { "version": 45, "warnings": [], "data": {} }
409 Conflict -> { "currentVersion": 46 }
400 Bad Request -> { "errors": [] }
```

`baseVersion` ist optional. Ohne `baseVersion` gilt last-write-wins. Mit
`baseVersion` schlaegt der Import fehl, wenn bereits eine neuere Version
gespeichert wurde.

`overwriteSettings` ist optional und default `true`.

- `true`: Settings aus dem Import werden uebernommen.
- `false`: Settings der aktuell gespeicherten Version bleiben erhalten; nur
  Tasks, Buchungen, Kapazitaeten und aehnliche Fachdaten werden ersetzt.

### Import als neuer Taskspace

```http
POST /api/v1/taskspaces
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "taskspace": {
    "title": "Kopie von Mein Taskspace"
  },
  "data": {}
}

201 Created -> { "taskspaceId": "ts_...", "version": 1 }
```

Nutzbar fuer Migration, Kopien und Forks eines Taskspace.

### Taskspaces eines Users listen

Ein User braucht spaeter einen Endpunkt, um alle fuer ihn sichtbaren Taskspaces zu listen:

```http
GET /api/v1/taskspaces
Authorization: Bearer <api-key>

200 OK -> {
  "taskspaces": [
    {
      "id": "ts_...",
      "title": "CapCal Privat",
      "role": "owner",
      "updatedAt": "2026-05-22T18:30:00Z"
    }
  ]
}
```

Dieser Endpunkt wird sowohl fuer API-Clients als auch spaeter fuer eine UI-Taskspace-Auswahl gebraucht.

## Taskspace-Metadaten

Taskspaces brauchen eigene Metadaten, mindestens:

- `id`
- `title`
- `createdAt`
- `updatedAt`
- Owner/Membership-Informationen

Der `title` ist der sichtbare Name eines Taskspaces und wird bei Export/Import mitgefuehrt.
In Stufe 1 gibt es implizit nur einen aktuellen Taskspace; in Stufe 2 wird daraus ein echtes Objekt.

## Rechte und Ownership

API-Zugriffe muessen dieselben Rechte beachten wie die UI:

- Owner
- Member
- spaeter Rollen wie read/write/admin

## Mehrere API-Keys

Stufe 1 sieht einen API-Key pro User vor.

Stufe 2 kann mehrere Keys unterstuetzen:

- Name/Label pro Key
- Erstellzeit
- letzter Einsatz
- gezieltes Loeschen einzelner Keys
- optional Scopes, z.B. `read`, `write`, `import`

## Versionierung und Optimistic Locking

Bei mehreren Clients und Taskspaces sollte Import/Sync robuster werden:

- verpflichtende oder empfohlene `baseVersion`
- `409 Conflict` bei veralteter Version
- spaeter Merge-Strategien fuer parallele Aenderungen

## Validierung

Die Importvalidierung wird ausgebaut:

- vollstaendige Schema-Validierung
- Konsistenzpruefung aller ID-Referenzen
- Warnungen fuer plausible, aber auffaellige Daten
- klare Fehlerliste mit Feldpfaden

### Schema-Regeln

- Pflichtfelder vorhanden: `tasks`, `bookings`, `prioTaskIds`, `prioDurations`,
  `dailyCapacities`
- Typen korrekt: string, number, boolean, array, object
- Enum-Werte gueltig, z.B. Task-Status nur aus den erlaubten Statuswerten

### Konsistenzregeln

ID-Referenzen duerfen nicht verwaisen:

| Feld | muss referenzieren |
|------|-------------------|
| `bookings[].taskId` | existierende `tasks[].id` |
| `prioTaskIds[]` | existierende `tasks[].id` |
| `prioDurations` keys | existierende `tasks[].id` |
| `tasks[].parentId` | existierende `tasks[].id` |
| spaeter `tasks[].processId` | existierenden Prozess |
| spaeter `tasks[].currentStepId` | existierenden Schritt im Prozess |

Eindeutigkeit:

- `tasks[].id` eindeutig
- `bookings[].id` eindeutig
- `prioTaskIds[]` ohne Duplikate
- spaeter `processes[].id` eindeutig

Datum und Uhrzeit:

- `bookings[].date`: gueltiges Datum `YYYY-MM-DD`
- `bookings[].startTime`: gueltige Uhrzeit `HH:MM`, falls vorhanden
- `tasks[].dueDate`: gueltiges Datum, falls vorhanden
- `dailyCapacities` keys: gueltige Daten
- `settings.calendarStartTime` und `settings.calendarEndTime`: gueltige Uhrzeiten
- `calendarStartTime < calendarEndTime`

Numerische Werte:

- `bookings[].durationMinutes > 0`
- `dailyCapacities[].dayCapacityMinutes > 0`
- `dailyCapacities[].planningCapacityMinutes > 0`
- `planningCapacityMinutes <= dayCapacityMinutes`
- `settings.visibleDayCount > 0`
- `tasks[].estimateMinutes` darf fehlen, wenn keine Schaetzung vorliegt; falls
  vorhanden, muss der Wert plausibel positiv sein.

### Warnungen

Nicht alle Auffaelligkeiten blockieren den Import. Warnungen werden gesammelt und
im Response zurueckgegeben:

- Zwei Buchungen desselben Tages ueberlappen sich.
- `estimateMinutes` ist ungewoehnlich hoch.
- Tasks mit Status `Started` haben keine Buchung.

Beispiel:

```json
{
  "version": 45,
  "warnings": [
    { "code": "booking_overlap", "bookingIds": ["b1", "b2"], "date": "2026-05-22" }
  ],
  "data": {}
}
```

### Fehlerantwort

Validierungsfehler werden moeglichst gesammelt zurueckgegeben:

```json
{
  "errors": [
    { "code": "ref_not_found", "field": "bookings[2].taskId", "value": "task-xyz" },
    { "code": "invalid_date", "field": "tasks[0].dueDate", "value": "2026-13-01" },
    { "code": "range_error", "field": "bookings[5].durationMinutes", "value": 0 }
  ]
}
```

## User Settings Erweiterungen

Profilfelder koennen spaeter fuer Kollaboration genutzt werden:

- Anzeigename
- Kuerzel
- Avatar/Farbe
- Zeitzone mit echter Auswirkung auf Kalender-/Sync-Anzeige

## Nicht in Stufe 2 zwingend

- Vollautomatischer Merge konkurrierender Taskspace-Aenderungen
- Feingranulare OAuth-/SAML-Enterprise-Auth
- Public API fuer einzelne Tasks/Buchungen statt Taskspace-Import/Export

## Offene Fragen

- Soll es einen separaten Endpunkt fuer Versionshistorie geben?
  `GET /api/v1/taskspaces/:id/state/history?limit=10`
- Soll eine bestimmte Version heruntergeladen werden koennen?
  `GET /api/v1/taskspaces/:id/state?version=42`
- Soll `/api/v1/taskspaces/:id/export` langfristig nur ein Alias fuer einen
  allgemeineren State-Endpunkt sein?
