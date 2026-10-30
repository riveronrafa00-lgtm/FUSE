// Datos de demostración (DEMO=1): misma forma y misma lógica que las vistas SQL,
// para probar la app en el teléfono sin conectarse a cmch-dc1.
import { TRAMOS } from "./queries.js";

let seed = 20261030;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DIA = 86_400_000;
const hoy = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
const iso = (d) => d.toISOString().slice(0, 10);

const SKUS = [
  ["10010001", "CERVEZA CLARA LATA 24X355ML", "CERVEZA", 8.52],
  ["10010002", "CERVEZA CLARA BOTELLA 24X330ML", "CERVEZA", 7.92],
  ["10010003", "CERVEZA FUERTE LATA 24X355ML", "CERVEZA", 8.52],
  ["10010004", "CERVEZA OSCURA BOTELLA 24X330ML", "CERVEZA", 7.92],
  ["10010005", "CERVEZA CLARA BARRIL 50L", "CERVEZA", 50],
  ["10010006", "CERVEZA CLARA BARRIL 30L", "CERVEZA", 30],
  ["10010007", "CERVEZA LIGHT LATA 12X355ML", "CERVEZA", 4.26],
  ["10010008", "CERVEZA EDICION ESPECIAL 24X473ML", "CERVEZA", null],
  ["10020001", "MALTA LATA 24X355ML", "MALTA", 8.52],
  ["10020002", "MALTA BOTELLA 24X330ML", "MALTA", 7.92],
  ["10020003", "MALTA LATA 12X355ML", "MALTA", 4.26],
  ["90010001", "GORRA PROMOCIONAL", "PROMOCIONAL", null],
  ["90010002", "VASO PROMOCIONAL 400ML", "PROMOCIONAL", null],
  ["90010003", "NEVERA PORTATIL PROMOCIONAL", "PROMOCIONAL", null],
  ["90010004", "AFICHE POP PUNTO DE VENTA", "PROMOCIONAL", null],
  ["90020001", "CAJA PLASTICA RETORNABLE", "OTRO", null],
  ["90020002", "PALLET MADERA", "OTRO", null],
];
const NOMBRES = [
  "Cafetería El Rincón", "Restaurante Los Portales", "Mipyme La Esquina", "Bar Punto Azul", "Distribuidora Oriente",
  "Hotel Brisas del Mar", "Paladar Don Pepe", "Tienda La Económica", "Snack Bar La Ceiba", "Club Náutico",
  "Mipyme Sabor Criollo", "Cafetería 23 y 12", "Restaurante El Patio", "Bodega Central", "Mayorista del Centro",
  "Complejo Turístico Playa", "Cafetería La Rampa", "Mercado Agropecuario Norte", "Bar El Faro", "Restaurante La Terraza",
  "Distribuidora Occidente", "Mipyme Los Pinos", "Cafetería El Parque", "Hotel Ciudad Vieja", "Paladar La Familia",
  "Tienda El Sol", "Bar La Bodeguita", "Mipyme Sol y Mar", "Restaurante Camino Real", "Cafetería Las Palmas",
];
const CLIENTES = NOMBRES.map((n, i) => ({ debnr: String(1001 + i * 7).padStart(6, " "), cod: String(1001 + i * 7), nombre: n, peso: rnd() ** 2 }));

