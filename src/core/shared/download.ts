/**
 * Reusable data-download utilities (CSV, TSV, JSON).
 */

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSVValue(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toDelimited(data: Record<string, unknown>[], delimiter: string): string {
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const escape = delimiter === ',' ? escapeCSVValue : (v: unknown) => (v == null ? '' : String(v));
  const header = keys.map(escape).join(delimiter);
  const rows = data.map(row => keys.map(k => escape(row[k])).join(delimiter));
  return [header, ...rows].join('\n');
}

export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
  triggerDownload(toDelimited(data, ','), filename, 'text/csv;charset=utf-8');
}

export function downloadTSV(data: Record<string, unknown>[], filename: string): void {
  triggerDownload(toDelimited(data, '\t'), filename, 'text/tab-separated-values;charset=utf-8');
}

export function downloadJSON(data: Record<string, unknown>[], filename: string): void {
  triggerDownload(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8');
}
