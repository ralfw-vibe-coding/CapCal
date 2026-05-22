# CapCal

CapCal ist ein Proof of Concept fuer ein Zeitmanagement- und Kapazitaetsplanungstool.

Die App verbindet drei Planungsinstrumente:

- **Aufgaben**: der Tree fuer Aufgaben, Status, Schaetzungen, Deadlines, Tags, Archiv und Hierarchie.
- **Priorisierung**: eine Prio-Liste, in der Aufgaben aus dem Tree geplant werden, ohne dort zu verschwinden.
- **Kalender**: Tagesplanung mit Allokationen und Terminen, Tages- und Planungskapazitaet sowie Buchungen mit Bezug zu Aufgaben.

Aufgaben durchlaufen die Statusfolge `Backlog`, `Ready`, `Started`, `Blocked`, `Done`, `Aborted`. Sobald eine Aufgabe in den Kalender gebucht wurde, wird sie `Started`; beim Abhaken wird sie `Done`. Buchungen bleiben mit ihrer Ursprungsaufgabe verbunden. Freie Buchungen ohne Aufgabe sind ebenfalls moeglich und koennen spaeter einer Aufgabe zugeordnet werden.

## Tech Stack

- React, TypeScript, Vite
- CSS fuer das UI
- `lucide-react` fuer Icons
- lokaler Node-Server fuer Entwicklung
- Netlify Functions fuer Deployment
- Storage Provider:
  - `filesystem` fuer lokale JSON-Dateien
  - `postgres` fuer Neon/Postgres

## Lokale Entwicklung

Dependencies installieren:

```bash
npm install
```

Frontend und API-Server starten:

```bash
./run.sh
```

Alternativ einzeln:

```bash
./run.sh --server
./run.sh --client
```

Standard-URLs:

- Frontend: `http://127.0.0.1:5173`
- lokaler API-Server: `http://127.0.0.1:3001`

Build pruefen:

```bash
npm run build
```

## Environment

CapCal liest `.env` und `.env.local`. Auf Netlify werden dieselben Werte als Site Environment Variables gesetzt.

Beispiel:

```dotenv
STATE_PROVIDER=postgres
DATABASE_URL=postgres://...

# nur fuer STATE_PROVIDER=filesystem relevant
DATABASE_PATH="./data"

SNAPSHOT_INTERVAL_MINUTES=5

AUTH_SESSION_SECRET="lange-zufaellige-session-secret"
AUTH_FROM_EMAIL="CapCal <capcal@example.com>"
RESEND_API_KEY="re_..."

# optional: erzwingt Login auch unabhaengig vom Storage Provider
AUTH_REQUIRED=true

# nur fuer das lokale API-Smoke-Test-Skript
CAPCAL_API_KEY="capcal_..."
CAPCAL_BASE_URL="http://127.0.0.1:5173"
```

### Variablen

`STATE_PROVIDER`
: `filesystem` oder `postgres`. Bei `postgres` ist Login erforderlich.

`DATABASE_URL`
: Postgres-Verbindungsstring, z.B. von Neon. Erforderlich fuer `STATE_PROVIDER=postgres` und Auth.

`DATABASE_PATH`
: Verzeichnis fuer den filesystem Provider. CapCal schreibt dort `capcal.json` und Snapshots unter `state-history/`.

`SNAPSHOT_INTERVAL_MINUTES`
: Mindestabstand fuer History-Snapshots. Default: `5`.

`AUTH_SESSION_SECRET`
: Secret zum Signieren der Session-Cookies. In Deployment zwingend setzen.

`AUTH_FROM_EMAIL`
: Absenderadresse fuer OTP-Mails.

`RESEND_API_KEY`
: API-Key fuer Resend. Wenn lokal kein Key gesetzt ist, wird der OTP-Code ins Serverlog geschrieben.

`AUTH_REQUIRED`
: Optional. `true` erzwingt Auth auch dann, wenn nicht Postgres verwendet wird.

`CAPCAL_API_KEY`, `CAPCAL_BASE_URL`
: Nur fuer `npm run api:smoke`.

## Deployment

CapCal ist fuer Netlify vorbereitet.

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

Die API laeuft auf Netlify ueber Functions:

- `/api/state`
- `/api/auth/*`
- `/api/user-settings*`