const LINEAS = [];
for (let n = 0; n < 240; n++) {
  const c = CLIENTES[Math.floor(rnd() ** 1.6 * CLIENTES.length)];
  const dias = Math.floor(rnd() ** 1.8 * 95);
  const fp = new Date(hoy() - dias * DIA);
  const fe = new Date(+fp + Math.floor(3 + rnd() * 10) * DIA);
  const ordernr = String(26000 + n).padStart(8, " ");
  const nl = 1 + Math.floor(rnd() * 4);
  const usados = new Set();
  const estadoPedido = rnd(); // <0.55 nada entregado, <0.85 parcial, resto entregado
  for (let i = 0; i < nl; i++) {
    let s = pick(SKUS.slice(0, rnd() < 0.85 ? 11 : SKUS.length));
    if (usados.has(s[0])) continue;
    usados.add(s[0]);
    const esCaja = s[2] === "CERVEZA" || s[2] === "MALTA";
    const pedida = esCaja ? (s[3] >= 30 ? 2 + Math.floor(rnd() * 12) : 20 + Math.floor(rnd() * 400)) : 5 + Math.floor(rnd() * 120);
    const entregada = estadoPedido < 0.55 ? 0 : estadoPedido < 0.85 ? Math.floor(pedida * rnd() * 0.9) : pedida;
    const pendiente = Math.max(pedida - entregada, 0);
    const hl = (q) => (esCaja && s[3] ? (q * s[3]) / 100 : esCaja ? null : null);
    LINEAS.push({
      ordernr, pedido: ordernr.trim(), fecha_pedido: iso(fp), fecha_entrega: iso(fe),
      debnr: c.debnr, cliente_cod: c.cod, cliente: c.nombre, referencia: `OC-${2600 + n}`,
      linea: i + 1, artcode: s[0], sku_desc: s[1], almacen: pick(["A410", "A410", "A420"]),
      categoria: s[2], litros_unidad: s[3], es_hl: esCaja && s[3] ? 1 : 0, sin_factor: esCaja && !s[3] ? 1 : 0,
      cant_pedida: pedida, cant_entregada: entregada, cant_pendiente: pendiente,
      hl_pedido: hl(pedida), hl_entregado: hl(entregada), hl_pendiente: hl(pendiente),
      dias, tramo: dias <= 7 ? 1 : dias <= 15 ? 2 : dias <= 30 ? 3 : dias <= 60 ? 4 : 5,
    });
  }
}

const sum = (a, k) => a.reduce((t, x) => t + (Number(x[k]) || 0), 0);
const distinct = (a, k) => new Set(a.map((x) => x[k])).size;
const und = (a) => a.reduce((t, x) => t + (x.es_hl ? 0 : x.cant_pendiente), 0);

function filtrarLineas(f, todas = false) {
  const today = hoy();
  const like = f.q?.toLowerCase();
  return LINEAS.filter((l) => {
    if (!todas && !(l.cant_pendiente > 0)) return false;
    if (f.cliente && l.debnr !== f.cliente) return false;
    if (f.sku && l.artcode !== f.sku) return false;
    if (f.categoria) {
      const grupo = { HL: ["CERVEZA", "MALTA"], OTROS: ["PROMOCIONAL", "OTRO"] }[f.categoria] || [f.categoria];
      if (!grupo.includes(l.categoria)) return false;
    }
    if (f.desde && l.fecha_pedido < f.desde) return false;
    if (f.hasta && l.fecha_pedido > f.hasta) return false;
    if (f.tramo) {
      const t = TRAMOS[f.tramo - 1];
      if (l.fecha_pedido > iso(new Date(today - t.min * DIA))) return false;
      if (t.max != null && l.fecha_pedido < iso(new Date(today - t.max * DIA))) return false;
    }
    if (like && ![l.pedido, l.cliente, l.cliente_cod, l.artcode, l.sku_desc].some((v) => v?.toLowerCase().includes(like))) return false;
    return true;
  });
}

function agrupar(lineas, k) {
  const m = new Map();
  for (const l of lineas) (m.get(l[k]) || m.set(l[k], []).get(l[k])).push(l);
  return m;
}

function aPedido(ls) {
  const l0 = ls[0];
  const p = {
    id: l0.ordernr, pedido: l0.pedido, fecha_pedido: l0.fecha_pedido, cliente_id: l0.debnr, cliente_cod: l0.cliente_cod,
    cliente: l0.cliente, referencia: l0.referencia, dias: l0.dias, tramo: l0.tramo,
    fecha_entrega: ls.map((x) => x.fecha_entrega).sort()[0],
    lineas: ls.length, lineas_pendientes: ls.filter((x) => x.cant_pendiente > 0).length, lineas_sin_factor: sum(ls, "sin_factor"),
    cant_pedida: sum(ls, "cant_pedida"), cant_entregada: sum(ls, "cant_entregada"), cant_pendiente: sum(ls, "cant_pendiente"),
    hl_pedido: sum(ls, "hl_pedido"), hl_entregado: sum(ls, "hl_entregado"), hl_pendiente: sum(ls, "hl_pendiente"),
    und_pedidas: ls.reduce((t, x) => t + (x.es_hl ? 0 : x.cant_pedida), 0),
    und_entregadas: ls.reduce((t, x) => t + (x.es_hl ? 0 : x.cant_entregada), 0),
    und_pendientes: und(ls),
  };
  const facturado = p.cant_entregada > 0 && Number(p.pedido) % 3 === 0;
  p.facturas = facturado ? 1 : 0;
  p.saldo_facturas = facturado ? (Number(p.pedido) % 2 ? 0 : 1250.5) : null;
  p.estado = p.cant_entregada === 0 ? "PENDIENTE" : p.cant_pendiente > 0 ? "PARCIAL" : !p.facturas ? "ENTREGADO" : p.saldo_facturas ? "FACTURADO" : "COBRADO";
  const atraso = Math.round((hoy() - new Date(p.fecha_entrega)) / DIA);
  p.dias_atraso = p.cant_pendiente > 0 && atraso > 0 ? atraso : 0;
  return p;
}

