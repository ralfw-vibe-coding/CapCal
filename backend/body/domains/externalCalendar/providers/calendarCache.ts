// Seam auf die bestehende Event-Cache-Implementierung unter src/server.
// Isoliert den Cross-Tree-Import; physischer Umzug in 9e.

export {
  sql,
  normalizeDateParam,
  ensureExternalCalendarSchema,
  hasFreshCacheWindow,
  upsertExternalEvent,
  deleteExternalEvent,
  rememberCacheWindow,
  readExternalEvents
} from "../../../../../src/server/externalCalendarCache";
export type {
  ExternalCalendarProvider,
  ExternalCalendarItem,
  ExternalCalendarEvent,
  CacheableExternalEvent
} from "../../../../../src/server/externalCalendarCache";
