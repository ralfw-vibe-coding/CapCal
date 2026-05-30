// Reine Formatierungs- und Parsing-Helfer. Keine UI-Technologie.

export function plainTextFromHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function minutesToTimeLabel(minutes: number) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function parseDurationInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const timeMatch = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (timeMatch) return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const minutesMatch = trimmed.match(/^(\d+)$/);
  if (minutesMatch) return Number(minutesMatch[1]);
  const hourMinuteMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2})\s*m?)?$/i);
  if (hourMinuteMatch) {
    return Math.round(Number(hourMinuteMatch[1].replace(",", ".")) * 60) + Number(hourMinuteMatch[2] ?? 0);
  }
  return undefined;
}

export function minutesToLabel(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function estimateToLabel(minutes?: number) {
  if (!minutes) return "?";
  const dayMinutes = 8 * 60;
  const weekMinutes = 5 * dayMinutes;
  if (minutes >= weekMinutes * 2 && minutes % weekMinutes === 0) return `${minutes / weekMinutes}w`;
  if (minutes >= dayMinutes * 2 && minutes % dayMinutes === 0) return `${minutes / dayMinutes}d`;
  return minutesToTimeLabel(minutes);
}

export function maskVisibleApiKey(apiKey: string) {
  return `••••••••••••••••${apiKey.slice(-5)}`;
}

export function safeMarkdownHref(href: string) {
  const trimmed = href.trim();
  const normalized = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
  try {
    const url = new URL(normalized);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? normalized : undefined;
  } catch {
    return undefined;
  }
}
