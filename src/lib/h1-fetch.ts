// Node's fetch runs same-origin calls one at a time over one HTTP/2 connection; use an HTTP/1.1 pool there, plain fetch elsewhere.
type AgentCtor = new (opts: { allowH2: boolean }) => object;

let pool: object | undefined;

export const h1Fetch: typeof fetch = (input, init) => {
  if (!pool) {
    const Agent = (globalThis as unknown as Record<symbol, { constructor?: AgentCtor } | undefined>)[Symbol.for("undici.globalDispatcher.2")]?.constructor;
    if (Agent?.name === "Agent") pool = new Agent({ allowH2: false });
  }
  return fetch(input, pool ? ({ ...init, dispatcher: pool } as RequestInit) : init);
};
