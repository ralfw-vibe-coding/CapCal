// Erzeugung lokaler, kollisionsarmer Identitaeten fuer Domaenenobjekte.

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
