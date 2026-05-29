# Backend-Prozess

Der Backend-Prozess (Node-Server lokal, Netlify Functions in Produktion) ist nach
der DAO Architecture strukturiert. Siehe `requirements/dao-architecture.md`.

```
backend/
  body/                     technologiefreier Kern — kennt keine HTTP-/Server-Technologie
    domain/                 die Domäne (Domain As Object)
      rpus/                 Request Processing Units (1 Capability je RPU, je eigene Datei)
      providers/            Domain State Provider (filesystem, postgres, in-memory)
    external_providers/     Anbindung externer Dienste (Auth, GCal, iCal)
    reactors/               Workflow-Orchestratoren (kombinieren RPUs + External Providers)
  head/                     Portale — HTTP-Endpunkte (lokaler Server / Netlify Functions)
```

## Regeln

- `body/` enthält **keine** HTTP-/Server-Framework-Abhängigkeiten.
- `head/` enthält **keine** Domänenlogik und nutzt **keine** Provider direkt.
- RPUs und Reactors haben genau eine öffentliche Methode: `process(request)`.
- RPUs kennen sich gegenseitig nicht.
- Module sind TypeScript-Klassen, je Modul mindestens eine eigene Datei
  (eigenes Verzeichnis, wenn mehrere Dateien nötig sind).

## Hinweis

Frontend- und Backend-`body/` sind vollständig getrennt: kein gemeinsamer Zustand,
keine geteilten Imports. Sie laufen in unterschiedlichen Prozessen.