export async function resumen(f) {
  const ls = filtrarLineas(f);
  const today = iso(hoy());
  const hl = sum(ls, "hl_pendiente");
  const porPedido = agrupar(ls, "ordernr");
  const pedidosEstado = [...porPedido.keys()].map((id) => aPedido(LINEAS.filter((x) => x.ordernr === id)));
  const estados = ["PENDIENTE", "PARCIAL"].map((e) => {
    const ps = pedidosEstado.filter((p) => (p.cant_entregada === 0 ? "PENDIENTE" : "PARCIAL") === e);
    return { estado: e, pedidos: ps.length, hl: sum(ps, "hl_pendiente"), und: sum(ps, "und_pendientes"), cant: sum(ps, "cant_pendiente") };
  }).filter((e) => e.pedidos);
  const top = (k, map) => [...agrupar(ls, k).values()].map(map).sort((a, b) => b.hl - a.hl || (b.und ?? b.cant) - (a.und ?? a.cant)).slice(0, 8);
  return {
    kpi: {
      pedidos: porPedido.size, clientes: distinct(ls, "debnr"), skus: distinct(ls, "artcode"),
      hl, hl_cerveza: sum(ls.filter((x) => x.categoria === "CERVEZA"), "hl_pendiente"),
      hl_malta: sum(ls.filter((x) => x.categoria === "MALTA"), "hl_pendiente"), und: und(ls), cant: sum(ls, "cant_pendiente"),
      skus_sin_factor: distinct(ls.filter((x) => x.sin_factor), "artcode"),
      pedidos_atrasados: distinct(ls.filter((x) => x.fecha_entrega < today), "ordernr"),
      dias_max: Math.max(0, ...ls.map((x) => x.dias)),
      dias_prom_hl: hl ? ls.reduce((t, x) => t + (x.hl_pendiente || 0) * x.dias, 0) / hl : 0,
    },
    tramos: TRAMOS.map((t) => {
      const g = ls.filter((x) => x.tramo === t.tramo);
      return { ...t, pedidos: distinct(g, "ordernr"), hl: sum(g, "hl_pendiente"), und: und(g), cant: sum(g, "cant_pendiente") };
    }),
    clientes: top("debnr", (g) => ({ id: g[0].debnr, cod: g[0].cliente_cod, nombre: g[0].cliente, pedidos: distinct(g, "ordernr"), hl: sum(g, "hl_pendiente"), und: und(g), cant: sum(g, "cant_pendiente"), dias_max: Math.max(...g.map((x) => x.dias)) })),
    skus: top("artcode", (g) => ({ id: g[0].artcode, nombre: g[0].sku_desc, categoria: g[0].categoria, es_hl: g[0].es_hl, cant: sum(g, "cant_pendiente"), hl: sum(g, "hl_pendiente"), pedidos: distinct(g, "ordernr") })),
    estados,
  };
}

