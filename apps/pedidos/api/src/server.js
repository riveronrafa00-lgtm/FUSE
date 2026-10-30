// API + panel web de pedidos pendientes.
//   npm start     -> conecta a SQL Server (cmch-dc1) según el .env
//   npm run demo  -> datos de demostración, sin SQL Server
import express from "express";
import compression from "compression";
import { createHash, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as sqlQueries from "./queries.js";
import { leerFiltros, TRAMOS } from "./queries.js";
import { describe } from "./db.js";

const env = process.env;
const DEMO = env.DEMO === "1" || process.argv.includes("--demo");
const db = DEMO ? await import("./mock.js") : sqlQueries;
const PORT = Number(env.PORT || 8080);
const TTL = Number(env.CACHE_TTL || 15) * 1000;

// ---- Códigos de acceso: "Nombre:codigo;Nombre2:codigo2" ----
const TOKENS = (env.APP_TOKENS || "")
  .split(";").map((s) => s.trim()).filter(Boolean)
  .map((s) => { const i = s.indexOf(":"); return { nombre: s.slice(0, i), token: Buffer.from(s.slice(i + 1)) }; })
  .filter((t) => t.nombre && t.token.length);

function usuario(req) {
  if (!TOKENS.length) return "sin-control";
  const h = req.get("authorization") || "";
  const dado = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  return TOKENS.find((t) => t.token.length === dado.length && timingSafeEqual(t.token, dado))?.nombre || null;
}

// ---- Caché corta + unión de peticiones idénticas simultáneas ----
// Así 50 teléfonos refrescando cada 30 s no se convierten en 50 consultas a Exact.
const cache = new Map();
async function cacheado(clave, fn) {
  const hit = cache.get(clave);
  if (hit && (hit.promesa || Date.now() - hit.t < TTL)) return hit.promesa || hit;
  const promesa = fn().then((datos) => {
    const body = JSON.stringify(datos);
    // El ETag depende solo de los datos: si nada cambió, el teléfono recibe un 304 vacío.
    const e = { t: Date.now(), generado: new Date().toISOString(), body, etag: `"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"` };
    cache.set(clave, e);
    return e;
  }, (err) => { cache.delete(clave); throw err; });
  cache.set(clave, { promesa });
  return promesa;
}
setInterval(() => { const lim = Date.now() - TTL * 4; for (const [k, v] of cache) if (v.t && v.t < lim) cache.delete(k); }, 60_000).unref();

const app = express();
app.disable("x-powered-by");
app.set("etag", false);
app.use(compression());

// CORS solo para la app Android empaquetada (Capacitor); el panel web es del mismo origen.
const ORIGENES = new Set((env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean));
app.use("/api", (req, res, next) => {
  const o = req.get("origin");
  if (o && ORIGENES.has(o)) {
    res.set({ "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "Authorization, If-None-Match", "Access-Control-Expose-Headers": "ETag, X-Generado", Vary: "Origin" });
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

app.get("/api/salud", (req, res) => res.json({ ok: true, modo: DEMO ? "demo" : "sql" }));

app.use("/api", (req, res, next) => {
  const u = usuario(req);
  if (!u) return res.status(401).json({ error: "Código de acceso no válido" });
  res.locals.usuario = u;
  next();
});

const t0 = (req, res, next) => { const t = performance.now(); res.on("finish", () => console.log(`${new Date().toISOString()} ${res.locals.usuario || "-"} ${req.method} ${req.originalUrl} ${res.statusCode} ${(performance.now() - t).toFixed(0)}ms`)); next(); };
app.use("/api", t0);

function responder(fn) {
  return async (req, res) => {
    try {
      const e = await cacheado(req.originalUrl, () => fn(req));
      res.set({ "Cache-Control": "private, no-cache", ETag: e.etag, "X-Generado": e.generado, "Content-Type": "application/json; charset=utf-8" });
      if (req.get("if-none-match") === e.etag) return res.status(304).end();
      res.send(e.body);
    } catch (err) {
      if (err.status === 404) return res.status(404).json({ error: err.message });
      if (err.status === 400) return res.status(400).json({ error: err.message });
      console.error(err);
      res.status(503).json({ error: "No se pudo consultar la base de datos", detalle: err.message });
    }
  };
}

app.get("/api/sesion", async (req, res) => {
  try {
    res.json({ usuario: res.locals.usuario, modo: DEMO ? "demo" : "sql", origen: DEMO ? "demostración" : describe(), ttl: TTL / 1000, tramos: TRAMOS, ...(await db.ping()) });
  } catch (err) {
    res.status(503).json({ error: "Sin conexión con SQL Server", detalle: err.message });
  }
});
app.get("/api/resumen", responder((req) => db.resumen(leerFiltros(req.query))));
app.get("/api/pedidos", responder((req) => db.pedidos(leerFiltros(req.query))));
app.get("/api/pedidos/:id", responder(async (req) => {
  const p = await db.pedido(String(req.params.id).slice(0, 20));
  if (!p) throw Object.assign(new Error("Pedido no encontrado (puede que ya se haya cerrado)"), { status: 404 });
  return p;
}));
app.get("/api/clientes", responder((req) => db.clientes(leerFiltros(req.query))));
app.get("/api/skus", responder((req) => db.skus(leerFiltros(req.query))));
app.get("/api/kardex", responder((req) => db.kardex(req.query)));
app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// ---- Panel web (PWA) ----
const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(pub, {
  setHeaders(res, file) {
    const nombre = path.basename(file);
    if (nombre === "sw.js" || nombre.endsWith(".html") || nombre.endsWith(".webmanifest")) res.set("Cache-Control", "no-cache");
    else res.set("Cache-Control", "public, max-age=604800");
  },
}));

app.listen(PORT, () => {
  console.log(`Pedidos · ${DEMO ? "MODO DEMO (datos ficticios)" : "SQL " + describe()} · http://localhost:${PORT}`);
  if (!TOKENS.length) console.warn("⚠ APP_TOKENS vacío: cualquiera en la red puede consultar. Configúralo en el .env.");
});
