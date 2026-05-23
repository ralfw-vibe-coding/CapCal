# iCloud Calendar Integration

## Konzept

Dieselbe Rolle wie Google Calendar (→ google-calendar-sync.md):
- iCloud-Kalender liefern externe Termine als **Constraints** für CapCal
- Anzeige als Hintergrundevents im Kalender-Panel (read-only)
- Kapazitätsreduktion durch externe Termine
- Kein eigener "CapCal-Kalender" in iCloud — nur lesen, nicht schreiben

---

## Authentifizierung

Kein OAuth, kein App-Registration bei Apple nötig.

Der User generiert einmalig ein **App-Specific Password** in seinen Apple-ID-Einstellungen:

1. [appleid.apple.com](https://appleid.apple.com) aufrufen und mit Apple ID anmelden
2. Abschnitt **"Anmeldung und Sicherheit"** öffnen
3. Ganz unten: **"App-Specific Passwords"** → **"Passwort generieren"**
4. Namen eingeben: z.B. "CapCal"
5. Das angezeigte Passwort hat das Format `xxxx-xxxx-xxxx-xxxx` — sofort kopieren,
   es wird danach nicht mehr angezeigt
6. Apple ID (z.B. `name@icloud.com`) und dieses Passwort in CapCal unter User Settings eintragen

**Voraussetzung:** Zwei-Faktor-Authentifizierung muss für die Apple ID aktiviert sein —
ohne 2FA kann kein App-Specific Password generiert werden.

CapCal speichert das Passwort **verschlüsselt** in der DB (analog zum GCal Refresh Token).
Kommunikation mit iCloud läuft per **HTTP Basic Auth**.

---

## Protokoll: CalDAV

iCloud Calendar verwendet CalDAV (RFC 4791) — kein REST-API, kein JSON.
Bibliothek: **`tsdav`** (npm) übernimmt den CalDAV-Transport.
Kalenderdaten kommen im **iCalendar-Format** (`.ics`, RFC 5545) — kein XML, eigenes Textformat.
Bibliothek: **`ical.js`** (npm) parst iCalendar in nutzbare Objekte.

---

## Endpunkt-Discovery

Der CalDAV-Einstiegspunkt für iCloud ist `https://caldav.icloud.com`.
Die finale Calendar-Home-URL muss per PROPFIND ermittelt werden —
`tsdav` macht das automatisch beim `client.login()`.

---

## Benötigte Operationen

### Kalender auflisten

```ts
import { DAVClient } from "tsdav";

const client = new DAVClient({
  serverUrl: "https://caldav.icloud.com",
  credentials: {
    username: "apple-id@icloud.com",
    password: "app-specific-password"
  },
  authMethod: "Basic"
});

await client.login();
const calendars = await client.fetchCalendars();
// → [{ displayName: "Privat", url: "..." }, ...]
```

User wählt danach in den Settings, welche Kalender in CapCal angezeigt werden sollen.

### Events in Zeitraum abrufen

```ts
import ICAL from "ical.js";

const objects = await client.fetchCalendarObjects({
  calendar: selectedCalendar,
  timeRange: {
    start: "2026-05-01T00:00:00Z",
    end: "2026-05-31T23:59:59Z"
  }
});

const events = objects.map(obj => {
  const comp = new ICAL.Component(ICAL.parse(obj.data));
  const vevent = comp.getFirstSubcomponent("vevent");
  return {
    title: vevent.getFirstPropertyValue("summary"),
    start: vevent.getFirstPropertyValue("dtstart").toJSDate(),
    end:   vevent.getFirstPropertyValue("dtend").toJSDate(),
  };
});
```

---

## Wiederkehrende Events (RRULE)

"Jeden Montag 9 Uhr" ist in iCalendar eine einzige Regel — muss für einen
Zeitraum in einzelne Vorkommen aufgefaltet werden. `ical.js` kann das:

```ts
const expand = new ICAL.RecurExpansion({
  component: vevent,
  dtstart: vevent.getFirstPropertyValue("dtstart")
});
// Einzelne Vorkommen iterieren bis zum Ende des Zeitraums
```

Für CapCal (read-only, Hintergrundevents) reichen die häufigen Fälle:
tägliche, wöchentliche, monatliche Wiederholungen.
Komplexe Randfälle (z.B. EXDATE, RDATE) können anfangs ignoriert werden.

---

## Polling

Kein Push/Webhook bei iCloud — CapCal pollt regelmäßig (wie bei GCal-fremden Kalendern):
alle 5–30 Minuten, konfigurierbar in den Settings.

---

## Vergleich mit Google Calendar

| | GCal | iCloud |
|---|---|---|
| Auth | OAuth2 (Browser-Flow) | App-Specific Password (manuell) |
| Einrichtung Betreiberseite | Google Cloud Console (aufwändig) | keine |
| Protokoll | REST + JSON | CalDAV + iCalendar |
| Push | Webhooks ✓ | Polling only |
| Schreiben (CapCal → Kalender) | ✓ | nicht geplant |
| Bibliotheken | `googleapis` | `tsdav` + `ical.js` |

---

## Einstellungen (User Settings)

```
iCloud Kalender
  Apple ID   [name@icloud.com        ]
  Passwort   [App-Specific Password  ]
  [Verbinden]

  Kalender:
  [✓] Privat
  [✓] Arbeit
  [✗] Geburtstage
  
  Kapazität beeinflussen: ja / nein (pro Kalender)
  Polling-Intervall: [15 Minuten ▼]
```

---

## Offene Fragen

- Soll iCloud-Schreiben (CapCal-Buchungen → iCloud) später nachgerüstet werden?
- Was passiert, wenn das App-Specific Password vom User widerrufen wird?
  (API-Fehler 401 → User-Hinweis "iCloud-Verbindung unterbrochen")
