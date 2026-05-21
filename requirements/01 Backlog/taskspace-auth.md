# Authentifizierung & Taskspaces

## Begriffe

- **User**: ein Konto, identifiziert ausschließlich über E-Mail-Adresse
- **Taskspace**: eine eigenständige CapCal-Datenbank (Tasks, Kapazitäten, Bookings, Settings)
- Ein User kann mehrere Taskspaces besitzen und zu weiteren eingeladen werden

---

## Datenmodell

```sql
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,       -- optional, später per Profil setzbar
  initials   TEXT,       -- optional, für Kollaborationsanzeige
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Einmal-Token für Magic Link oder OTP
CREATE TABLE auth_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,   -- zufälliger Token (Magic Link) oder 6-stelliger Code (OTP)
  kind       TEXT NOT NULL,          -- 'magic_link' | 'otp'
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ             -- NULL = noch nicht eingelöst
);

CREATE TABLE taskspaces (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE taskspace_members (
  taskspace_id  INTEGER NOT NULL REFERENCES taskspaces(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL DEFAULT 'editor', -- 'owner' | 'editor'
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (taskspace_id, user_id)
);

CREATE TABLE state_history (
  id            SERIAL PRIMARY KEY,
  taskspace_id  INTEGER NOT NULL REFERENCES taskspaces(id),
  version       INTEGER NOT NULL,               -- monoton steigend pro Taskspace
  saved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by      INTEGER REFERENCES users(id),
  data          JSONB NOT NULL
);
```

Aktueller Stand eines Taskspace:
```sql
SELECT * FROM state_history
WHERE taskspace_id = $1
ORDER BY version DESC
LIMIT 1;
```

---

## Login-Flow (Magic Link / OTP)

Kein Passwort, kein separater Signup. Eine unbekannte E-Mail-Adresse legt automatisch ein neues Konto an.

### Ablauf

1. User gibt E-Mail-Adresse ein
2. Server prüft, ob User existiert — falls nicht, wird er angelegt
3. Server generiert Token + speichert ihn in `auth_tokens` (Laufzeit: 15 Minuten)
4. Server schickt E-Mail:
   - **Magic Link**: Link mit Token als Query-Parameter (`/auth/verify?token=abc123`)
   - **OTP**: 6-stelliger Code, den der User auf der nächsten Seite eingibt
5. User klickt Link oder gibt Code ein
6. Server validiert Token (existiert, nicht abgelaufen, nicht bereits verwendet)
7. Token wird als `used_at = NOW()` markiert (Einmalnutzung)
8. Server gibt signiertes **JWT** zurück (`userId`, Laufzeit z.B. 90 Tage)
9. JWT wird im Browser gespeichert (localStorage oder httpOnly-Cookie)

### Variante: Magic Link vs. OTP

Beide Varianten können gleichzeitig unterstützt werden (selber Endpunkt, selbe Token-Tabelle):
- Magic Link: bequemer (ein Klick), aber nur auf dem Gerät nutzbar, das die Mail öffnet
- OTP: flexibler (Code auf anderem Gerät eingeben), minimal mehr Aufwand

Empfehlung für den Start: **OTP** — funktioniert auch, wenn der Mail-Client auf einem anderen Gerät ist.

### E-Mail-Versand

Braucht einen Transactional-E-Mail-Dienst. Empfehlung: **Resend** (einfache API, großzügiges Free-Tier, gut mit Netlify kombinierbar).

### Kein Passwort-Reset

Entfällt komplett — das ist der Hauptvorteil dieses Ansatzes.

### Profil (später)

Name, Kürzel, Profilbild können nachträglich per Profil-Seite gesetzt werden. Nicht im ersten Rollout.

---

## Optimistic Locking (von Anfang an)

Optimistic Locking und Polling sind grundlegende Mechanismen und werden von Beginn an eingebaut — nicht erst bei Sharing. Auch ein Einzelnutzer kann denselben Taskspace auf mehreren Geräten offen haben.

### Prinzip

1. Client lädt State — bekommt dabei die aktuelle `version` (z.B. `42`)
2. Client arbeitet lokal
3. Client sendet `PUT /api/taskspaces/:id/state` mit `{ baseVersion: 42, data: {...} }`
4. Server prüft: ist `42` noch die neueste Version?
   - **Ja** → neue Version `43` anlegen, Erfolg zurückgeben
   - **Nein** → `409 Conflict` + aktuelle Version + Diff-Zusammenfassung zurückgeben
5. Client zeigt Konfliktdialog

### HTTP-Interface

```
PUT /api/taskspaces/:id/state
Body: { "baseVersion": 42, "data": { ... } }

200 OK       → { "version": 43, "data": { ... } }
409 Conflict → { "remoteVersion": 44, "remoteData": { ... }, "diff": { ... } }
```

---

## Polling

Damit Änderungen anderer User (oder anderer Geräte) automatisch erscheinen:

- Frontend pollt alle **30 Sekunden**: `GET /api/taskspaces/:id/version`
- Antwort: `{ "version": 44 }`
- Wenn `version > lokaleVersion` **und** keine lokalen Änderungen pending → automatisch neu laden
- Wenn lokale Änderungen pending → Hinweis anzeigen, nicht automatisch überschreiben (→ Konfliktdialog beim nächsten Save)

---

## Merge-Strategie bei Konflikt

### 3-Way-Merge (automatisch)

