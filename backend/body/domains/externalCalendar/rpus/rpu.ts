// RPU-Vertrag der External-Calendar-Domaene.

export interface Rpu<Request, Response> {
  process(request: Request): Response;
}
