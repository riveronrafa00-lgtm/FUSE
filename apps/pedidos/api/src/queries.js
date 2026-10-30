// Consultas a las vistas de PedidosApp. Todos los filtros viajan como parámetros
// (nunca se concatenan valores en el SQL) y solo se añaden al WHERE los que vienen
// informados, así SQL Server arma el mejor plan para cada combinación.
import { request, sql } from "./db.js";

// Lecturas sin bloquear a Exact: el panel tolera ver una transacción a medio grabar.
const PRE = "SET NOCOUNT ON; SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n";

export const TRAMOS = [
  { tramo: 1, etiqueta: "0–7 días", min: 0, max: 7 },
  { tramo: 2, etiqueta: "8–15 días", min: 8, max: 15 },
  { tramo: 3, etiqueta: "16–30 días", min: 16, max: 30 },
  { tramo: 4, etiqueta: "31–60 días", min: 31, max: 60 },
  { tramo: 5, etiqueta: "+60 días", min: 61, max: null },
];
export const CATEGORIAS = ["CERVEZA", "MALTA", "PROMOCIONAL", "OTRO"];
export const ESTADOS = ["PENDIENTE", "PARCIAL", "ENTREGADO", "FACTURADO", "COBRADO"];

const text = (v, max = 60) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);
const fecha = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const entero = (v, def, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

/** Normaliza los filtros que llegan por querystring. */
export function leerFiltros(q) {
  const categoria = text(q.categoria, 12)?.toUpperCase();
  const estado = text(q.estado, 12)?.toUpperCase();
  return {
    cliente: text(q.cliente, 20), // orkrg.debnr crudo (con espacios), tal como lo devuelve la API
    sku: text(q.sku, 30),
    // HL = cerveza + malta · OTROS = promocionales + otros
    categoria: categoria === "HL" || categoria === "OTROS" || CATEGORIAS.includes(categoria) ? categoria : null,
    tramo: entero(q.tramo, null, 1, 5),
    estado: ESTADOS.includes(estado) ? estado : null,
    q: text(q.q, 60),
    desde: fecha(q.desde),
    hasta: fecha(q.hasta),
    orden: text(q.orden, 20),
    limit: entero(q.limit, 50, 1, 500),
    offset: entero(q.offset, 0, 0, 1_000_000),
  };
}

/** Condiciones comunes. alias = "l" (líneas) o "p" (pedidos). */
function where(f, r, alias) {
  const w = [];
  const a = alias;
  if (f.cliente) { r.input("cliente", sql.VarChar(20), f.cliente); w.push(`${a}.debnr = @cliente`); }
  if (f.desde) { r.input("desde", sql.Date, f.desde); w.push(`${a}.fecha_pedido >= @desde`); }
  if (f.hasta) { r.input("hasta", sql.Date, f.hasta); w.push(`${a}.fecha_pedido <= @hasta`); }
  if (f.tramo) {
    const t = TRAMOS[f.tramo - 1];
    // Rango de fechas (aprovecha índices) en lugar de filtrar por la columna calculada "dias".
    r.input("t_min", sql.Int, t.min);
    w.push(`${a}.fecha_pedido <= DATEADD(day, -@t_min, CONVERT(date, GETDATE()))`);
    if (t.max != null) {
      r.input("t_max", sql.Int, t.max);
      w.push(`${a}.fecha_pedido >= DATEADD(day, -@t_max, CONVERT(date, GETDATE()))`);
    }
  }
  const cat = (col) =>
    f.categoria === "HL" ? `${col} IN ('CERVEZA','MALTA')`
      : f.categoria === "OTROS" ? `${col} IN ('PROMOCIONAL','OTRO')` : `${col} = @categoria`;
  if (f.categoria && f.categoria !== "HL" && f.categoria !== "OTROS") r.input("categoria", sql.VarChar(12), f.categoria);
  if (f.q) r.input("q", sql.VarChar(62), `%${f.q.replace(/[[\]%_]/g, "[$&]")}%`);
  if (f.sku) r.input("sku", sql.VarChar(30), f.sku);

  if (alias === "l") {
    w.push("l.cant_pendiente > 0");
    if (f.sku) w.push("l.artcode = @sku");
    if (f.categoria) w.push(cat("l.categoria"));
    if (f.q) w.push("(l.pedido LIKE @q OR l.cliente LIKE @q OR l.cliente_cod LIKE @q OR l.artcode LIKE @q OR l.sku_desc LIKE @q)");
  } else {
    // Por defecto solo cartera pendiente; los estados finales se piden explícitamente.
    if (!f.estado || f.estado === "PENDIENTE" || f.estado === "PARCIAL") w.push("p.cant_pendiente > 0");
    if (f.estado) { r.input("estado", sql.VarChar(12), f.estado); w.push("p.estado = @estado"); }
    const linea = [];
    if (f.sku) linea.push("x.artcode = @sku");
    if (f.categoria) linea.push(cat("x.categoria"));
    if (linea.length)
      w.push(`EXISTS (SELECT 1 FROM app.v_linea x WHERE x.ordernr = p.ordernr AND x.cant_pendiente > 0 AND ${linea.join(" AND ")})`);
    if (f.q) w.push("(p.pedido LIKE @q OR p.cliente LIKE @q OR p.cliente_cod LIKE @q OR p.referencia LIKE @q)");
  }
  return w.length ? "WHERE " + w.join("\n  AND ") : "";
}

/* ------------------------------------------------------------------ */

export async function resumen(f) {
  const r = await request();
  const w = where(f, r, "l");
  const res = await r.query(`${PRE}
SELECT l.ordernr, l.debnr, l.cliente_cod, l.cliente, l.artcode, l.sku_desc, l.categoria,
       l.es_hl, l.sin_factor, l.cant_pendiente, l.hl_pendiente, l.dias, l.tramo, l.fecha_entrega
INTO #l
FROM app.v_linea l
${w};

DECLARE @hoy date = CONVERT(date, GETDATE());

SELECT COUNT(DISTINCT ordernr)                                         AS pedidos,
       COUNT(DISTINCT debnr)                                           AS clientes,
       COUNT(DISTINCT artcode)                                         AS skus,
       ISNULL(SUM(hl_pendiente), 0)                                    AS hl,
       ISNULL(SUM(CASE WHEN categoria = 'CERVEZA' THEN hl_pendiente END), 0) AS hl_cerveza,
       ISNULL(SUM(CASE WHEN categoria = 'MALTA'   THEN hl_pendiente END), 0) AS hl_malta,
       ISNULL(SUM(CASE WHEN es_hl = 0 THEN cant_pendiente END), 0)     AS und,
       ISNULL(SUM(cant_pendiente), 0)                                  AS cant,
       COUNT(DISTINCT CASE WHEN sin_factor = 1 THEN artcode END)       AS skus_sin_factor,
       COUNT(DISTINCT CASE WHEN fecha_entrega < @hoy THEN ordernr END) AS pedidos_atrasados,
       ISNULL(MAX(dias), 0)                                            AS dias_max,
       ISNULL(SUM(hl_pendiente * dias) / NULLIF(SUM(hl_pendiente), 0), 0) AS dias_prom_hl
FROM #l;

SELECT tramo, COUNT(DISTINCT ordernr) AS pedidos,
       ISNULL(SUM(hl_pendiente), 0) AS hl,
       ISNULL(SUM(CASE WHEN es_hl = 0 THEN cant_pendiente END), 0) AS und,
       ISNULL(SUM(cant_pendiente), 0) AS cant
FROM #l GROUP BY tramo ORDER BY tramo;

SELECT TOP (8) debnr AS id, MAX(cliente_cod) AS cod, MAX(cliente) AS nombre,
       COUNT(DISTINCT ordernr) AS pedidos, ISNULL(SUM(hl_pendiente), 0) AS hl,
       ISNULL(SUM(CASE WHEN es_hl = 0 THEN cant_pendiente END), 0) AS und,
       SUM(cant_pendiente) AS cant, MAX(dias) AS dias_max
FROM #l GROUP BY debnr
ORDER BY hl DESC, cant DESC;

SELECT TOP (8) artcode AS id, MAX(sku_desc) AS nombre, MAX(categoria) AS categoria, MAX(es_hl) AS es_hl,
       SUM(cant_pendiente) AS cant, ISNULL(SUM(hl_pendiente), 0) AS hl, COUNT(DISTINCT ordernr) AS pedidos
FROM #l GROUP BY artcode
ORDER BY hl DESC, cant DESC;

SELECT CASE WHEN p.cant_entregada = 0 THEN 'PENDIENTE' ELSE 'PARCIAL' END AS estado,
       COUNT(*) AS pedidos, SUM(p.hl_pendiente) AS hl, SUM(p.und_pendientes) AS und, SUM(p.cant_pendiente) AS cant
FROM app.v_pedido p
WHERE p.ordernr IN (SELECT ordernr FROM #l)
GROUP BY CASE WHEN p.cant_entregada = 0 THEN 'PENDIENTE' ELSE 'PARCIAL' END;

DROP TABLE #l;`);
  const [k, tramos, clientes, skus, estados] = res.recordsets;
  return {
    kpi: k[0],
    tramos: TRAMOS.map((t) => ({ ...t, ...(tramos.find((x) => x.tramo === t.tramo) || { pedidos: 0, hl: 0, und: 0 }) })),
    clientes,
    skus,
    estados,
  };
}

const ORDEN_PEDIDOS = {
  antiguedad: "p.fecha_pedido ASC, p.pedido",
  recientes: "p.fecha_pedido DESC, p.pedido DESC",
  hl: "p.hl_pendiente DESC, p.und_pendientes DESC",
  cant: "p.cant_pendiente DESC",
  cliente: "p.cliente, p.fecha_pedido",
  atraso: "p.dias_atraso DESC, p.fecha_pedido",
};

export async function pedidos(f) {
  const r = await request();
  const w = where(f, r, "p");
  r.input("off", sql.Int, f.offset);
  r.input("lim", sql.Int, f.limit);
  const res = await r.query(`${PRE}
SELECT p.ordernr AS id, p.pedido, p.fecha_pedido, p.fecha_entrega, p.debnr AS cliente_id, p.cliente_cod, p.cliente,
       p.referencia, p.dias, p.tramo, p.dias_atraso, p.estado, p.facturas,
       p.lineas, p.lineas_pendientes, p.lineas_sin_factor,
       p.hl_pedido, p.hl_entregado, p.hl_pendiente, p.und_pedidas, p.und_entregadas, p.und_pendientes,
       p.cant_pedida, p.cant_entregada, p.cant_pendiente,
       COUNT(*) OVER () AS total
FROM app.v_pedido_estado p
${w}
ORDER BY ${ORDEN_PEDIDOS[f.orden] || ORDEN_PEDIDOS.antiguedad}
OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY;`);
  const filas = res.recordset;
  return { total: filas[0]?.total ?? 0, offset: f.offset, filas: filas.map(({ total, ...x }) => x) };
}

export async function pedido(id) {
  const r = await request();
  r.input("id", sql.VarChar(20), id);
  const res = await r.query(`${PRE}
SELECT p.ordernr AS id, p.pedido, p.fecha_pedido, p.fecha_entrega, p.debnr AS cliente_id, p.cliente_cod, p.cliente,
       p.referencia, p.dias, p.tramo, p.dias_atraso, p.estado, p.facturas, p.saldo_facturas,
       p.lineas, p.lineas_pendientes, p.hl_pedido, p.hl_entregado, p.hl_pendiente,
       p.und_pedidas, p.und_entregadas, p.und_pendientes, p.cant_pedida, p.cant_entregada, p.cant_pendiente
FROM app.v_pedido_estado p WHERE p.ordernr = @id;

SELECT l.linea, l.artcode, l.sku_desc, l.categoria, l.litros_unidad, l.es_hl, l.sin_factor, l.almacen, l.fecha_entrega,
       l.cant_pedida, l.cant_entregada, l.cant_pendiente, l.hl_pedido, l.hl_entregado, l.hl_pendiente
FROM app.v_linea l WHERE l.ordernr = @id ORDER BY l.linea;

SELECT f.factura, f.fecha, f.importe, f.saldo, f.cobrada
FROM app.v_pedido_factura f WHERE f.ordernr = @id ORDER BY f.fecha;

SELECT TOP (200) m.fecha, m.tipo, m.factura, m.asiento, m.artcode, m.almacen, m.cantidad, m.importe, m.moneda, m.descripcion
FROM app.v_pedido_mov m WHERE m.ordernr = @id ORDER BY m.fecha, m.id;`);
  const [cab, lineas, facturas, movimientos] = res.recordsets;
  if (!cab.length) return null;
  return { ...cab[0], lineas, facturas, movimientos };
}

const ORDEN_GRUPO = {
  hl: "hl DESC, und DESC",
  cant: "cant DESC",
  antiguedad: "dias_max DESC",
  pedidos: "pedidos DESC",
  nombre: "nombre",
};

export async function clientes(f) {
  const r = await request();
  const w = where(f, r, "l");
  r.input("lim", sql.Int, f.limit);
  const res = await r.query(`${PRE}
SELECT TOP (@lim) l.debnr AS id, MAX(l.cliente_cod) AS cod, MAX(l.cliente) AS nombre,
       COUNT(DISTINCT l.ordernr) AS pedidos, ISNULL(SUM(l.hl_pendiente), 0) AS hl,
       ISNULL(SUM(CASE WHEN l.es_hl = 0 THEN l.cant_pendiente END), 0) AS und,
       SUM(l.cant_pendiente) AS cant,
       MAX(l.dias) AS dias_max, MIN(l.fecha_pedido) AS pedido_mas_antiguo,
       COUNT(DISTINCT CASE WHEN l.fecha_entrega < CONVERT(date, GETDATE()) THEN l.ordernr END) AS atrasados
FROM app.v_linea l
${w}
GROUP BY l.debnr
ORDER BY ${ORDEN_GRUPO[f.orden] || ORDEN_GRUPO.hl};`);
  return { filas: res.recordset };
}

export async function skus(f) {
  const r = await request();
  const w = where(f, r, "l");
  r.input("lim", sql.Int, f.limit);
  const res = await r.query(`${PRE}
SELECT TOP (@lim) l.artcode AS id, MAX(l.sku_desc) AS nombre, MAX(l.categoria) AS categoria,
       MAX(l.litros_unidad) AS litros_unidad, MAX(l.es_hl) AS es_hl, MAX(l.sin_factor) AS sin_factor,
       SUM(l.cant_pendiente) AS cant, ISNULL(SUM(l.hl_pendiente), 0) AS hl,
       ISNULL(SUM(CASE WHEN l.es_hl = 0 THEN l.cant_pendiente END), 0) AS und,
       COUNT(DISTINCT l.ordernr) AS pedidos, COUNT(DISTINCT l.debnr) AS clientes, MAX(l.dias) AS dias_max
FROM app.v_linea l
${w}
GROUP BY l.artcode
ORDER BY ${ORDEN_GRUPO[f.orden] || ORDEN_GRUPO.hl};`);
  return { filas: res.recordset };
}

/** Kardex: la consulta original, parametrizada (app.fn_kardex). */
export async function kardex(q) {
  const req = (k) => {
    const v = text(q[k], 30);
    if (!v) throw Object.assign(new Error(`Falta el parámetro "${k}"`), { status: 400 });
    return v;
  };
  const desde = fecha(q.desde), hasta = fecha(q.hasta);
  if (!desde || !hasta) throw Object.assign(new Error("desde/hasta deben tener formato AAAA-MM-DD"), { status: 400 });
  const r = await request();
  r.input("artcode", sql.VarChar(30), req("artcode"));
  r.input("reknr", sql.VarChar(20), req("reknr"));
  r.input("almacen", sql.VarChar(10), req("almacen"));
  r.input("res_id", sql.Int, q.res_id ? entero(q.res_id, null, 0, 2 ** 31 - 1) : null);
  r.input("desde", sql.Date, desde);
  r.input("hasta", sql.Date, hasta);
  r.input("max_rec", sql.Int, entero(q.max_recordatorios, 12, 0, 999));
  r.input("debcode", sql.VarChar(20), text(q.cliente, 20));
  const res = await r.query(`${PRE}
SELECT * FROM app.fn_kardex(@artcode, @reknr, @almacen, @res_id, @desde, @hasta, @max_rec, @debcode)
ORDER BY datum, periode, faktuurnr, ID
OPTION (RECOMPILE);`);
  return { filas: res.recordset };
}

export async function ping() {
  const r = await request();
  const res = await r.query("SELECT SYSDATETIME() AS hora_sql, DB_NAME() AS bd, @@SERVERNAME AS servidor;");
  return res.recordset[0];
}
