# Authentifizierung & Taskspace - Stufe 1

## Ziel

CapCal bekommt eine einfache Authentifizierung fuer den Webbetrieb.
In Stufe 1 gilt bewusst:

- Ein User wird ausschliesslich ueber seine E-Mail-Adresse identifiziert.
- Login erfolgt per OTP-Code.
- Jeder User hat genau einen Taskspace.
- Es gibt keine Taskspace-Auswahl, kein Sharing und keine Einladungen.
- Optimistic Locking und Merge kommen erst in Stufe 2.

---

## Datenmodell

Die bestehende Struktur bleibt weitgehend erhalten. `app_state` und `state_history`
werden userbezogen.

```sql
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_state
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

ALTER TABLE state_history
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
```

Fuer Stufe 1 hat ein User genau eine aktuelle State-Zeile. Langfristig kann
`user_id` in `app_state` eindeutig werden. Bestehende Altstruktur mit `id = 1`
wird migrationsfreundlich behandelt.

---

## Login-Flow

1. User gibt E-Mail-Adresse ein.
2. Server legt den User bei Bedarf an.
3. Server erzeugt einen 6-stelligen OTP-Code.
4. OTP wird in `auth_tokens` gespeichert.
5. OTP ist 5 Minuten gueltig.
6. Server versendet den OTP per Resend.
7. User gibt OTP ein.
8. Server validiert OTP und markiert ihn als benutzt.
9. Server setzt eine Session fuer den Browser.

Die Session darf lange gueltig sein, z.B. 90 Tage. Nicht der OTP ist lange gueltig,
sondern die eingeloggte Session.

---

## Session

Die Session soll fuer den Browser bequem sein und bei API-Aufrufen automatisch
mitlaufen.

Empfehlung:

- signiertes Session-Token
- Speicherung als Cookie
- Laufzeit: 90 Tage
- Cookie wird bei Logout geloescht

---

## API

```text
POST /api/auth/request-otp
Body: { "email": "user@example.com" }

POST /api/auth/verify
Body: { "email": "user@example.com", "otp": "123456" }

GET /api/auth/me

POST /api/auth/logout

GET /api/state
PUT /api/state
```

`GET/PUT /api/state` arbeitet im Postgres-Betrieb fuer den eingeloggten User.
Im lokalen Filesystem-Betrieb kann Auth deaktiviert bleiben, damit Entwicklung
einfach bleibt.

---

## E-Mail-Versand

Resend wird fuer den OTP-Versand genutzt.

Environment:

```text
RESEND_API_KEY=...
AUTH_SESSION_SECRET=...
AUTH_FROM_EMAIL=...
```

Wenn lokal kein `RESEND_API_KEY` gesetzt ist, darf der OTP im Serverlog ausgegeben
werden, damit Entwicklung ohne E-Mail-Dienst moeglich bleibt.

---

## Verhalten fuer neue User

Wenn ein User noch keinen State hat, bekommt er `emptyState`.
Beim ersten Save wird sein `app_state` angelegt.

---

## Nicht Teil von Stufe 1

- mehrere Taskspaces pro User
- Taskspace-Auswahl
- Sharing
- Einladungen
- Rollen/Rechte
- Versionsnummern im Client
- Optimistic Locking
- Merge-Konfliktdialog

---

## Umsetzung

Erledigt am 2026-05-22:

- Requirements auf Stufe 1 reduziert: OTP-Login, ein Taskspace pro User, kein Sharing.
- Stufe 2 als eigene Backlog-Karte angelegt.
- Auth-Schema fuer `users` und `auth_tokens` ergaenzt.
- OTP-Login mit 5 Minuten Gueltigkeit implementiert.
- OTP-Versand ueber Resend vorbereitet; ohne `RESEND_API_KEY` wird der OTP lokal im Serverlog ausgegeben.
- Signierte 90-Tage-Session per Cookie implementiert.
- Lokale Server-Routen fuer `/api/auth/request-otp`, `/api/auth/verify`, `/api/auth/me`, `/api/auth/logout` ergaenzt.
- Netlify Function fuer `/api/auth/*` ergaenzt.
- Postgres-StateProvider speichert und laedt `app_state` und `state_history` userbezogen.
- `/api/state` verlangt im Postgres-Betrieb eine Session; im Filesystem-Betrieb bleibt lokale Entwicklung ohne Login moeglich.
- Frontend zeigt bei `401` eine OTP-Loginmaske und laedt danach den userbezogenen State.
- Build und vorsichtiger Postgres-Migrationstest gegen Neon erfolgreich.