Deployment-Schritte:

1. Repository mit Netlify verbinden.
2. Branch auswaehlen, normalerweise `main`.
3. Build command: `npm run build`.
4. Publish directory: `dist`.
5. Functions directory: `netlify/functions`.
6. Environment Variables setzen.
7. Deploy starten.

Fuer Web-Deployment mit Login sollte `STATE_PROVIDER=postgres` genutzt werden. Die Datenbanktabellen werden beim ersten Zugriff automatisch angelegt bzw. erweitert.

## Datenhaltung

Der Taskspace wird als ein JSON-Dokument gespeichert. Dazu kommt eine Versionshistorie:

- filesystem: `DATABASE_PATH/capcal.json` und `DATABASE_PATH/state-history/*.json`
- postgres: Tabellen `app_state` und `state_history`

Bei Postgres ist der State aktuell pro User gespeichert. Stufe 2 sieht mehrere Taskspaces pro User und optimistic locking vor.

## Auth

Login erfolgt per OTP an die E-Mail-Adresse.

Flow:

1. `POST /api/auth/request-otp`
2. User erhaelt bzw. lokal sieht den Code.
3. `POST /api/auth/verify`
4. Server setzt ein Session-Cookie.

API-Keys werden in den Benutzereinstellungen erzeugt. Der Klartext-Key wird nur direkt nach dem Erzeugen angezeigt. Gespeichert werden Hash und die letzten 5 Zeichen fuer die maskierte Anzeige.

## API

Alle Responses sind JSON.

### Auth

#### `POST /api/auth/request-otp`

Request:

```json
{
  "email": "user@example.com"
}
```

Response:

```json
{
  "ok": true
}
```

#### `POST /api/auth/verify`

Request:

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

Response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

Setzt ein Session-Cookie.

#### `GET /api/auth/me`

Auth: Session-Cookie.

Response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

#### `POST /api/auth/logout`

Auth: Session-Cookie.

Response:

```json
{
  "ok": true
}
```

Loescht das Session-Cookie.

### User Settings

Diese Endpoints nutzen Session-Cookies.

#### `GET /api/user-settings`

Response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "profile": {
    "name": "Ralf Westphal",
    "initials": "RW",
    "timezone": "UTC+02:00"
  },
  "apiKeyMasked": "••••••••••••••••abc12",
  "apiKeyLastUsedAt": "2026-05-22T18:00:00.000Z"
}
```

#### `PUT /api/user-settings`

Request:

```json
{
  "profile": {
    "name": "Ralf Westphal",
    "initials": "RW",
    "timezone": "UTC+02:00"
  }
}
```

Response: wie `GET /api/user-settings`.

#### `POST /api/user-settings/api-key`

Erzeugt einen neuen API-Key.

Response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com"
  },
  "profile": {
    "name": "Ralf Westphal",
    "initials": "RW",
    "timezone": "UTC+02:00"
  },
  "apiKeyMasked": "••••••••••••••••abc12",
  "apiKey": "capcal_...",
  "apiKeyLastUsedAt": null
}
```

`apiKey` wird nur in dieser Response im Klartext geliefert.

### Taskspace State

Diese Endpoints akzeptieren Session-Cookie oder API-Key.

API-Key Header:

```http
Authorization: Bearer capcal_...
```

#### `GET /api/state`

Response: kompletter Taskspace.

Minimalform:

```json
{
  "settings": {},
  "dailyCapacities": {},
  "tasks": [],
  "prioTaskIds": [],
  "prioDurations": {},
  "bookings": []
}
```

#### `PUT /api/state`

Request: kompletter Taskspace als JSON.

Response: gespeicherter Taskspace.

Der Endpoint ersetzt den aktuellen Taskspace. Clients sollten daher vorher laden, aendern und den vollstaendigen State wieder schreiben.

## API Smoke Test

Das Skript `scripts/capcal-api-smoke.mjs` testet den API-Key-Zugriff:

```bash
npm run api:smoke
```

Es liest `CAPCAL_API_KEY` und optional `CAPCAL_BASE_URL` aus `.env`, fragt nach einem Aufgabentitel, laedt den Taskspace, fuegt eine Aufgabe mit Tag `api-test` ein und speichert den Taskspace wieder.

Das Skript veraendert echte Daten.