Wenn der Server ein `PUT` mit `baseVersion: 42` erhält, aber die aktuelle Version bereits `44` ist, wird nicht sofort mit 409 geantwortet. Stattdessen versucht der Server einen **automatischen 3-Way-Merge**:

- **Base** = `state_history` wo `version = 42` (gemeinsamer Ausgangspunkt)
- **Local** = die eingehenden Daten vom Client
- **Remote** = aktuellste Version (`44`)

Für jeden Eintrag in jedem Bereich gilt:
- Nur Local geändert → Local übernehmen
- Nur Remote geändert → Remote übernehmen
- Beide gleich geändert → egal welche nehmen
- Beide unterschiedlich geändert → **echter Konflikt**

Nur wenn echter Konflikt → `409` mit Konfliktdetails.
Kein Konflikt → Merge wird als neue Version gespeichert, `200 OK`.

### Merge-Regeln pro Bereich

**Tasks** (keyed by `id`):
- Task nur lokal hinzugefügt/geändert/gelöscht → übernehmen
- Task nur remote hinzugefügt/geändert/gelöscht → übernehmen
- Task auf beiden Seiten unterschiedlich geändert → Konflikt pro Feld möglich
- Feldebene: `title`, `status`, `estimateMinutes`, `dueDate`, `done` getrennt betrachten — zwei Seiten können verschiedene Felder desselben Tasks ändern ohne Konflikt

**prioTaskIds** (geordnete Liste):
- Einträge hinzugefügt/entfernt auf einer Seite → merge
- Reihenfolge auf beiden Seiten unterschiedlich geändert → Konflikt

**prioDurations** (keyed by taskId):
- Pro Eintrag wie Tasks

**Bookings** (keyed by `id`):
- Pro Eintrag wie Tasks

**dailyCapacities** (keyed by Datum):
- Pro Datum: `dayCapacityMinutes` und `planningCapacityMinutes` getrennt

**settings** (keyed by Feldname):
- Pro Einstellung einzeln

---

### Erfolgreicher Auto-Merge (kein Dialog nötig)

Wenn alle Änderungen automatisch zusammengeführt werden konnten, wird still gespeichert.
Ein kurzer Hinweis in der UI reicht: "Zusammengeführt mit externer Änderung" (statt "Gespeichert").

### Konfliktdialog (nur bei echtem Konflikt)

Echte Konflikte sind selten. Wenn sie auftreten, soll klar erkennbar sein, welche Einträge betroffen sind:

```
┌─────────────────────────────────────────────────────┐
│  Konflikt beim Speichern                            │
│                                                     │
│  Automatisch zusammengeführt: 4 Änderungen ✓        │
│                                                     │
│  Nicht automatisch lösbar:                         │
│  • Task "Präsentation": Status lokal "Done",        │
│    remote "Aborted"                                 │
│  • Prioritätsliste: unterschiedlich umsortiert      │
│                                                     │
│  [Remote übernehmen]  [Als neuen Taskspace forken]  │
└─────────────────────────────────────────────────────┘
```

**Option A — Remote übernehmen:**
- Konflikt-Einträge: Remote-Version gewinnt
- Automatisch gemergte Änderungen bleiben erhalten
- Wird als neue Version gespeichert

**Option B — Als neuen Taskspace forken:**
- Lokaler Stand wird als neuer Taskspace gespeichert
- Generierter Name z.B. "Mein Taskspace (Konflikt 21.05.2026 14:32)"
- Remote-Taskspace bleibt unverändert, kein Datenverlust

---

## Taskspace-Auswahl

Nach dem Login sieht der User eine Auswahlliste:

```
Meine Taskspaces:
  • Persönlich (Standard)
  • Arbeit Q3

Geteilt mit mir:
  • Team Alpha (eingeladen von: anna@example.com)
```

- Ein Taskspace kann als Standard markiert werden → wird beim Login direkt geöffnet
- Wechsel zwischen Taskspaces ohne Re-Login
- Neuen Taskspace anlegen
- Einladung per E-Mail-Adresse verschicken (User muss bereits registriert sein)

---

## Snapshot-Cooldown (aus web-hosting.md)

Auch mit Optimistic Locking gilt: das Frontend schreibt sehr häufig (250ms debounce).
Der Server legt nur dann eine neue Version an, wenn:

1. Die Versionsnummer im Request passt (Optimistic Locking), **und**
2. seit der letzten Version mindestens N Minuten vergangen sind — **oder** es ist ein expliziter "wichtiger" Save (z.B. manuell ausgelöst, Task auf Done gesetzt)

Das hält die Versionshistorie überschaubar.

---

## Rollout-Strategie (Empfehlung)

**Stufe 1** — Einzelnutzer, Login:
- Login-Seite, OTP per E-Mail, JWT
- Jeder User hat automatisch einen Standard-Taskspace
- Optimistic Locking + Polling von Anfang an aktiv

**Stufe 2** — Mehrere eigene Taskspaces:
- Taskspace-Auswahl nach Login
- Anlegen / Umbenennen / Forken

**Stufe 3** — Sharing + Kollaboration:
- Einladen per E-Mail
- Konfliktdialog mit Diff-Anzeige

---

## Offene Fragen

- Magic Link oder OTP als Standard? (Empfehlung: OTP, da geräteunabhängig)
- JWT in localStorage oder httpOnly-Cookie? (Cookie sicherer gegen XSS, aber aufwändiger mit Netlify Functions)
- Darf ein eingeladener User nur lesen (viewer) oder immer schreiben (editor)?
- Was passiert mit dem Taskspace, wenn der Owner seinen Account löscht?