export async function pedidos(f) {
  let ps = [...agrupar(LINEAS, "ordernr").values()].map(aPedido);
  const conLinea = f.sku || f.categoria ? new Set(filtrarLineas({ sku: f.sku, categoria: f.categoria }).map((x) => x.ordernr)) : null;
  const like = f.q?.toLowerCase();
  const today = hoy();
  ps = ps.filter((p) => {
    if (!f.estado || f.estado === "PENDIENTE" || f.estado === "PARCIAL") { if (!(p.cant_pendiente > 0)) return false; }
    if (f.estado && p.estado !== f.estado) return false;
    if (f.cliente && p.cliente_id !== f.cliente) return false;
    if (conLinea && !conLinea.has(p.id)) return false;
    if (f.desde && p.fecha_pedido < f.desde) return false;
    if (f.hasta && p.fecha_pedido > f.hasta) return false;
    if (f.tramo) {
      const t = TRAMOS[f.tramo - 1];
      if (p.fecha_pedido > iso(new Date(today - t.min * DIA))) return false;
      if (t.max != null && p.fecha_pedido < iso(new Date(today - t.max * DIA))) return false;
    }
    if (like && ![p.pedido, p.cliente, p.cliente_cod, p.referencia].some((v) => v?.toLowerCase().includes(like))) return false;
    return true;
  });
  const ord = {
    recientes: (a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido),
    hl: (a, b) => b.hl_pendiente - a.hl_pendiente || b.und_pendientes - a.und_pendientes,
    cant: (a, b) => b.cant_pendiente - a.cant_pendiente,
    cliente: (a, b) => a.cliente.localeCompare(b.cliente),
    atraso: (a, b) => b.dias_atraso - a.dias_atraso,
  }[f.orden] || ((a, b) => a.fecha_pedido.localeCompare(b.fecha_pedido) || a.pedido.localeCompare(b.pedido));
  ps.sort(ord);
  return { total: ps.length, offset: f.offset, filas: ps.slice(f.offset, f.offset + f.limit) };
}

export async function pedido(id) {
  const ls = LINEAS.filter((x) => x.ordernr === id);
  if (!ls.length) return null;
  const p = aPedido(ls);
  const mov = ls.filter((l) => l.cant_entregada > 0).map((l) => ({
    fecha: iso(new Date(+new Date(l.fecha_pedido) + 2 * DIA)), tipo: "Entrega (inventario)", factura: null, asiento: `E${l.pedido}`,
    artcode: l.artcode, almacen: l.almacen, cantidad: -l.cant_entregada, importe: null, moneda: "CUP", descripcion: l.sku_desc.slice(0, 25),
  }));
  const facturas = p.facturas ? [{ factura: `F${p.pedido}`, fecha: mov[0]?.fecha, importe: 1250.5, saldo: p.saldo_facturas, cobrada: p.saldo_facturas ? 0 : 1 }] : [];
  return { ...p, lineas: ls, facturas, movimientos: mov };
}

export async function clientes(f) {
  const ls = filtrarLineas(f);
  const today = iso(hoy());
  const filas = [...agrupar(ls, "debnr").values()].map((g) => ({
    id: g[0].debnr, cod: g[0].cliente_cod, nombre: g[0].cliente, pedidos: distinct(g, "ordernr"),
    hl: sum(g, "hl_pendiente"), und: und(g), cant: sum(g, "cant_pendiente"), dias_max: Math.max(...g.map((x) => x.dias)),
    pedido_mas_antiguo: g.map((x) => x.fecha_pedido).sort()[0],
    atrasados: distinct(g.filter((x) => x.fecha_entrega < today), "ordernr"),
  }));
  return { filas: ordenarGrupo(filas, f.orden).slice(0, f.limit) };
}

export async function skus(f) {
  const ls = filtrarLineas(f);
  const filas = [...agrupar(ls, "artcode").values()].map((g) => ({
    id: g[0].artcode, nombre: g[0].sku_desc, categoria: g[0].categoria, litros_unidad: g[0].litros_unidad,
    es_hl: g[0].es_hl, sin_factor: g[0].sin_factor, cant: sum(g, "cant_pendiente"), hl: sum(g, "hl_pendiente"), und: und(g),
    pedidos: distinct(g, "ordernr"), clientes: distinct(g, "debnr"), dias_max: Math.max(...g.map((x) => x.dias)),
  }));
  return { filas: ordenarGrupo(filas, f.orden).slice(0, f.limit) };
}

function ordenarGrupo(filas, orden) {
  const ord = {
    antiguedad: (a, b) => b.dias_max - a.dias_max,
    pedidos: (a, b) => b.pedidos - a.pedidos,
    cant: (a, b) => b.cant - a.cant,
    nombre: (a, b) => a.nombre.localeCompare(b.nombre),
  }[orden] || ((a, b) => b.hl - a.hl || b.und - a.und);
  return filas.sort(ord);
}

export async function kardex() {
  return { filas: [], aviso: "El kardex solo está disponible conectado a SQL Server." };
}

export async function ping() {
  return { hora_sql: new Date().toISOString(), bd: "DEMO", servidor: "datos de demostración" };
}
