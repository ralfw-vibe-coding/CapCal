// Gemeinsamer Helfer fuer External Provider: extrahiert eine sinnvolle
// Fehlermeldung aus einer fehlgeschlagenen HTTP-Antwort.

export async function apiErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : text;
  } catch {
    return text;
  }
}
