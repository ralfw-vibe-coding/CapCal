# Web-Hosting: Netlify + Neon (PostgreSQL)

## Ziel

CapCal soll im Web gehostet werden:
- **Frontend**: Netlify (statisches Hosting des Vite-Builds)
- **Backend**: Netlify Functions (serverless, ersetzt `server/index.js`)
- **Datenbank**: Neon (serverless PostgreSQL)

---

## Provider-Abstraktion

Der Datenzugriff wird hinter einem Interface gekapselt, das zwei Implementierungen hat:

```
src/server/storage/
  provider.ts         — Interface StateProvider
  filesystem.ts       — Implementierung: liest/schreibt data/capcal.json (lokal)
  postgres.ts         — Implementierung: liest/schreibt Neon PostgreSQL (remote)
  index.ts            — wählt Provider anhand ENV-Variable
```

### Interface

```ts
interface StateProvider {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
}
```

### Auswahl per `.env`

```
STATE_PROVIDER=filesystem   # lokal
STATE_PROVIDER=postgres     # Netlify + Neon
DATABASE_URL=postgres://... # Neon connection string
```

---

## Datenbankschema (Neon)

Versionierte Speicherung: jeder gespeicherte Stand bekommt eine eigene Zeile.

```sql
CREATE TABLE state_history (
  id        SERIAL PRIMARY KEY,
  saved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data      JSONB NOT NULL
);
```

- **Laden**: `SELECT data FROM state_history ORDER BY saved_at DESC LIMIT 1`
- **Speichern**: `INSERT INTO state_history (data) VALUES ($1)`

### Cooldown gegen Write-Flut

Das Frontend speichert bei jeder State-Änderung (debounced 250ms) — das sind potenziell viele Writes pro Minute.

Der Server verhindert zu viele Versionen durch einen serverseitigen Cooldown:
- Ein neuer Snapshot wird nur angelegt, wenn seit dem letzten mindestens **N Minuten** vergangen sind.
- N ist per ENV-Variable konfigurierbar: `SNAPSHOT_INTERVAL_MINUTES=5` (Default: 5)
- Zwischen den Snapshots wird der Stand trotzdem im Speicher des Functions-Containers gehalten (best-effort) oder verworfen — Netlify Functions sind stateless, daher ist der Cooldown DB-seitig zu prüfen:

```sql
-- Neuen Snapshot nur anlegen, wenn der letzte älter als N Minuten ist:
INSERT INTO state_history (data)
SELECT $1
WHERE NOT EXISTS (
  SELECT 1 FROM state_history
  WHERE saved_at > NOW() - INTERVAL '5 minutes'
);
```

So entsteht maximal 1 Version alle 5 Minuten, auch bei vielen Frontend-Writes.

---

## Netlify-Setup

### Verzeichnisstruktur

```
netlify/
  functions/
    state.ts    — GET + PUT /api/state (ersetzt server/index.js)
```

### `netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/state"
  status = 200
```

### Netlify Environment Variables

In den Netlify Project Settings:
- `STATE_PROVIDER=postgres`
- `DATABASE_URL=<Neon connection string>`
- `SNAPSHOT_INTERVAL_MINUTES=5`

---

## Lokale Entwicklung

`.env.local`:
```
STATE_PROVIDER=filesystem
```

`npm run dev` + `npm run server` laufen wie bisher. Keine Neon-Verbindung nötig.

---

## Offene Fragen / Entscheidungen

- Soll die Versionshistorie irgendwo in der UI sichtbar sein (z.B. "Wiederherstellen")? Oder rein als Sicherheitsnetz?
- Soll ein maximales Alter für alte Snapshots gelten (z.B. alles älter als 30 Tage löschen)?
- Authentifizierung: CapCal ist aktuell ohne Login — soll das so bleiben (URL = Zugriffsschutz) oder ist ein einfaches Passwort sinnvoll?
