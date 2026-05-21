# Trello-Integration

## Import vs. Synchronisation

### Import (einmalig)
- User löst manuell aus: "Importiere Tasks von Trello Board X"
- Trello-Karten werden als CapCal-Tasks angelegt
- Danach: beide Systeme sind voneinander unabhängig
- Gut für Migration ("ich wechsle zu CapCal")
- Schlecht für parallelen Betrieb ("ich nutze beides weiter")

### Synchronisation (laufend)
- Ein separater Prozess liest Trello per API und schreibt nach CapCal (und umgekehrt)
- Beide Systeme bleiben konsistent
- Gut für parallelen Betrieb ("mein Team arbeitet in Trello, ich plane in CapCal")
- Komplexer: Konflikte, Mapping, Authentifizierung gegen zwei APIs

**Empfehlung**: Synchronisation — der Mehrwert liegt im laufenden Abgleich.
Ein einmaliger Import ist nur sinnvoll als Einschritt-Einstieg.

---

## Verbindung zu Custom Processes

Die Trello-Integration profitiert direkt von Custom Processes:
Trello-Listen entsprechen Prozessschritten.

Beispiel: Trello-Board "Blog" mit Listen:
```
Backlog → Recherche → Schreiben → Review → Veröffentlicht
```
→ wird zu einem CapCal-Prozess "Blog" mit denselben Schritten.

Eine Karte in der Trello-Liste "Schreiben" = Task im Schritt "Schreiben".
Wenn der Task in CapCal auf "Review" weitergeschaltet wird → Karte in Trello
wird in die Liste "Review" verschoben, und umgekehrt.

---

## Architektur

### Sync-Prozess (separater Service)

Der Sync läuft **außerhalb des Browsers** — entweder:
- Als **Netlify Scheduled Function** (alle N Minuten)
- Als **Trello Webhook** → Netlify Function (reaktiv, bei jeder Änderung in Trello)

Beides ist kombinierbar: Webhook für schnelle Reaktion, Polling als Fallback.

```
Trello API ←→ Sync-Service ←→ CapCal API
```

Der Sync-Service kennt das Mapping: welches Trello-Board gehört zu welchem
CapCal-Taskspace + welchem Prozess.

### Mapping-Konfiguration (pro Taskspace)

In den Taskspace-Einstellungen:
- Trello API-Key + Token (OAuth oder persönlicher Token)
- Board auswählen (Dropdown aus verfügbaren Trello-Boards)
- Listen → Prozessschritte zuordnen (automatisch nach Name, manuell korrigierbar)
- Sync-Richtung: nur rein / nur raus / bidirektional

---

## Was wird synchronisiert

| Trello            | CapCal Task              |
|-------------------|--------------------------|
| Karten-Titel      | `title`                  |
| Liste             | `currentStepId` (Prozess)|
| Fälligkeitsdatum  | `dueDate`                |
| Mitglieder        | `ownerIds` (per E-Mail)  |
| Archiviert        | Status `Aborted`         |

Nicht synchronisiert (kein Äquivalent in CapCal):
- Trello Labels → vorerst ignoriert
- Trello Beschreibung / Kommentare → kein Textfeld in CapCal
- Trello Checklisten → kein Äquivalent

---

## Konflikte

Wenn dieselbe Karte/Task in beiden Systemen gleichzeitig geändert wurde:
- **Last-write-wins** pro Feld: die neuere Änderung gewinnt
- Kein Dialog nötig — der Sync ist ein Hintergrundprozess

Für den Anfang ist das ausreichend, da die meisten Felder klar einem System
"gehören" (Schätzung und Bookings nur in CapCal, Labels nur in Trello).

---

## Neue Tasks

- In Trello neue Karte angelegt → neuer Task in CapCal (mit zugeordnetem Prozess)
- In CapCal neuer Task mit Trello-Prozess angelegt → neue Karte in Trello

Tasks ohne Trello-Prozess werden nicht nach Trello synchronisiert.

---

## Rollout-Strategie

**Stufe 1** — Einweg-Sync Trello → CapCal:
- Nur lesen aus Trello, keine Rückschreibung
- Einfacher Start, kein Risiko für Trello-Daten

**Stufe 2** — Bidirektional:
- Statusänderungen in CapCal → Trello
- Neue Tasks in CapCal mit Trello-Prozess → Trello

---

## Offene Fragen

- Sollen auch andere Tools integriert werden (GitHub Issues, Jira, Linear)?
  Der Sync-Mechanismus wäre derselbe, nur das Mapping ändert sich.
- Wer hostet den Sync-Service, wenn CapCal auf Netlify läuft?
  Netlify Scheduled Functions haben eine max. Laufzeit — reicht das?
- Trello OAuth oder persönlicher API-Token? (Token einfacher, OAuth sicherer)
