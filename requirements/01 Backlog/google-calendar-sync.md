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

## Authentifizierung

Google Calendar erfordert **OAuth2** — kein einfacher API-Key für Benutzerkalender.

- Scope `https://www.googleapis.com/auth/calendar` für den CapCal-Kalender (lesen + schreiben)
- Scope `https://www.googleapis.com/auth/calendar.readonly` für andere Kalender
- OAuth-Flow: User autorisiert CapCal einmalig über Google
- **Refresh-Token** wird serverseitig gespeichert (verschlüsselt in der DB, pro User)
- Access-Token wird bei Bedarf automatisch erneuert

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
