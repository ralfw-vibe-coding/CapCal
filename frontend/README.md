# Frontend-Prozess

Der Frontend-Prozess (Browser, React) ist nach der DAO Architecture strukturiert.
Siehe `requirements/dao-architecture.md` für das vollständige Konzept.

```
frontend/
  body/                     technologiefreier Kern — kennt kein React
    domain/                 die Domäne (Domain As Object)
      rpus/                 Request Processing Units (1 Capability je RPU, je eigene Datei)
      providers/            Domain State Provider (kapselt Persistenz, z.B. Backend-API-Proxy)
    external_providers/     Proxies auf externe Dienste (Auth, GCal, iCal)
    reactors/               Workflow-Orchestratoren (kombinieren RPUs + External Providers)
  head/                     Portale — die einzige Schicht mit React/UI-Technologie
```

## Regeln

- `body/` enthält **keine** React-/UI-Abhängigkeiten.
- `head/` enthält **keine** Domänenlogik und nutzt **keine** Provider direkt.
- RPUs und Reactors haben genau eine öffentliche Methode: `process(request)`.
- RPUs kennen sich gegenseitig nicht.
- Module sind TypeScript-Klassen, je Modul mindestens eine eigene Datei
  (eigenes Verzeichnis, wenn mehrere Dateien nötig sind).
