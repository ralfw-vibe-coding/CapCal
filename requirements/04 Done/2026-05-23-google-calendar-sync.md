# Google Calendar Synchronisation

## Konzept

### Rollenverteilung

**Google Calendar** ist die Schnittstelle zur Außenwelt:
- Externe Termine kommen dort rein (Meeting-Einladungen, Arzttermine, etc.)
- GCal ist passiv aus CapCal-Sicht — es liefert Randbedingungen

**CapCal** ist das Werkzeug für die eigentliche Arbeitsplanung:
- Aufgaben, Kapazitäten, Buchungen werden in CapCal verwaltet
- CapCal entscheidet, wann welche Arbeit stattfindet

GCal-Events sind **Constraints** für CapCal, keine gleichwertigen Einträge.
Die Arbeit wird in CapCal geplant — GCal zeigt nur, was davon übrig bleibt.

**Der CapCal-Kalender in GCal** dient primär dazu, dass andere (Kollegen, Familie)
sehen können, wann man verplant ist. Er ist ein Export, kein Arbeitsbereich.

---

- **CapCal-Kalender** in Google Calendar: ein dedizierter Kalender, in den alle CapCal-Buchungen
  geschrieben werden. Bidirektionale Synchronisation (falls jemand in GCal etwas verschiebt).
- **Andere Google-Kalender**: werden in CapCal nur gelesen und als Hintergrund-Ereignisse
  angezeigt (Kapazitätsreduktion + Kollisionsschutz). Keine Schreibzugriffe.

---

## Einmalige Einrichtung bei Google (Betreiber-Aufgabe)

Bevor ein einzelner User GCal verbinden kann, muss CapCal einmalig als
OAuth-App bei Google registriert werden. Das ist eine Betreiber-Aufgabe,
keine User-Aufgabe — und geschieht in der **Google Cloud Console**.

### Schritte

