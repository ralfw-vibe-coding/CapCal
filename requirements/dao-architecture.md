# DAO Architecture

## Intention

Moderne Anwendungen — insbesondere solche mit reichhaltigem clientseitigem Zustand — neigen dazu, Domänenlogik, Datenzugriff und UI-Code eng miteinander zu verweben. Das Ergebnis ist Code, der schwer zu verstehen, schwer zu testen und schwer parallel zu entwickeln ist.

Die DAO Architecture begegnet diesem Problem durch **maximale Entkopplung**. Sie strukturiert eine Anwendung so, dass ihre Bestandteile unabhängig voneinander entwickelt, getestet und ausgetauscht werden können — auch durch mehrere Entwickler oder KI-Agenten gleichzeitig, die arbeitsteilig an getrennten Teilen der Codebasis arbeiten.

Das zentrale Prinzip: Die Domäne wird als **großes, autonomes Objekt** im Sinne von Alan Kay behandelt. Kay beschrieb Objekte als etwas, das wie biologische Zellen funktioniert: vollständig in sich geschlossen, mit einer klar definierten Oberfläche aus Nachrichten. Eine Zelle kennt ihre Umgebung nicht. Sie reagiert nur auf Nachrichten und sendet Antworten zurück. Sie kapselt ihren Zustand vollständig. DAO steht für **Domain As Object** — die Domäne ist dieses große, zentrale Objekt.

---

## Überblick

Die Architektur besteht aus vier Kategorien von Modulen:

```
┌─────────────────────────────────────────────┐
│  IMPERATIVE SHELL                           │
│                                             │
│  Portal          Providers                  │
│  (React, etc.)   (Domain State,             │
│  wraps Reactors  Auth, GCal, iCal)          │
└──────┬───────────────────┬──────────────────┘
       │ wraps             │ injiziert in
┌──────▼───────────────────▼──────────────────┐
│  FUNCTIONAL CORE                            │
│                                             │
│  Reactors         RPUs                      │
│  (Workflows,      (Commands/Queries,        │
│   kein React,      (almost) pure functions, │
│   kein State)      State orthogonal)        │
└─────────────────────────────────────────────┘
```

Die Architektur folgt dem Muster **Functional Core / Imperative Shell**:

- **Functional Core**: RPUs und Reactors — technologieunabhängig, deterministisch, testbar.
- **Imperative Shell**: Providers und Portal — technologiespezifisch, verantwortlich für I/O und Darstellung.

---

## Bestandteile

### Domäne — Domain As Object

Die Domäne ist das Herzstück der Anwendung. Sie verwaltet den gesamten fachlichen Zustand und enthält die gesamte Domänenlogik. Niemand außerhalb der Domäne kennt die interne Struktur dieses Zustands. Die Domäne ist vollständig opak.

Die Oberfläche der Domäne besteht ausschließlich aus den Signaturen ihrer RPUs. Wie eine biologische Zelle kommuniziert die Domäne nur über Nachrichten: Request rein, Response raus. Das macht sie zu einem **Abstract Data Type (ADT)** im großen Maßstab.

Die Domäne kapselt intern auch ihren **Domain State Provider** — den Mechanismus, mit dem sie ihren Zustand persistiert (z.B. durch Aufruf eines Backend-APIs oder einer lokalen Datenbank). Dieser Provider ist ein Implementierungsdetail der Domäne. Kein Modul außerhalb der Domäne kennt ihn oder interagiert mit ihm direkt.

---

### RPUs — Request Processing Units

RPUs sind die einzige Tür in die Domäne und aus ihr heraus. Jede RPU implementiert genau **eine Capability** der Domäne — entweder einen Command (schreibend) oder eine Query (lesend). Dieses Prinzip folgt der **Command-Query-Separation (CQS)**.

Jede RPU exportiert nach außen genau eine Methode:

```
process(request) → response
```

Für einen Command ist der Response ein Statuswert (Erfolg, Fehler, Validierungsergebnis, ggf. Metadaten). Für eine Query ist es das angefragte Ergebnis.

Von außen wirken RPUs wie **(almost) pure functions**: gleicher Request, deterministisches Ergebnis. Ihr interner Zustand (der Domänenzustand, den sie laden und speichern) ist orthogonal zu ihrer Schnittstelle — er ist ein "Implementierungsdetail", kein sichtbarer Parameter.

**Wichtige Eigenschaft: RPUs kennen sich gegenseitig nicht.** Jede RPU ist vollständig self-contained. Eine RPU, die einen komplexen Command verarbeitet, ruft keine andere RPU auf. Sie hat direkten Zugriff auf den Domain State Provider und erledigt alles selbst. Das hält die Kopplung minimal und macht jede RPU unabhängig entwickelbar und testbar.

