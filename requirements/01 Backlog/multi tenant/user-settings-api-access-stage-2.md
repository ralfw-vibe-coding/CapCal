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