1. **Projekt anlegen** unter [console.cloud.google.com](https://console.cloud.google.com) → "CapCal"
2. **Google Calendar API aktivieren** → APIs & Services → Library → "Google Calendar API"
3. **OAuth Consent Screen konfigurieren:**
   - App-Name: "CapCal", Support-E-Mail
   - Scopes eintragen: `calendar`, `calendar.readonly`
   - Publishing Status: **Testing** (bis zu 100 explizit eingetragene Testnutzer —
     für persönliche Nutzung dauerhaft ausreichend, kein Google-Review nötig)
4. **OAuth 2.0 Client ID erstellen** (Typ: "Web application"):
   - Authorized Redirect URIs:
     ```
     https://ralfw-capcal.netlify.app/api/auth/gcal/callback
     http://localhost:3001/api/auth/gcal/callback
     ```
   - → liefert `Client ID` und `Client Secret`
5. Diese Werte als **Netlify Environment Variables** hinterlegen:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://ralfw-capcal.netlify.app/api/auth/gcal/callback
   GCAL_TOKEN_ENCRYPTION_KEY=...   # zufälliger 32-Byte-Schlüssel für AES-256
   ```

### Publishing Status

| Status | Nutzerkreis | Google-Review |
|--------|-------------|---------------|
| **Testing** | nur explizit eingetragene Testnutzer (max. 100) | nicht nötig |
| **Production** | jeder | erforderlich (Datenschutzerklärung, Review-Prozess) |

Testing ist für persönliche und Team-Nutzung dauerhaft ausreichend.
Production wird erst relevant, wenn CapCal öffentlich für beliebige Nutzer angeboten wird.

### Kosten

Die Google Calendar API ist kostenlos. Free Quota: 1.000.000 Requests/Tag —
für eine persönliche App praktisch unbegrenzt.

---

## OAuth2-Flow im Detail

Google Calendar erfordert OAuth2 — kein einfacher API-Key für Benutzerkalender.
CapCal muss vorab als OAuth-App bei Google registriert sein (Google Cloud Console):
`Client ID` und `Client Secret` werden dort generiert und in CapCal als Umgebungsvariablen hinterlegt.

### Ablauf aus User-Sicht

1. User klickt "GCal anbinden" in den User Settings
2. Ein Google-Fenster öffnet sich (OAuth Consent Screen)
3. User wählt seinen Google-Account und erteilt CapCal Zugriff
4. User landet zurück in CapCal — fertig

### Was technisch passiert

```
User                  CapCal Server             Google
 │                         │                       │
 │─── "GCal anbinden" ────▶│                       │
 │                         │── Authorization URL ──▶│
 │◀── Redirect zu Google ──│   (mit client_id,      │
 │                         │    redirect_uri,        │
 │                         │    scope, state)        │
 │                         │                       │
 │─── Zugriff erteilen ───────────────────────────▶│
 │◀── Redirect zu CapCal ──────────────────────────│
 │    (?code=AUTH_CODE)    │                       │
 │                         │                       │
 │─── AUTH_CODE ──────────▶│                       │
 │                         │── Token-Austausch ───▶│
 │                         │   (code + client_secret)
 │                         │◀── access_token +─────│
 │                         │    refresh_token       │
 │                         │                       │
 │                         │── refresh_token ──▶ DB │
 │◀─── "Verbunden" ────────│   (verschlüsselt)      │
```

### Die zwei Token

**Authorization Code** (kurzlebig, Einmalnutzung):
- Kommt von Google per Redirect-URL zurück zu CapCal
- Wird sofort gegen die echten Token getauscht
- Danach wertlos

**Access Token** (kurzlebig, ~1 Stunde):
- Wird für jeden Google Calendar API-Aufruf mitgeschickt
- Läuft ab → wird automatisch erneuert (kein User-Eingriff nötig)
- Nicht dauerhaft gespeichert (nur im Speicher oder kurz in der DB)

**Refresh Token** (langlebig, bis zum Widerruf):
- Wird verwendet, um jederzeit einen neuen Access Token zu holen
- Muss sicher und dauerhaft gespeichert werden
- **Das sensibelste Datum in der ganzen App**
- Wird verschlüsselt in der DB gespeichert (pro User)
- Bleibt gültig bis der User den Zugriff in seinem Google-Konto widerruft

### Wo wird was gespeichert

```sql
ALTER TABLE users ADD COLUMN
  gcal_refresh_token_enc TEXT;   -- verschlüsselt (AES-256), nie im Klartext

ALTER TABLE users ADD COLUMN
  gcal_connected_at TIMESTAMPTZ; -- wann wurde verbunden

ALTER TABLE users ADD COLUMN
  gcal_calendar_id TEXT;         -- ID des gewählten CapCal-Kalenders in GCal
```

### Scopes (Zugriffsrechte)

- `https://www.googleapis.com/auth/calendar` — Lesen + Schreiben des CapCal-Kalenders
- `https://www.googleapis.com/auth/calendar.readonly` — Lesen aller anderen Kalender

CapCal fordert nur diese zwei Scopes — nichts darüber hinaus.

### CSRF-Schutz

Der `state`-Parameter im OAuth-Flow enthält ein zufälliges Token,
das CapCal vor dem Redirect in der Session speichert und nach dem Redirect prüft.
Verhindert, dass ein Angreifer den OAuth-Callback missbraucht.

### Verbindung trennen

User kann "GCal trennen" in den User Settings:
- Refresh Token wird aus der DB gelöscht
- CapCal verliert damit dauerhaft Zugriff
- Der Eintrag im CapCal-Kalender bei Google bleibt bestehen (User muss selbst löschen)
- Empfehlung: User auffordern, in seinem Google-Konto unter "Drittanbieter-Apps"
  CapCal ebenfalls zu entfernen

In einem geteilten Taskspace: jeder User synct seine eigenen Buchungen mit seinem
eigenen Google-Kalender. Keine geteilte GCal-Verbindung.

---

## Mapping: CapCal-Buchung ↔ GCal-Event

| CapCal Booking               | GCal Event                         |
|------------------------------|------------------------------------|
| Task-Titel                   | `summary`                          |
| `date` + `startTime`         | `start.dateTime`                   |
| `date` + `startTime` + `durationMinutes` | `end.dateTime`         |
| `bookingId`, `taskId`        | `extendedProperties.private`       |

### Buchungen ohne `startTime`

CapCal erlaubt Buchungen ohne feste Uhrzeit (nur Datum + Dauer).
GCal kennt nur Ganztages-Events oder Events mit Uhrzeit.

Optionen:
- Als **Ganztages-Event** → Dauer geht verloren
- Mit **konfigurierbarer Standard-Uhrzeit** (z.B. 09:00) → Dauer bleibt erhalten, Uhrzeit ist approximiert

Empfehlung: Standard-Uhrzeit, konfigurierbar in den GCal-Sync-Einstellungen.

### Identifikation von CapCal-Events in GCal

Jedes von CapCal erstellte GCal-Event bekommt `extendedProperties.private`:
```json
{ "capcalBookingId": "booking-xyz", "capcalTaskId": "task-abc" }
```
So kann der Sync CapCal-Events von fremden Events unterscheiden.

---

## Sync-Richtungen

### CapCal → GCal

Ausgelöst beim Speichern eines Taskspace-State:
- Neue Buchung → GCal-Event anlegen
- Buchung geändert (Zeit, Dauer) → GCal-Event aktualisieren
- Buchung gelöscht → GCal-Event löschen

### GCal → CapCal

Ausgelöst per **Google Calendar Push-Notification** (Webhook):
- Google ruft eine Netlify Function auf, wenn sich der CapCal-Kalender ändert
- Polling alle N Minuten als Fallback (falls Webhook abläuft oder fehlt)

Was wird übernommen:
- Event verschoben (anderer Tag / andere Uhrzeit) → Buchung in CapCal aktualisieren
- Dauer geändert → `durationMinutes` aktualisieren
- Event gelöscht → Buchung in CapCal löschen
- Event-Titel geändert → **wird ignoriert** (Titel gehört dem Task, nicht der Buchung)
- Event in anderen Kalender verschoben → Buchung löschen (nicht mehr CapCal-Kalender)

---

## Andere Kalender: Kollisionsanzeige und Kapazität

CapCal liest regelmäßig (alle ~5 Minuten) Events aus allen anderen Google-Kalendern
des Users für den sichtbaren Zeitraum.

### Anzeige im Kalender

- Als graue/gedimmte Blöcke hinter den CapCal-Buchungen
- Titel wird angezeigt (kann in den Einstellungen deaktiviert werden — Privatsphäre)
- Keine Interaktion möglich (nur lesen)
- Nicht in der Versionshistorie gespeichert (nur im lokalen State, wird nicht nach Neon geschrieben)

### Einfluss auf die Kapazitätsauslastung

GCal-Events aus anderen Kalendern reduzieren die verfügbare Tageskapazität:

```
Tageskapazität:        480 min
- GCal-Events:          90 min  (z.B. zwei Meetings)
= Verfügbar für Tasks: 390 min
  davon gebucht:        240 min
  davon frei:           150 min
```

Im Kalender-Panel wird die GCal-gebundene Zeit klar von der Task-Zeit unterschieden —
z.B. andere Farbe oder Schraffur.

**Was zählt zur Kapazitätsreduktion:**
- Alle GCal-Events mit fester Uhrzeit und Dauer aus den aktivierten Kalendern
- Ganztages-Events zählen **nicht** automatisch (wären oft Feiertage, Abwesenheiten —
  User kann das in den Einstellungen konfigurieren)
- Abgelehnte Einladungen zählen nicht

**Konfiguration:**
- Pro Kalender einstellbar: "beeinflusst Kapazität: ja / nein"
  (z.B. Firmenkalender ja, Geburtstags-Kalender nein)
- Ganztages-Events einbeziehen: ja / nein (default: nein)

---

## Zeitzonen

- GCal-Events haben eine explizite Zeitzone
- CapCal speichert Zeiten aktuell ohne Zeitzone (implizit lokal)
- Beim Sync: Zeitzone des Users als Basis (aus GCal-Profil oder explizit in CapCal-Settings)
- Wichtig für User, die zwischen Zeitzonen wechseln

---

## Einrichtung (Settings)

In den Taskspace-Einstellungen unter "Google Calendar":
- [Verbinden mit Google] → OAuth-Flow
- Auswahl: welcher Google-Kalender ist der CapCal-Kalender
  (bestehenden auswählen oder neu anlegen lassen)
- Standard-Uhrzeit für Buchungen ohne `startTime` (default: 09:00)
- Titel fremder Kalender-Events anzeigen: ja / nein
- Sync-Intervall für andere Kalender: 5 / 15 / 30 Minuten

---

## Besondere Fälle

**Task wird gelöscht, Buchungen existieren noch:**
→ Buchungen werden ebenfalls gelöscht → GCal-Events werden entfernt

**GCal-Event wird auf einen anderen Tag gezogen:**
→ Buchungsdatum ändert sich in CapCal → Kapazitätsplanung passt sich an

**Mehrere Buchungen desselben Tasks am selben Tag:**
→ Mehrere GCal-Events, alle mit demselben `capcalTaskId` aber unterschiedlichem `capcalBookingId`

**GCal-Kalender nicht erreichbar (API-Fehler, Rate Limit):**
→ Sync wird mit Retry-Backoff wiederholt, User sieht Hinweis "Sync ausstehend"

---

## Offene Fragen

- Soll der CapCal-Kalender in GCal automatisch angelegt werden, oder muss der User einen bestehenden auswählen?
- Ganztages-Events in der Kapazität einbeziehen: default nein, aber konfigurierbar
- Soll die GCal-Verbindung pro User oder pro Taskspace konfiguriert werden?
  (Empfehlung: pro User, da jeder seinen eigenen Google-Account hat)

---

## Abschlussnotiz 2026-05-23

Umgesetzt wurde die erste produktive Stufe der Google-Calendar-Integration:

- Google Calendar kann pro User per OAuth verbunden und wieder getrennt werden.
- Der User kann relevante Google-Kalender auswählen und die Auswahl später ändern.
- Google-Events werden separat von CapCal-Buchungen geladen und gecacht, nicht als Buchungen in den Taskspace geschrieben.
- Der sichtbare Cal-Zeitraum lädt die passenden Google-Events nach; ein manueller Refresh aktualisiert den Event-Cache sofort.
- Google-Events werden read-only im Kalender angezeigt, visuell von CapCal-Buchungen unterschieden und über ein Detailpanel geöffnet.
- Nur busy Events zählen in die gebuchte Tageskapazität; busy Ganztagesevents zählen mit der Tageskapazität.
- Export von CapCal-Buchungen nach Google Calendar und bidirektionale Synchronisation bleiben bewusst spätere Ausbaustufen.
