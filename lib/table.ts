/** Turns an Elasticsearch response into rows a person can scan, when it has a shape that allows it. */
export interface Table {
  title: string;
  columns: string[];
  rows: string[][];
  more?: number;
}

const ROWS = 100;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function flatten(source: any, prefix = "", out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(source || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function hitsTable(hits: any[], total: any): Table | null {
  if (!hits.length) return null;
  const flat = hits.slice(0, ROWS).map(h => ({ _id: h._id, ...flatten(h._source || h.fields || {}) }));
  const columns: string[] = [];
  for (const row of flat) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
  const count = typeof total?.value === "number" ? total.value : hits.length;
  return {
    title: `${count} ${count === 1 ? "hit" : "hits"}`,
    columns,
    rows: flat.map(r => columns.map(c => cell((r as any)[c]))),
    more: count > flat.length ? count - flat.length : undefined,
  };
}

function bucketTables(name: string, agg: any, out: Table[]) {
  const buckets = Array.isArray(agg?.buckets) ? agg.buckets : agg?.buckets && typeof agg.buckets === "object"
    ? Object.entries(agg.buckets).map(([key, b]: [string, any]) => ({ key, ...b }))
    : null;
  if (!buckets) return;
  const subs = new Set<string>();
  for (const b of buckets) for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && "value" in (v as any)) subs.add(k);
  }
  const columns = [name, "count", ...subs];
  out.push({
    title: name,
    columns,
    rows: buckets.slice(0, ROWS).map((b: any) => [
      cell(b.key_as_string ?? b.key), cell(b.doc_count), ...[...subs].map(s => cell(b[s]?.value_as_string ?? b[s]?.value)),
    ]),
    more: buckets.length > ROWS ? buckets.length - ROWS : undefined,
  });
}

export function tablesFrom(result: any): Table[] {
  if (!result || typeof result !== "object") return [];
  const out: Table[] = [];
  if (result.aggregations) {
    const metrics: string[][] = [];
    for (const [name, agg] of Object.entries<any>(result.aggregations)) {
      if (agg && "value" in agg) metrics.push([name, cell(agg.value_as_string ?? agg.value)]);
      else bucketTables(name, agg, out);
    }
    if (metrics.length) out.unshift({ title: "values", columns: ["name", "value"], rows: metrics });
  }
  const hits = result.hits?.hits;
  if (Array.isArray(hits)) {
    const t = hitsTable(hits, result.hits.total);
    if (t) out.push(t);
  }
  // _cat style answers come back as a plain array of objects
  if (Array.isArray(result) && result.length && typeof result[0] === "object") {
    const columns = Object.keys(result[0]);
    out.push({ title: `${result.length} rows`, columns, rows: result.slice(0, ROWS).map((r: any) => columns.map(c => cell(r[c]))) });
  }
  return out;
}
