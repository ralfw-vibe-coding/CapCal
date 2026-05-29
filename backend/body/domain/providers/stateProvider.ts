// Domain State Provider des Backends (Persistenz).
//
// Seam auf die bestehende Storage-Implementierung (filesystem/postgres). Die
// physische Datei liegt aktuell noch unter src/server/storage; dieser Re-Export
// isoliert den Cross-Tree-Import an einer Stelle. Der Umzug nach
// backend/body/domain/providers erfolgt im Aufraeum-Schritt (siehe
// requirements/refactoring-cleanup.md), wenn auch Auth/Kalender umgezogen sind.

export { createStateProvider } from "../../../../src/server/storage";
export type { AppState, StateProvider } from "../../../../src/server/storage/types";
