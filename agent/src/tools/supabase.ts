// Cliente Supabase mínimo via REST (PostgREST). Sem SDK: são 4 verbos e o
// worker precisa rodar em serverless com cold start curto.
// Usa a SERVICE ROLE key — server-only, nunca vai para o navegador.

export interface SupabaseClient {
  select<T = any>(table: string, query?: string): Promise<T[]>;
  count(table: string, query?: string): Promise<number>;
  insert<T = any>(table: string, rows: unknown[], opts?: { returning?: boolean }): Promise<T[]>;
  upsert<T = any>(table: string, rows: unknown[], onConflict: string): Promise<T[]>;
  update<T = any>(table: string, query: string, patch: unknown): Promise<T[]>;
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export interface SupabaseOptions {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}

export function createSupabase(opts: SupabaseOptions): SupabaseClient {
  const base = opts.url.replace(/\/+$/, "") + "/rest/v1";
  const doFetch = opts.fetchImpl || fetch;
  const auth = {
    apikey: opts.serviceKey,
    Authorization: "Bearer " + opts.serviceKey,
    "Content-Type": "application/json",
  };

  async function call(path: string, init: RequestInit & { headers?: Record<string, string> }) {
    const res = await doFetch(base + path, {
      ...init,
      headers: { ...auth, ...(init.headers || {}) },
    });
    if (!res.ok) {
      throw new Error(`Supabase ${res.status} em ${path}: ${(await res.text()).slice(0, 300)}`);
    }
    return res;
  }

  return {
    async select(table, query = "select=*") {
      const res = await call(`/${table}?${query}`, { method: "GET" });
      return res.json() as any;
    },
    async count(table, query = "select=id") {
      const res = await call(`/${table}?${query}`, {
        method: "GET",
        headers: { Prefer: "count=exact", Range: "0-0" },
      });
      const cr = res.headers.get("content-range") || "";
      const total = cr.includes("/") ? parseInt(cr.split("/")[1], 10) : NaN;
      return Number.isFinite(total) ? total : 0;
    },
    async insert(table, rows, o = {}) {
      if (!rows.length) return [];
      const res = await call(`/${table}`, {
        method: "POST",
        headers: { Prefer: o.returning === false ? "return=minimal" : "return=representation" },
        body: JSON.stringify(rows),
      });
      return o.returning === false ? ([] as any) : ((await res.json()) as any);
    },
    async upsert(table, rows, onConflict) {
      if (!rows.length) return [];
      const res = await call(`/${table}?on_conflict=${onConflict}`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(rows),
      });
      return (await res.json()) as any;
    },
    async update(table, query, patch) {
      const res = await call(`/${table}?${query}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      return (await res.json()) as any;
    },
    async rpc(fn, args = {}) {
      const res = await doFetch(opts.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Supabase rpc ${fn} ${res.status}`);
      return (await res.json()) as any;
    },
  };
}

/** Log unificado — mesma tabela `events` que o resto do agente já usa. */
export async function logEvent(
  db: SupabaseClient,
  ev: {
    kind: string;
    channel?: string;
    level?: "info" | "warn" | "error";
    message?: string;
    payload?: unknown;
    company_id?: string;
    contact_id?: string;
    dry_run?: boolean;
  },
): Promise<void> {
  try {
    await db.insert("events", [{ level: "info", ...ev }], { returning: false });
  } catch {
    // Log nunca derruba o agente.
  }
}
