// Gemeinsamer Vertrag aller Request Processing Units.
//
// Eine RPU implementiert genau eine Capability der Domaene und exponiert nach
// aussen ausschliesslich process(): ein Request rein, ein Response raus.
// RPUs kennen sich untereinander nicht. Asynchrone RPUs setzen Response auf
// Promise<...>.

export interface Rpu<Request, Response> {
  process(request: Request): Response;
}
