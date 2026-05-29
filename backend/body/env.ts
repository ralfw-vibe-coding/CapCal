// Backend-weite Konfigurationszugriffe.
//
// Seam auf die bestehende env-Implementierung unter src/server/storage. Wird
// im Aufraeum-Schritt physisch hierher gezogen (siehe
// requirements/refactoring-cleanup.md).

export { getEnv } from "../../src/server/storage/env";
