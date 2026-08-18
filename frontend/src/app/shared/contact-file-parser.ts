export interface ImportedContact {
  name?: string;
  phone: string;
  variables?: Record<string, string>;
  sourceRow: number;
}

export interface ContactImportResult {
  contacts: ImportedContact[];
  errors: string[];
  duplicates: number;
  totalRows: number;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim()); current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split(/\r?\n/, 1)[0] || "";
  const delimiter = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ";" : ",";
  return clean.split(/\r?\n/).filter((line) => line.trim()).map((line) => parseCsvLine(line, delimiter));
}

function columnIndex(reference: string): number {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copied = data.slice().buffer as ArrayBuffer;
  const stream = new Blob([copied]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("El archivo XLSX no contiene un directorio ZIP válido.");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let count = 0; count < entries; count += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Directorio XLSX dañado.");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : new Uint8Array());
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function xmlText(bytes?: Uint8Array): string {
  return bytes ? new TextDecoder().decode(bytes) : "";
}

function parseXlsxRows(files: Map<string, Uint8Array>): string[][] {
  const parser = new DOMParser();
  const sharedXml = xmlText(files.get("xl/sharedStrings.xml"));
  const shared = sharedXml
    ? Array.from(parser.parseFromString(sharedXml, "application/xml").getElementsByTagName("si"))
        .map((node) => Array.from(node.getElementsByTagName("t")).map((part) => part.textContent || "").join(""))
    : [];
  const sheetName = [...files.keys()].find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetName) throw new Error("El XLSX no tiene hojas de cálculo.");
  const document = parser.parseFromString(xmlText(files.get(sheetName)), "application/xml");
  return Array.from(document.getElementsByTagName("row")).map((row) => {
    const cells: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const index = columnIndex(cell.getAttribute("r") || "A1");
      const type = cell.getAttribute("t");
      const inline = cell.getElementsByTagName("is")[0];
      const raw = cell.getElementsByTagName("v")[0]?.textContent || "";
      const value = type === "s" ? (shared[Number(raw)] || "")
        : type === "inlineStr" ? Array.from(inline?.getElementsByTagName("t") || []).map((node) => node.textContent || "").join("")
        : raw;
      cells[index] = value.trim();
    }
    return cells;
  });
}

function rowsToContacts(rows: string[][]): ContactImportResult {
  const errors: string[] = [];
  const contacts: ImportedContact[] = [];
  if (rows.length < 2) return { contacts, errors: ["El archivo no contiene filas de datos."], duplicates: 0, totalRows: 0 };
  const headers = rows[0].map((value) => normalizeHeader(value || ""));
  const phoneIndex = headers.findIndex((value) => ["telefono", "phone", "celular", "numero", "whatsapp"].includes(value));
  const nameIndex = headers.findIndex((value) => ["nombre", "name", "contacto"].includes(value));
  if (phoneIndex < 0) return { contacts, errors: ["Falta una columna llamada telefono, celular o phone."], duplicates: 0, totalRows: rows.length - 1 };
  rows.slice(1).forEach((row, position) => {
    const sourceRow = position + 2;
    const phone = String(row[phoneIndex] || "").trim();
    if (!phone) { errors.push(`Fila ${sourceRow}: teléfono vacío.`); return; }
    const key = phone.replace(/\D/g, "");
    if (!key) { errors.push(`Fila ${sourceRow}: teléfono inválido.`); return; }
    const variables: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header || index === phoneIndex || index === nameIndex) return;
      const value = String(row[index] || "").trim();
      if (value) variables[header] = value;
    });
    const name = nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "";
    contacts.push({ phone, name: name || undefined, variables: Object.keys(variables).length ? variables : undefined, sourceRow });
  });
  return { contacts, errors, duplicates: 0, totalRows: rows.length - 1 };
}

export async function parseContactFile(file: File): Promise<ContactImportResult> {
  const lower = file.name.toLowerCase();
  const rows = lower.endsWith(".xlsx")
    ? parseXlsxRows(await unzip(await file.arrayBuffer()))
    : parseCsv(await file.text());
  return rowsToContacts(rows);
}

export function downloadContactTemplate(): void {
  const content = "telefono,nombre,saldo,ciudad\r\n59170000001,Ana,150,Santa Cruz\r\n59170000002,Luis,220,La Paz\r\n";
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "plantilla-contactos-whatsapp.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
