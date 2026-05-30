// Domain State Provider des Backends (Persistenz).
//
// Buendelt die Storage-Implementierung (filesystem/postgres) als oeffentliche
// Schnittstelle der Persistenz-Domaene.

export { createStateProvider } from "./storageIndex";
export type { AppState, StateProvider } from "./types";
