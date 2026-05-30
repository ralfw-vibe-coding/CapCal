# Refactoring – offene Aufräumpunkte

Notizen aus dem DAO-Umbau (Phasen 1–8 Frontend). Kein akuter Handlungsbedarf;
Sammlung dessen, was später sauberer gemacht werden sollte.

## Frontend – Portal-Grenzfälle

- **Prefetch nach Login**: Ein `useEffect` löst bei bekanntem User drei
  unabhängige Loads aus (UserSettings, Google, iCloud). Bewusst im Portal als
  Lifecycle-Trigger belassen. Falls strenger gewünscht: in einen
  `SessionReactor.prefetchAfterLogin()` ziehen, der die drei Ergebnisse
  zurückliefert.
- **Autosave**: `useEffect` mit Debounce-Timer ruft die einzelne
  `saveTaskspace`-RPU. Timing ist UI, Aktion ist eine RPU. Falls als
  „Integration" gewertet: eigener Persistenz-/Save-Reactor (schwierig, weil an
  React-Effekte/Lifecycle-Events gebunden).
- **Range-Change-Effekt**: lädt Google- und iCloud-Events bei Änderung des
  sichtbaren Kalenderbereichs (zwei unabhängige Trigger) — gleiche Bewertung
  wie Prefetch.

## Frontend – RPU-Granularität

- Aktuell ~30 teils sehr feine Command-RPUs. RPUs sollen den Domain State
  kapseln, müssen aber nicht beliebig fein sein. Kandidaten zum Zusammenfassen
  bzw. zur Komposition über Reactors prüfen (z. B. die diversen
  Task-Feld-Updates, Prio-Operationen).
- Leitlinie: eine RPU pro echter Domänen-Capability, Zusammensetzung in
  Reactors – nicht „eine RPU pro UI-Knopf".

## Frontend – Typen am falschen Ort

- `AuthUser`, `UserProfile`, `UserSettingsState`, `GoogleCalendar*`,
  `ICloud*` liegen in `frontend/body/domain/types.ts`, sind aber **nicht**
  Taskspace-Domäne, sondern Auth/External-Belange. Sollten zu den jeweiligen
  External Providern bzw. einem geteilten Nicht-Domänen-Typmodul wandern.

## Frontend – Portal-Datei / head

- `frontend/head/` ist noch leer; das Portal lebt in `src/main.tsx` (~4k
  Zeilen, viele Komponenten). Später: Portal nach `frontend/head/` verschieben
  und in Komponenten-Dateien aufteilen (Panels, Cards, Editoren …).
- `getTaskspace`-Query existiert nur noch für den Export (Dokument
  serialisieren) — akzeptabel, aber bewusst der einzige Whole-Read.

## Tests

- Test-Runner: `node:test` via `tsx` (kein zusaetzlicher Dependency),
  `npm test` (Glob `frontend/body/**` + `backend/body/**`, co-lozierte
  `*.test.ts`). Test-Dateien werden nicht gebundelt.
- 120 Tests ueber Frontend- und Backend-Body: pure Domaenenlogik, alle
  Query- und Command-RPUs (ueber den Store bzw. gemockte Stores), Reactors
  (Session, UserSettings, ExternalCalendar, RequestOtp, Google-, iCloud-
  Calendar mit Fakes — inkl. OAuth-State-Roundtrip), `head/session` und die
  External Provider per Mock (fetch-Fake fuer alle HTTP-Provider inkl.
  Google-API und iCloud-CalDAV mit gecrafteten XML/ICS-Antworten;
  Filesystem-Storage gegen ein Temp-Verzeichnis).
- Coverage-Gate: `npm run test:coverage` (Schwelle 80% lines/branches/funcs,
  Quelldateien; bricht ab wenn unterschritten). Aktuell ~96% lines /
  ~81% branches / ~96% funcs.
- **Nur noch der reine Neon/DB-Query-Layer** ist nicht unit-getestet
  (`storage/postgres`, `identityStore`, `calendarStore`,
  `externalCalendarCache`, `cacheRpus`); er wird vom Postgres-Smoke-Test
  abgedeckt. Unit-Tests dafuer braeuchten Modul-Mocking von `neon`.

## Backend Phase 9 – Stand & Handoff

Phase 9 vollstaendig erledigt und getestet:
- **9a**: Persistenz-Domäne `backend/body/domains/taskspace` (LoadState/SaveState-RPUs).
- **9b**: Identity-Domäne `backend/body/domains/identity` (IdentityStore + 6 RPUs),
  `external_providers/emailProvider`, `reactors/requestOtpReactor`,
  `head/session`, `backend/body/app.ts` als Composition Root.
- **9c**: Kalender — `GoogleCalendarApiProvider` + `ICloudCalDavProvider`
  (external), External-Calendar-Domäne (`CalendarStore` mit Settings-Persistenz +
  Token-Verschluesselung, Cache, Connection-/Cache-RPUs),
  `GoogleCalendarReactor` + `ICloudCalendarReactor`.
- **9d**: `server/index.ts` und alle Netlify-Functions rufen direkt
  `createBackendApp()` + `head/session`.
- **9e**: `src/server` vollstaendig aufgeloest — Storage, env und
  externalCalendarCache physisch nach `backend/body` gezogen; Shims entfernt.
  `src/` enthaelt nur noch das Frontend-Portal (`main.tsx`, `styles.css`).

Verbleibende Hygiene:
- `ensureAuthSchema` wird vom Event-Cache via `IdentityStore` aufgerufen
  (Cross-Domain wegen FK auf `users`) — bewusst so; ggf. spaeter entkoppeln.
- OAuth-Callback (Google) und echter Event-Fetch (Google/iCloud) sind verbatim
  portiert, aber nicht automatisiert getestet (brauchen echtes Google/Apple).

Test-Setup: `scripts/smoke.sh` (filesystem, kein Login) und
`scripts/smoke-auth.sh` (postgres + RESEND leer -> OTP im Log) via
`.claude/launch.json` (`capcal-smoke` / `capcal-smoke-auth`).

## Sonstiges

- `run.sh` enthält einen hartkodierten `BUNDLED_NODE`-Pfad (maschinenspezifisch).
- Smoke-Test deckt nur die Filesystem-Instanz (kein Login) ab; der
  eingeloggte Postgres-Pfad wird weiterhin manuell getestet.