**Testbarkeit**: Da RPUs technologieagnostisch sind, können sie isoliert mit einem gemockten Domain State Provider getestet werden — ohne UI, ohne echte Datenbank, ohne laufenden Server.

---

### Domain State Provider

Der Domain State Provider ist eine interne Abstraktion der Domäne. Er kapselt den Zugriff auf den persistierten Domänenzustand — typischerweise über ein Backend-API, eine Datenbank oder lokale Speichermedien.

Alle RPUs kennen den Domain State Provider. Kein Modul außerhalb der Domäne kennt ihn.

Der Domain State Provider ist **austauschbar**: Eine Implementierung kann auf ein REST-Backend zeigen, eine andere auf eine lokale JSON-Datei, eine dritte auf einen In-Memory-Store für Tests. Die RPUs bleiben dabei unverändert.

---

### External Providers

External Providers sind technologiespezifische Module für externe Dienste, die nicht Teil der Domäne sind — zum Beispiel Authentifizierungsdienste, externe Kalender-APIs oder Benachrichtigungssysteme.

Die Domäne kennt External Providers **nicht**. External Providers kennen RPUs **nicht**. Sie sind voneinander unabhängig.

In Anwendungen mit einem Backend werden External Providers dort implementiert. Im Frontend existieren **Proxy-Module**, die die Backend-Endpunkte dieser Providers kapseln und nach außen eine saubere Schnittstelle bieten.

---

### Reactors

Reactors sind technologieagnostische **Workflow-Orchestratoren**. Sie kombinieren Aufrufe von RPUs und External Providers zu zusammenhängenden Abläufen — z.B. wenn eine Benutzeraktion mehrere Domänen-Operationen erfordert oder Daten zwischen externen Diensten und der Domäne ausgetauscht werden müssen.

Ein Reactor kennt RPUs und External Providers, aber weder die UI-Technologie noch den Domain State Provider. Er enthält keine Domänenlogik — er orchestriert nur.

Reactors sind technologieagnostisch und damit eigenständig testbar: RPUs und Providers können gemockt werden, der Reactor selbst bleibt sauber.

Wenn eine Benutzeraktion einfach genug ist, dass eine einzige RPU ausreicht, kann das Portal diese direkt aufrufen, ohne einen Reactor zu bemühen.

---

### Portal

Das Portal ist die einzige Schicht, die UI-Technologie kennt. Hier lebt z.B. React, SwiftUI oder eine Kommandozeilendarstellung. Das Portal ist verantwortlich für:

- die Interaktion mit dem Benutzer (Events empfangen, Ergebnisse darstellen)
- das Wrapping von Reactors und RPUs in technologiespezifische Konstrukte (z.B. React Hooks)

User (allgemeiner Clients, denn auch andere Softwaresystem können über Portale auf eine Software zugreifen) triggern Software über Portale; das kann durch Click auf einen Button geschehen oder Aufruf eines HTTP-Endpunktes.

Das Portal enthält **keine Domänenlogik** und nutzt **keine Provider direkt**. Es delegiert alles an Reactors oder — bei einfachen Aktionen — direkt an RPUs.

Größere Transformationen und Berechnungen, die für die Darstellung nötig sind, gehören **nicht** ins Portal. Sie werden stattdessen in Query-RPUs implementiert, die fertig aufbereitete Daten zurückgeben. Das Portal zeigt nur an, was es bekommt. Oder es kann kleinere, temporäre Nachschärfungen selbst erledigen. Das ist eine Frage der Abwägung in Fällen von Lesezugriffen auf Daten.

---

## Functional Core / Imperative Shell

Die Architektur setzt das Muster **Functional Core / Imperative Shell** konsequent um:

| Schicht | Kategorie | Eigenschaften |
|---|---|---|
| RPUs | Functional Core | fast pure, technologiefrei, deterministisch |
| Reactors | Functional Core | technologiefrei, orchestrierend |
| Domain State Provider | Imperative Shell | I/O, technologiespezifisch |
| External Providers | Imperative Shell | I/O, technologiespezifisch |
| Portal | Imperative Shell | UI-Technologie, Darstellung |

Der Functional Core ist der stabile Kern der Anwendung — leicht testbar, leicht austauschbar, leicht parallelisierbar. Die Imperative Shell ist der dünne Ring um diesen Kern, der die Außenwelt anbindet.

---

## Entkopplung und parallele Entwicklung

Das primäre Ziel der DAO Architecture ist **maximale Entkopplung** — und damit die Möglichkeit, Teile der Codebasis vollständig unabhängig voneinander zu entwickeln.

Das funktioniert, weil:

- Jede RPU eine eigene, abgeschlossene Einheit ist. Sie kann spezifiziert, implementiert und getestet werden, ohne andere RPUs zu kennen.
- Reactors kennen nur die Signaturen von RPUs und Providers — keine Implementierungen.
- Das Portal kennt nur die Signaturen von Reactors und RPUs.
- Keine Schicht hat zirkuläre Abhängigkeiten zu einer anderen.

