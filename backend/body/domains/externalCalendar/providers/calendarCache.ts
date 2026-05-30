// Re-Export der Event-Cache-Persistenz fuer die uebrigen Domaenen-Module.

export {
  sql,
  normalizeDateParam,
  ensureExternalCalendarSchema,
  hasFreshCacheWindow,
  upsertExternalEvent,
  deleteExternalEvent,
  rememberCacheWindow,
  readExternalEvents
} from "./externalCalendarCache";
export type {
  ExternalCalendarProvider,
  ExternalCalendarItem,
  ExternalCalendarEvent,
  CacheableExternalEvent
} from "./externalCalendarCache";
