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

- Ursprüngliches Ziel war Testbarkeit. Domäne (RPUs, `normalizeState`,
  Kapazitäts-/View-Logik) und Reactors sind jetzt isoliert testbar
  (Provider/Store mockbar). Unit-Tests fehlen noch komplett – nachziehen.

## Sonstiges

- `run.sh` enthält einen hartkodierten `BUNDLED_NODE`-Pfad (maschinenspezifisch).
- Smoke-Test deckt nur die Filesystem-Instanz (kein Login) ab; der
  eingeloggte Postgres-Pfad wird weiterhin manuell getestet.
