// Gemeinsamer Vertrag der RPUs der Identity-Domaene: genau eine process()-
// Methode, Request rein, Response raus. RPUs kennen sich untereinander nicht.

export interface Rpu<Request, Response> {
  process(request: Request): Response;
}
