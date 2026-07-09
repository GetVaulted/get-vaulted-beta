export type CsvCell = string | number | boolean | null | undefined;

export type CsvExportPayload = {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
};

/** Escape a single CSV field per RFC 4180. */
export function escapeCsvCell(value: CsvCell): string {
  if (value == null) return "";
  const raw = String(value);
  if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function rowsToCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function buildCsvExport(payload: CsvExportPayload): string {
  return rowsToCsv(payload.headers, payload.rows);
}

export function csvDownloadFilename(base: string, generatedAt = new Date()): string {
  const stamp = generatedAt.toISOString().slice(0, 10);
  const safe = base.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `getvaulted-${safe}-${stamp}.csv`;
}

export function csvResponse(payload: CsvExportPayload, generatedAt = new Date()): Response {
  const body = buildCsvExport(payload);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvDownloadFilename(payload.filename, generatedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Key-value summary section (metric, value). */
export function summaryRows(entries: Record<string, CsvCell>): CsvCell[][] {
  return Object.entries(entries).map(([key, value]) => [key, value]);
}