Diese Eigenschaft ist besonders wertvoll, wenn **mehrere KI-Agenten arbeitsteilig** an einer Codebasis arbeiten: Jedem Agenten kann eine klar abgegrenzte Einheit zugewiesen werden — eine RPU, ein Reactor, ein Portal-Modul — und die Agenten stören sich gegenseitig nicht. Die Schnittstellen-Kontrakte (Signaturen von `process()`, Provider-Interfaces) sind die einzigen Koordinationspunkte.

---

## Implementierung

### Dateistruktur

Jedes Modul — jede RPU, jeder Reactor, jeder Provider — lebt in **mindestens einer eigenen Datei**. Ist ein Modul komplex genug, um mehrere Dateien zu rechtfertigen, bekommt es ein eigenes Verzeichnis.

In TypeScript oder anderen objektorientierten Sprachen werden alle Module als **Klassen** implementiert.

### Öffentliche Schnittstellen

Die öffentlichen Schnittstellen folgen dem Charakter des jeweiligen Moduls:

- **RPUs und Reactors**: genau eine öffentliche Methode — `process(request)` — die einen Request entgegennimmt und einen Response zurückgibt. Mehr ist nicht nötig, weil jedes Modul nur eine Capability implementiert.
- **Providers**: ressourcenspezifische Schnittstellen, passend zu dem, was der Provider anbietet (z.B. `load()` / `save()` für einen State Provider, `getEvents()` für einen Kalender-Provider).
- **Portale**: eine Schnittstelle zum Client hin — das können Buttons und Eingabefelder in einer GUI sein, HTTP-Endpunkte in einem Server, Kommandos in einer CLI, oder Terminalelemente in einer TUI.

### Verzeichnisstruktur: `body/` und `head/`

Die Module eines Prozesses werden in zwei Wurzelverzeichnisse aufgeteilt:

```
body/
  domain/
    rpus/
    providers/
  external_providers/
  reactors/

head/
  (portale verschiedener art)
```

**`body/`** enthält alles, was **nicht** von Client-Interface-Technologien abhängt: RPUs, Reactors, Domain-Provider und External Providers. Der `body/` ist der UI-technologiefreie Kern — er läuft unabhängig davon, ob der Client ein Browser, ein Terminal oder ein HTTP-Aufrufer ist.

**`head/`** enthält alle **Portale** — also alle Module, die mit einem Client kommunizieren. Je nach Prozess und Plattform können das sein: React-Komponenten, Netlify Functions, CLI-Handler, TUI-Widgets oder HTTP-Controller. Der `head/` kennt den `body/`, aber nicht umgekehrt.

### Frontend und Backend als gleichartige Prozesse

Die Unterscheidung zwischen Frontend und Backend (oder allgemeiner: von Services) ist eine Frage des **Prozesses**, nicht der Architektur. Alle Prozesse folgen derselben Struktur:

```
frontend/
  body/
    domain/
    external_providers/
    reactors/
  head/
    (z.B. React-Komponenten, Browser-Portale)

backend/
  body/
    domain/
    external_providers/
    reactors/
  head/
    (z.B. HTTP-Endpunkte, Netlify Functions)
```

Was sich unterscheidet, ist der Inhalt — nicht das Prinzip. Im Frontend-Prozess enthält das `head/` UI-Portale, im Backend-Prozess enthält es API-Endpunkte. Die `body/`-Module beider Prozesse sind vollständig voneinander unabhängig: Sie teilen kein Wissen, keinen Zustand, keine Imports.

Wie die Prozesse konkret unter `src/` oder einem anderen Wurzelverzeichnis organisiert werden, ist eine projektspezifische Entscheidung.

---

## Zusammenfassung

| Konzept | Kurzbeschreibung |
|---|---|
| **Domain As Object** | Die Domäne als biologische Zelle nach Alan Kay: kapselt Zustand, kommuniziert nur über Nachrichten |
| **RPU** | Eine Capability der Domäne. Genau eine `process(request) → response` Methode. Kennt keine anderen RPUs. |
| **Domain State Provider** | Internes Persistenz-Interface der Domäne. Außen unsichtbar, austauschbar. |
| **External Provider** | Externer Dienst mit Proxy im Frontend. Weder Teil der Domäne noch des Portals. |
| **Reactor** | Technologiefreier Workflow-Orchestrator. Kombiniert RPUs und Providers. |
| **Portal** | UI-Schicht. Wraps Reactors. Keine Domänenlogik, keine Provider. |
| **Ziel** | Maximale Entkopplung für unabhängige, parallele Entwicklung — auch durch mehrere KI-Agenten. |
