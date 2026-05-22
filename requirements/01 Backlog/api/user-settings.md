# User Settings

## Abgrenzung

Es gibt zwei Ebenen von Einstellungen:

| | User Settings | Taskspace Settings |
|---|---|---|
| **Scope** | gilt für den Account | gilt für einen Taskspace |
| **Geteilt?** | nein, nur der eigene User | ja, alle Taskspace-Mitglieder |
| **Gespeichert** | in `users`-Tabelle (DB) | in `state.settings` (Taskspace-State) |
| **Beispiele** | API-Key, Profil, Zeitzone | Kalenderzeiten, Standard-Dauern, Wochenenden |

---

## Inhalt der User Settings

### Profil
- **Name** (Anzeigename, optional)
- **Kürzel** (2–3 Zeichen, für Kollaborationsanzeige, optional)
- **E-Mail** (read-only — ist der Login-Identifier)

### API-Key
- Aktuellen Key anzeigen (nur einmalig nach Erzeugung im Klartext sichtbar,
  danach maskiert: `sk-••••••••••••••••••••••••xyz`)
- **Key erneuern** — invalidiert den alten Key sofort
- Letzter Einsatz: Zeitstempel wann der Key zuletzt verwendet wurde

### Zeitzone
- Eigene Zeitzone einstellen (Standard: Browser-Zeitzone)
- Relevant für GCal-Sync und korrekte Darstellung von Buchungen

---

## Datenmodell

Strukturelle Felder bleiben eigene Spalten (Login, Key), alles Editierbare
kommt in ein JSONB-Feld `profile` — flexibel erweiterbar ohne Schema-Migration:

```sql
ALTER TABLE users ADD COLUMN
  profile JSONB NOT NULL DEFAULT '{}';

ALTER TABLE users ADD COLUMN
  api_key_hash TEXT UNIQUE;

ALTER TABLE users ADD COLUMN
  api_key_last_used_at TIMESTAMPTZ;
```

Inhalt von `profile`:
```json
{
  "name": "Ralf Westphal",
  "initials": "RW",
  "timezone": "Europe/Berlin"
}
```

---

## UI

### Einstiegspunkt: User-Icon oben rechts

In der App-Leiste, neben dem bestehenden Settings-Icon:
- Stilisiertes Männchen-Icon (z.B. `lucide: User`)
- Zeigt später das Kürzel an, wenn eines gesetzt ist (`RW` statt Icon)
- Klick öffnet den User Settings Dialog

```
[⚙]  [👤]        ← bestehend + neu, oben rechts
```

### User Settings Dialog

Modal, getrennt von den Taskspace Settings:

```
┌──────────────────────────────────┐
│  Mein Profil              [✕]   │
│                                  │
│  Name      [Ralf Westphal      ] │
│  Kürzel    [RW                 ] │
│  E-Mail    info@ralfw.de         │
│            (nicht änderbar)      │
│                                  │
│  Zeitzone  [Europe/Berlin     ▼] │
│                                  │
│  ────────────────────────────    │
│  API-Key                         │
│  sk-••••••••••••••••••••xyz      │
│  Zuletzt verwendet: heute 09:14  │
│  [Key erneuern]                  │
│                                  │
│                    [Speichern]   │
└──────────────────────────────────┘
```
