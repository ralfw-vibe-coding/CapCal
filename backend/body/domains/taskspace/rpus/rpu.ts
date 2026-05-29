// Gemeinsamer Vertrag aller Request Processing Units des Backends.
//
// Eine RPU implementiert genau eine Capability der (Persistenz-)Domaene und
// exponiert nach aussen ausschliesslich process(): Request rein, Response raus.
// RPUs kennen sich untereinander nicht. Asynchrone RPUs setzen Response auf
// Promise<...>.

export interface Rpu<Request, Response> {
  process(request: Request): Response;
}
