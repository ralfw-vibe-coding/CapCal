# Authentifizierung & Taskspaces - Stufe 2

## Ziel

Auf Stufe 1 aufbauen und echte Mehrgeraete- und spaetere Kollaborationsfaehigkeit
vorbereiten.

---

## Optimistic Locking

Der App-State bekommt eine Version.

```sql
ALTER TABLE app_state
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE state_history
  ADD COLUMN version INTEGER;
```

Client laedt State inklusive Version und sendet beim Speichern:

```text
PUT /api/state
Body: { "baseVersion": 42, "data": { ... } }
```

Server prueft, ob `baseVersion` noch aktuell ist.

- Ja: neue Version speichern.
- Nein: Konflikt erkennen oder automatischen Merge versuchen.

---

## Polling

Der Client prueft regelmaessig, ob remote eine neue Version existiert.

```text
GET /api/state/version
```

Wenn keine lokalen Aenderungen offen sind, kann automatisch neu geladen werden.
Wenn lokale Aenderungen offen sind, wird nicht automatisch ueberschrieben.

---

## Merge

3-Way-Merge:

- Base: Version, die der Client geladen hatte
- Local: eingehender Client-State
- Remote: aktueller Server-State

Automatisch mergebar:

- verschiedene Felder derselben Aufgabe
- nur lokal oder nur remote geaenderte Aufgaben/Buchungen
- unabhängige Settings und Kapazitaeten

Konflikte:

- dasselbe Feld unterschiedlich geaendert
- konkurrierende Sortierungen in `prioTaskIds` oder Tree-Reihenfolge

---

## Konflikt-UI

Nur echte Konflikte bekommen einen Dialog.

Optionen:

- Remote uebernehmen
- lokalen Stand exportieren
- spaeter: als neuen Taskspace forken

---

## Spaeter

- mehrere eigene Taskspaces
- Taskspace-Auswahl
- Sharing
- Rollen: owner/editor/viewer
- Einladungen per E-Mail
