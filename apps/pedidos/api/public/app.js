/* Cartera de pedidos — lógica del panel (sin dependencias).
   Vistas: Resumen · Pedidos · Clientes · SKU, detalle de pedido y ajustes.
   Se actualiza sola cada N segundos; si no hay red muestra los últimos datos. */
(() => {
  "use strict";

  const CFG = Object.assign({ marca: "Cartera de pedidos", refrescoSegundos: 30, unidadInicial: "HL", servidor: "" }, window.APP_CONFIG || {});
  const NATIVO = !!window.Capacitor?.isNativePlatform?.();

  /* ---------- Almacenamiento local (tolerante a fallos) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("cp." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("cp." + k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ } },
    del(k) { try { localStorage.removeItem("cp." + k); } catch { /* nada */ } },
  };

  const S = {
    servidor: store.get("servidor", CFG.servidor || ""),
    token: store.get("token", ""),
    unidad: store.get("unidad", CFG.unidadInicial),
    vista: store.get("vista", "resumen"),
    refresco: store.get("refresco", CFG.refrescoSegundos),
    tema: store.get("tema", "auto"),
    f: { cliente: null, sku: null, cat: "", tramo: null, estado: "", orden: "antiguedad", q: "" },
    ordenGrupo: "hl",
    lista: { filas: [], total: 0 },
    sesion: null,
    ultimaCarga: 0,
    ultimoOk: 0,
    estadoRed: "cargando",
    cargando: false,
    previo: new Map(),
  };

  const TRAMOS = [
    { tramo: 1, etiqueta: "0–7 días", corto: "0–7" },
    { tramo: 2, etiqueta: "8–15 días", corto: "8–15" },
    { tramo: 3, etiqueta: "16–30 días", corto: "16–30" },
    { tramo: 4, etiqueta: "31–60 días", corto: "31–60" },
    { tramo: 5, etiqueta: "+60 días", corto: "+60" },
  ];
  const ESTADOS = { PENDIENTE: "Sin entregar", PARCIAL: "Parcial", ENTREGADO: "Entregado", FACTURADO: "Facturado", COBRADO: "Cobrado" };
  const CATEGORIA = { CERVEZA: "Cerveza", MALTA: "Malta", PROMOCIONAL: "Promocional", OTRO: "Otro" };

  /* ---------- Utilidades ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = (n, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const nfCache = {};
  const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" }));
  const n0 = (v) => nf(0).format(Number(v) || 0);
  const fmtHL = (v) => { const x = Number(v) || 0; return nf(Math.abs(x) >= 100 ? 1 : 2).format(x); };
  const fmtCant = (v) => { const x = Number(v) || 0; return nf(Number.isInteger(x) ? 0 : 2).format(x); };
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
  const fecha = (v) => { if (!v) return "—"; const [y, m, d] = String(v).slice(0, 10).split("-"); return `${d}/${m}/${y.slice(2)}`; };
  const fechaLarga = (v) => { if (!v) return "—"; const [y, m, d] = String(v).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
  const hora = (t) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const tc = (t) => `var(--t${t || 1})`;
  const iniciales = (s) => String(s || "?").replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const PALETA = ["#13305a", "#1f6f8b", "#6d4bc2", "#b25b17", "#2b7a4b", "#8a2f45", "#40527a"];
  const colorDe = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return PALETA[Math.abs(h) % PALETA.length]; };
  const esHL = () => S.unidad === "HL";

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2800);
  }

  /* ---------- Red ---------- */
  const base = () => (S.servidor || "").replace(/\/+$/, "");

  function guardarLocal(ruta, txt) {
    const idx = store.get("cidx", []).filter((r) => r !== ruta);
    idx.unshift(ruta);
    for (const viejo of idx.splice(40)) store.del("c." + viejo);
    store.set("cidx", idx);
    store.set("c." + ruta, { t: Date.now(), txt });
  }
  const leerLocal = (ruta) => store.get("c." + ruta, null);

  class ErrorApi extends Error {}

  /** GET a la API. Devuelve { datos, cambiado }. Sin red: últimos datos guardados. */
  async function api(ruta) {
    let res;
    try {
      res = await fetch(base() + ruta, { headers: { Authorization: "Bearer " + S.token }, cache: "no-cache" });
    } catch {
      return desdeLocal(ruta, "Sin conexión con el servidor");
    }
    if (res.status === 401) { salir("Tu código de acceso no es válido."); throw new ErrorApi("401"); }
    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
      if (res.status >= 500) return desdeLocal(ruta, msg);
      throw new ErrorApi(msg);
    }
    const txt = await res.text();
    estadoRed("ok");
    guardarLocal(ruta, txt);
    const cambiado = S.previo.get(ruta) !== txt;
    S.previo.set(ruta, txt);
    return { datos: JSON.parse(txt), cambiado };
  }

  function desdeLocal(ruta, motivo) {
    const g = leerLocal(ruta);
    if (!g) { estadoRed("err", motivo); throw new ErrorApi(motivo); }
    estadoRed("off", motivo, g.t);
    const cambiado = S.previo.get(ruta) !== g.txt;
    S.previo.set(ruta, g.txt);
    return { datos: JSON.parse(g.txt), cambiado, offline: true };
  }

  function estadoRed(e, motivo, t) {
    S.estadoRed = e;
    if (e === "ok") S.ultimoOk = Date.now();
    S.motivoRed = motivo;
    S.tOffline = t;
    pintarLive();
  }

  function pintarLive() {
    const el = $("#live");
    el.className = "live " + S.estadoRed;
    let txt = "Conectando…";
    if (S.estadoRed === "ok") {
      const s = Math.round((Date.now() - S.ultimoOk) / 1000);
      txt = `${S.sesion?.modo === "demo" ? "Demo" : "En vivo"} · ${s < 5 ? "ahora" : s < 60 ? `hace ${s} s` : "a las " + hora(S.ultimoOk)}`;
    } else if (S.estadoRed === "off") txt = `Sin conexión · datos de ${hora(S.tOffline)}`;
    else if (S.estadoRed === "err") txt = "Sin conexión";
    el.querySelector("b").textContent = txt;
  }

  function qs(extra = {}, { conTramo = true } = {}) {
    const f = S.f, p = new URLSearchParams();
    if (f.cliente) p.set("cliente", f.cliente.id);
    if (f.sku) p.set("sku", f.sku.id);
    if (f.cat) p.set("categoria", f.cat);
    if (f.q) p.set("q", f.q);
    if (conTramo && f.tramo) p.set("tramo", f.tramo);
    for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") p.set(k, v);
    const s = p.toString();
    return s ? "?" + s : "";
  }

  /* ---------- Valores según la unidad elegida ---------- */
  // Modo HL: cerveza y malta en HL; lo demás aparte, en unidades (nunca se suman).
  function valorPedido(p) {
    if (!esHL()) return { v: fmtCant(p.cant_pendiente), u: "und", de: `de ${fmtCant(p.cant_pedida)}`, extra: "" };
    if (p.hl_pedido > 0) {
      return { v: fmtHL(p.hl_pendiente), u: "HL", de: `de ${fmtHL(p.hl_pedido)} HL`, extra: p.und_pendientes > 0 ? `+ ${fmtCant(p.und_pendientes)} und` : "" };
    }
    return { v: fmtCant(p.und_pendientes), u: "und", de: `de ${fmtCant(p.und_pedidas)} und`, extra: "" };
  }
  const avancePedido = (p) => (esHL() && p.hl_pedido > 0 ? pct(p.hl_entregado, p.hl_pedido) : pct(p.cant_entregada, p.cant_pedida));
  function valorGrupo(x) {
    if (!esHL()) return { v: fmtCant(x.cant), u: "und", sub: "" };
    if (x.hl > 0) return { v: fmtHL(x.hl), u: "HL", sub: x.und > 0 ? `+ ${fmtCant(x.und)} und` : "" };
    return { v: fmtCant(x.und ?? x.cant), u: "und", sub: "" };
  }
  const metricaGrupo = (x) => (esHL() ? (x.hl > 0 ? x.hl : 0) : Number(x.cant) || 0);

  /* ---------- Carga y vistas ---------- */
  const VISTAS = { resumen: cargarResumen, pedidos: cargarPedidos, clientes: cargarClientes, skus: cargarSkus };

  async function cargar({ silencioso = false } = {}) {
    if (S.cargando) return;
    S.cargando = true;
    S.ultimaCarga = Date.now();
    $("#btn-refresh").classList.add("girando");
    const vista = S.vista;
    if (!silencioso) esqueleto();
    try {
      await VISTAS[vista]({ silencioso });
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.message !== "401") {
        if (!silencioso) $("#vista").innerHTML = vacio("warn", "No se pudieron cargar los datos", esc(e.message));
        else toast(e.message);
      }
    } finally {
      S.cargando = false;
      $("#btn-refresh").classList.remove("girando");
    }
  }

  function esqueleto() {
    const alto = S.vista === "resumen" ? [150, 90, 260] : [44, 96, 96, 96, 96];
    $("#vista").innerHTML = alto.map((h) => `<div class="sk" style="height:${h}px"></div>`).join("");
  }
  const vacio = (i, t, s = "") => `<div class="card vacio">${ico(i)}<div><strong>${t}</strong></div>${s ? `<div>${s}</div>` : ""}</div>`;

  function banner(k) {
    const b = $("#banner");
    if (k?.skus_sin_factor > 0) {
      b.innerHTML = `${ico("warn")}<span><b>${k.skus_sin_factor} SKU de cerveza/malta sin factor HL.</b> Se cuentan en unidades hasta que se configuren en <code>app.sku_medida</code>.</span>`;
      b.hidden = false;
    } else b.hidden = true;
  }

  /* ----- Resumen ----- */
  async function cargarResumen({ silencioso }) {
    const { datos: d, cambiado } = await api("/api/resumen" + qs());
    if (silencioso && !cambiado) return;
    if (S.vista !== "resumen") return;
    const k = d.kpi;
    banner(k);
    if (!k.pedidos) { $("#vista").innerHTML = vacio("check", "No hay pedidos pendientes", "con los filtros seleccionados."); return; }
    const est = Object.fromEntries((d.estados || []).map((e) => [e.estado, e]));
    const hl = esHL();

    const hero = hl
      ? `<div class="hero-label">Cartera pendiente de entregar</div>
         <div class="hero-valor"><strong class="num">${fmtHL(k.hl)}</strong><span>HL</span></div>
         <div class="hero-split">
           <span><i class="dot" style="background:var(--c-cerveza)"></i>Cerveza <b class="num">${fmtHL(k.hl_cerveza)}</b></span>
           <span><i class="dot" style="background:#c08a5a"></i>Malta <b class="num">${fmtHL(k.hl_malta)}</b></span>
         </div>
         ${k.und > 0 ? `<div class="hero-otros">Además <b class="num">${fmtCant(k.und)}</b> unidades de promocionales y otros SKU (no se convierten a HL)</div>` : ""}`
      : `<div class="hero-label">Cartera pendiente de entregar</div>
         <div class="hero-valor"><strong class="num">${fmtCant(k.cant)}</strong><span>unidades</span></div>
         <div class="hero-split"><span>Todas las categorías · <b>${n0(k.skus)}</b> SKU</span></div>
         <div class="hero-otros">Cerveza y malta equivalen a <b class="num">${fmtHL(k.hl)} HL</b></div>`;

    const valT = (t) => (hl ? t.hl : t.cant);
    const totalT = d.tramos.reduce((s, t) => s + valT(t), 0);
    const maxT = Math.max(...d.tramos.map(valT), 0);
    const aging = `
      <div class="card">
        <div class="card-head"><h3>Antigüedad de la cartera</h3><span class="muted">${hl ? "HL pendientes" : "unidades pendientes"}</span></div>
        <div class="aging-stack" aria-hidden="true">${d.tramos.map((t) => `<i style="width:${pct(valT(t), totalT)}%;background:${tc(t.tramo)}"></i>`).join("")}</div>
        <ul class="aging">
          ${d.tramos.map((t) => `<li><button data-ir-tramo="${t.tramo}" aria-pressed="${S.f.tramo === t.tramo}">
              <span class="lbl"><i class="dot" style="background:${tc(t.tramo)}"></i>${esc(t.etiqueta)}</span>
              <span class="bar"><i style="width:${pct(valT(t), maxT)}%;background:${tc(t.tramo)}"></i></span>
              <span class="val num"><b>${hl ? fmtHL(t.hl) : fmtCant(t.cant)}</b><small>${n0(t.pedidos)} ped.${hl && t.und > 0 ? ` · ${fmtCant(t.und)} und` : ""}</small></span>
            </button></li>`).join("")}
        </ul>
      </div>`;

    const maxC = Math.max(...d.clientes.map(metricaGrupo), 0);
    const topClientes = `
      <div class="card half">
        <div class="card-head"><h3>Clientes con más pendiente</h3><button class="link" data-vista-ir="clientes">Ver todos</button></div>
        <ul class="rows">${d.clientes.map((c) => filaCliente(c, maxC)).join("")}</ul>
      </div>`;
    const maxS = Math.max(...d.skus.map(metricaGrupo), 0);
    const topSkus = `
      <div class="card half">
        <div class="card-head"><h3>SKU con más pendiente</h3><button class="link" data-vista-ir="skus">Ver todos</button></div>
        <ul class="rows">${d.skus.map((s) => filaSku(s, maxS)).join("")}</ul>
      </div>`;

    $("#vista").innerHTML = `
      <section class="hero">${hero}</section>
      <section class="kpis">
        <button class="card kpi" data-ir-estado=""><small>Pedidos abiertos</small><strong class="num">${n0(k.pedidos)}</strong>
          <em>${n0(est.PENDIENTE?.pedidos || 0)} sin entregar · ${n0(est.PARCIAL?.pedidos || 0)} parciales</em></button>
        <button class="card kpi" data-vista-ir="clientes"><small>Clientes</small><strong class="num">${n0(k.clientes)}</strong><em>${n0(k.skus)} SKU distintos</em></button>
        <button class="card kpi ${k.pedidos_atrasados ? "alerta" : ""}" data-ir-orden="atraso"><small>Con entrega vencida</small><strong class="num">${n0(k.pedidos_atrasados)}</strong><em>${pct(k.pedidos_atrasados, k.pedidos).toFixed(0)} % de los pedidos</em></button>
        <button class="card kpi" data-ir-orden="antiguedad"><small>Antigüedad media</small><strong class="num">${n0(k.dias_prom_hl)} <span style="font-size:14px">días</span></strong><em>ponderada por HL · máx. ${n0(k.dias_max)} d</em></button>
      </section>
      ${aging}
      ${topClientes}
      ${topSkus}`;
  }

  function filaCliente(c, max) {
    const v = valorGrupo(c);
    return `<li><button class="row" data-cliente="${esc(c.id)}" data-label="${esc(c.nombre || c.cod)}">
      <span class="avatar" style="background:${colorDe(c.nombre)}">${esc(iniciales(c.nombre))}</span>
      <span class="row-main"><strong>${esc(c.nombre || "Sin nombre")}</strong>
        <small>${esc(c.cod)} · ${n0(c.pedidos)} ped. · máx. ${n0(c.dias_max)} d${c.atrasados ? ` · <span style="color:var(--bad)">${n0(c.atrasados)} vencidos</span>` : ""}</small>
        <span class="minibar"><i style="width:${pct(metricaGrupo(c), max)}%"></i></span></span>
      <span class="row-val num"><b>${v.v} <small>${v.u}</small></b>${v.sub ? `<small>${v.sub}</small>` : ""}</span>
    </button></li>`;
  }

  function filaSku(s, max) {
    const v = valorGrupo(s);
    const icono = s.categoria === "PROMOCIONAL" ? "star" : s.categoria === "OTRO" ? "box" : "beer";
    const formato = s.litros_unidad ? ` · ${nf(2).format(s.litros_unidad)} L/und` : "";
    return `<li><button class="row" data-sku="${esc(s.id)}" data-label="${esc(s.nombre || s.id)}">
      <span class="sku-ico cat-${esc(s.categoria)}">${ico(icono)}</span>
      <span class="row-main"><strong>${s.sin_factor ? ico("warn", "warn-ico") + " " : ""}${esc(s.nombre || s.id)}</strong>
        <small>${esc(CATEGORIA[s.categoria] || s.categoria)} · ${esc(s.id)}${formato} · ${n0(s.pedidos)} ped.</small>
        <span class="minibar"><i style="width:${pct(metricaGrupo(s), max)}%"></i></span></span>
      <span class="row-val num"><b>${v.v} <small>${v.u}</small></b>${v.sub ? `<small>${v.sub}</small>` : ""}</span>
    </button></li>`;
  }

  /* ----- Pedidos ----- */
  async function cargarPedidos({ silencioso, mas = false }) {
    const limit = mas ? 50 : Math.max(50, Math.min(silencioso ? S.lista.filas.length : 50, 500));
    const offset = mas ? S.lista.filas.length : 0;
    const orden = S.f.orden === "hl" && !esHL() ? "cant" : S.f.orden;
    const { datos: d, cambiado } = await api("/api/pedidos" + qs({ estado: S.f.estado, orden, limit, offset }));
    if (S.vista !== "pedidos") return;
    if (mas) { S.lista.filas.push(...d.filas); S.lista.total = d.total; pintarListaPedidos(); return; }
    if (silencioso && !cambiado) return;
    S.lista = { filas: d.filas, total: d.total };
    banner(null);
    $("#vista").innerHTML = `
      <div class="tramos" role="group" aria-label="Antigüedad">
        <button class="tramo-chip" data-tramo="" aria-pressed="${!S.f.tramo}">Todas</button>
        ${TRAMOS.map((t) => `<button class="tramo-chip" data-tramo="${t.tramo}" aria-pressed="${S.f.tramo === t.tramo}"><i class="dot" style="background:${tc(t.tramo)};margin:0"></i>${t.corto} <small>días</small></button>`).join("")}
      </div>
      <div class="toolbar">
        <span class="total" id="total"></span>
        <select class="select" id="sel-estado" aria-label="Estado">
          ${[["", "Pendientes"], ["PENDIENTE", "Sin entregar"], ["PARCIAL", "Entrega parcial"], ["ENTREGADO", "Entregados sin facturar"], ["FACTURADO", "Facturados sin cobrar"], ["COBRADO", "Cobrados"]]
            .map(([v, t]) => `<option value="${v}" ${S.f.estado === v ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <select class="select" id="sel-orden" aria-label="Ordenar">
          ${[["antiguedad", "Más antiguos"], ["recientes", "Más recientes"], ["hl", esHL() ? "Más HL" : "Más unidades"], ["atraso", "Más atrasados"], ["cliente", "Cliente A–Z"]]
            .map(([v, t]) => `<option value="${v}" ${S.f.orden === v ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="pedidos" id="lista"></div>
      <div id="mas"></div>`;
    pintarListaPedidos();
  }

  function pintarListaPedidos() {
    const { filas, total } = S.lista;
    $("#total").innerHTML = `<b>${n0(total)}</b> pedido${total === 1 ? "" : "s"}`;
    $("#lista").innerHTML = filas.length ? filas.map(tarjetaPedido).join("") : vacio("check", "Sin pedidos", "No hay pedidos con estos filtros.");
    $("#mas").innerHTML = filas.length < total ? `<button class="btn btn-ghost btn-block" id="btn-mas">Mostrar más (${n0(total - filas.length)} restantes)</button>` : "";
  }

  function tarjetaPedido(p) {
    const v = valorPedido(p);
    const av = avancePedido(p);
    return `<button class="card ped" data-pedido="${esc(p.id)}" style="--tc:${tc(p.tramo)}">
      <div class="ped-top"><strong>Nº ${esc(p.pedido)}</strong><span class="dias">${n0(p.dias)} d</span><span class="estado e-${esc(p.estado)}">${esc(ESTADOS[p.estado] || p.estado)}</span></div>
      <div class="ped-cli">${esc(p.cliente || p.cliente_cod)}</div>
      <div class="ped-grid">
        <div class="ped-meta">
          <span>${ico("clock")}${fecha(p.fecha_pedido)}</span>
          <span class="${p.dias_atraso > 0 ? "tarde" : ""}">Entrega ${fecha(p.fecha_entrega)}${p.dias_atraso > 0 ? ` · ${n0(p.dias_atraso)} d tarde` : ""}</span>
          <span>${n0(p.lineas_pendientes)}/${n0(p.lineas)} líneas</span>
          ${p.lineas_sin_factor ? `<span>${ico("warn", "warn-ico")}sin factor HL</span>` : ""}
        </div>
        <div class="ped-val num"><b>${v.v} <small>${v.u}</small></b><small>${v.de}</small>${v.extra ? `<br><small>${v.extra}</small>` : ""}</div>
      </div>
      <div class="progreso"><span class="bar"><i style="width:${av}%"></i></span><span class="num">${av.toFixed(0)} % entregado</span></div>
    </button>`;
  }

  /* ----- Clientes y SKU ----- */
  function toolbarGrupo(n, etiqueta) {
    return `<div class="toolbar">
      <span class="total"><b>${n0(n)}</b> ${etiqueta}</span>
      <select class="select" id="sel-orden-grupo" aria-label="Ordenar">
        ${[["hl", esHL() ? "Más HL" : "Más unidades"], ["antiguedad", "Más antiguo"], ["pedidos", "Más pedidos"], ["nombre", "A–Z"]]
          .map(([v, t]) => `<option value="${v}" ${S.ordenGrupo === v ? "selected" : ""}>${t}</option>`).join("")}
      </select></div>`;
  }
  const ordenGrupo = () => (S.ordenGrupo === "hl" && !esHL() ? "cant" : S.ordenGrupo);

  async function cargarClientes({ silencioso }) {
    const { datos: d, cambiado } = await api("/api/clientes" + qs({ orden: ordenGrupo(), limit: 300 }));
    if (S.vista !== "clientes" || (silencioso && !cambiado)) return;
    banner(null);
    const max = Math.max(...d.filas.map(metricaGrupo), 0);
    $("#vista").innerHTML = toolbarGrupo(d.filas.length, "clientes con pendiente") +
      (d.filas.length ? `<div class="card"><ul class="rows">${d.filas.map((c) => filaCliente(c, max)).join("")}</ul></div>` : vacio("users", "Sin clientes", "No hay pendientes con estos filtros."));
  }

  async function cargarSkus({ silencioso }) {
    const { datos: d, cambiado } = await api("/api/skus" + qs({ orden: ordenGrupo(), limit: 300 }));
    if (S.vista !== "skus" || (silencioso && !cambiado)) return;
    banner(null);
    const max = Math.max(...d.filas.map(metricaGrupo), 0);
    $("#vista").innerHTML = toolbarGrupo(d.filas.length, "SKU con pendiente") +
      (d.filas.length ? `<div class="card"><ul class="rows">${d.filas.map((s) => filaSku(s, max)).join("")}</ul></div>` : vacio("box", "Sin SKU", "No hay pendientes con estos filtros."));
  }

  /* ---------- Detalle de pedido ---------- */
  function abrirSheet(titulo, html) {
    $("#sheet-title").textContent = titulo;
    $("#sheet-body").innerHTML = html;
    const abierta = !$("#sheet").hidden;
    $("#sheet").hidden = false;
    document.body.style.overflow = "hidden";
    if (!abierta) history.pushState({ sheet: 1 }, "");
  }
  function cerrarSheet(desdeHistorial = false) {
    if ($("#sheet").hidden) return;
    $("#sheet").hidden = true;
    document.body.style.overflow = "";
    if (!desdeHistorial && history.state?.sheet) history.back();
  }

  async function abrirPedido(id) {
    abrirSheet("Pedido", `<div class="sk" style="height:120px"></div><div class="sk" style="height:80px"></div><div class="sk" style="height:220px"></div>`);
    try {
      const { datos: p } = await api("/api/pedidos/" + encodeURIComponent(id));
      $("#sheet-title").textContent = `Pedido Nº ${p.pedido}`;
      $("#sheet-body").innerHTML = detallePedido(p);
    } catch (e) {
      if (e.message !== "401") $("#sheet-body").innerHTML = vacio("warn", "No se pudo abrir el pedido", esc(e.message));
    }
  }

  function detallePedido(p) {
    const hl = esHL() && p.hl_pedido > 0;
    const f = (x) => (hl ? fmtHL(x) : fmtCant(x));
    const u = hl ? "HL" : "und";
    const entregaOk = p.cant_entregada > 0 && p.cant_pendiente <= 0;
    const facturaOk = ["FACTURADO", "COBRADO"].includes(p.estado);
    const step = (cls, i, t, s) => `<div class="step ${cls}"><i>${i ? ico(i) : ""}</i><b>${t}</b>${s}</div>`;
    const steps = `<div class="card steps">
      ${step("done", "check", "Pedido", fecha(p.fecha_pedido))}
      ${step(entregaOk ? "done" : p.cant_entregada > 0 ? "half" : "", entregaOk ? "check" : p.cant_entregada > 0 ? "clock" : "", "Entrega", entregaOk ? "Completa" : p.cant_entregada > 0 ? `${avancePedido(p).toFixed(0)} %` : "Pendiente")}
      ${step(facturaOk ? "done" : p.facturas > 0 ? "half" : "", facturaOk ? "check" : p.facturas > 0 ? "clock" : "", "Factura", p.facturas > 0 ? `${n0(p.facturas)} emitida${p.facturas > 1 ? "s" : ""}` : "—")}
      ${step(p.estado === "COBRADO" ? "done" : "", p.estado === "COBRADO" ? "check" : "", "Cobro", p.estado === "COBRADO" ? "Cobrado" : p.facturas > 0 ? "Pendiente" : "—")}
    </div>`;

    const lineas = p.lineas.map((l) => {
      const lhl = esHL() && l.es_hl;
      const g = (x, y) => (lhl ? fmtHL(x) : fmtCant(y));
      const av = lhl ? pct(l.hl_entregado, l.hl_pedido) : pct(l.cant_entregada, l.cant_pedida);
      return `<div class="linea">
        <div class="linea-top">
          <div><strong>${l.sin_factor ? ico("warn", "warn-ico") + " " : ""}${esc(l.sku_desc || l.artcode)}</strong>
            <small>${esc(l.artcode)} · <span class="pill cat-${esc(l.categoria)}">${esc(CATEGORIA[l.categoria] || l.categoria)}</span>${l.almacen ? ` · Alm. ${esc(l.almacen)}` : ""} · entrega ${fecha(l.fecha_entrega)}</small></div>
          <div class="row-val num"><b>${g(l.hl_pendiente, l.cant_pendiente)} <small>${lhl ? "HL" : "und"}</small></b><small>pendiente</small></div>
        </div>
        <div class="progreso"><span class="bar"><i style="width:${av}%"></i></span>
          <span class="num">${g(l.hl_entregado, l.cant_entregada)} / ${g(l.hl_pedido, l.cant_pedida)}${lhl ? ` · ${fmtCant(l.cant_pendiente)} und` : ""}</span></div>
      </div>`;
    }).join("");

    const facturas = p.facturas?.length
      ? `<div class="card"><div class="card-head"><h3>Facturas</h3></div><div class="scroll-x"><table class="tabla">
          <thead><tr><th>Factura</th><th>Fecha</th><th class="r">Importe</th><th class="r">Saldo</th></tr></thead>
          <tbody>${p.facturas.map((x) => `<tr><td>${esc(x.factura)}</td><td>${fecha(x.fecha)}</td><td class="r num">${nf(2).format(x.importe || 0)}</td>
            <td class="r num">${x.cobrada ? `<span class="estado e-COBRADO">Cobrada</span>` : nf(2).format(x.saldo || 0)}</td></tr>`).join("")}</tbody></table></div></div>`
      : "";
    const movs = p.movimientos?.length
      ? `<details class="card"><summary class="card-head" style="cursor:pointer"><h3>Movimientos contabilizados</h3><span class="muted">${n0(p.movimientos.length)}</span></summary>
          <div class="scroll-x"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>SKU</th><th class="r">Cant.</th><th class="r">Importe</th></tr></thead>
          <tbody>${p.movimientos.map((m) => `<tr><td>${fecha(m.fecha)}</td><td>${esc(m.tipo)}${m.factura ? `<br><small class="muted">${esc(m.factura)}</small>` : ""}</td><td>${esc(m.artcode || "")}</td>
            <td class="r num">${m.cantidad != null ? fmtCant(m.cantidad) : ""}</td><td class="r num">${m.importe != null ? nf(2).format(m.importe) : ""}</td></tr>`).join("")}</tbody></table></div></details>`
      : "";

    return `
      <div class="card det-head">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="estado e-${esc(p.estado)}">${esc(ESTADOS[p.estado] || p.estado)}</span>
          <span class="dias" style="--tc:${tc(p.tramo)}">${n0(p.dias)} días</span>
        </div>
        <div class="cli">${esc(p.cliente || "")}</div>
        <div class="meta"><span>Cliente ${esc(p.cliente_cod)}</span>${p.referencia ? `<span>Ref. ${esc(p.referencia)}</span>` : ""}
          <span>Pedido ${fechaLarga(p.fecha_pedido)}</span>
          <span style="${p.dias_atraso > 0 ? "color:var(--bad);font-weight:600" : ""}">Entrega ${fechaLarga(p.fecha_entrega)}${p.dias_atraso > 0 ? ` (${n0(p.dias_atraso)} d tarde)` : ""}</span></div>
      </div>
      ${steps}
      <div class="card tri">
        <div><small>Pedido</small><b class="num">${f(hl ? p.hl_pedido : p.cant_pedida)}</b> <small>${u}</small></div>
        <div><small>Entregado</small><b class="num">${f(hl ? p.hl_entregado : p.cant_entregada)}</b> <small>${u}</small></div>
        <div><small>Pendiente</small><b class="num" style="color:var(--bad)">${f(hl ? p.hl_pendiente : p.cant_pendiente)}</b> <small>${u}</small></div>
      </div>
      ${hl && p.und_pedidas > 0 ? `<p class="muted" style="margin:-4px 4px 0;font-size:13px">Además ${fmtCant(p.und_pendientes)} de ${fmtCant(p.und_pedidas)} unidades de SKU que no se miden en HL.</p>` : ""}
      <div class="card"><div class="card-head"><h3>Líneas</h3><span class="muted">${n0(p.lineas_pendientes)} de ${n0(p.lineas.length)} con pendiente</span></div>${lineas}</div>
      ${facturas}
      ${movs}
      <button class="btn btn-ghost btn-block" data-cliente="${esc(p.cliente_id)}" data-label="${esc(p.cliente || p.cliente_cod)}" data-cerrar-luego>Ver todos los pedidos de este cliente</button>`;
  }

  /* ---------- Ajustes ---------- */
  function abrirAjustes() {
    const s = S.sesion || {};
    abrirSheet("Ajustes", `
      <form class="card card-pad" id="form-ajustes" style="display:grid;gap:12px">
        <label class="field"><span>Actualización automática</span>
          <select id="a-refresco">${[[15, "Cada 15 segundos"], [30, "Cada 30 segundos"], [60, "Cada minuto"], [300, "Cada 5 minutos"], [0, "Solo manual"]]
            .map(([v, t]) => `<option value="${v}" ${Number(S.refresco) === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Apariencia</span>
          <select id="a-tema">${[["auto", "Automática (según el teléfono)"], ["light", "Clara"], ["dark", "Oscura"]]
            .map(([v, t]) => `<option value="${v}" ${S.tema === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Servidor de la API</span>
          <input id="a-servidor" type="url" value="${esc(S.servidor)}" placeholder="${NATIVO ? "http://192.168.1.20:8080" : "(este mismo servidor)"}"></label>
        <button class="btn btn-primary" type="submit">Guardar</button>
      </form>
      <div class="card"><ul class="rows">
        <li class="row"><span></span><span class="row-main"><strong>Usuario</strong><small>${esc(s.usuario || "—")}</small></span><span></span></li>
        <li class="row"><span></span><span class="row-main"><strong>Origen de datos</strong><small>${esc(s.modo === "demo" ? "Datos de demostración" : s.origen || "—")}</small></span><span></span></li>
        <li class="row"><span></span><span class="row-main"><strong>Servidor SQL</strong><small>${esc(s.servidor || "—")} · ${esc(s.bd || "")}</small></span><span></span></li>
        <li class="row"><span></span><span class="row-main"><strong>Caché del servidor</strong><small>${esc(s.ttl ?? "—")} s entre consultas a la base</small></span><span></span></li>
      </ul></div>
      <button class="btn btn-ghost btn-block" id="btn-salir" style="color:var(--bad)">Cerrar sesión</button>`);
    $("#form-ajustes").addEventListener("submit", (e) => {
      e.preventDefault();
      S.refresco = Number($("#a-refresco").value); store.set("refresco", S.refresco);
      S.tema = $("#a-tema").value; store.set("tema", S.tema); aplicarTema();
      const nuevo = $("#a-servidor").value.trim();
      if (nuevo !== S.servidor) { S.servidor = nuevo; store.set("servidor", nuevo); S.previo.clear(); }
      cerrarSheet(); toast("Ajustes guardados"); cargar();
    });
    $("#btn-salir").addEventListener("click", () => { cerrarSheet(); salir(); });
  }

  function aplicarTema() {
    if (S.tema === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", S.tema);
  }

  /* ---------- Filtros activos y navegación ---------- */
  function pintarActivos() {
    const f = S.f, chips = [];
    if (f.cliente) chips.push(["cliente", "Cliente", f.cliente.label]);
    if (f.sku) chips.push(["sku", "SKU", f.sku.label]);
    if (f.tramo) chips.push(["tramo", "Antigüedad", TRAMOS[f.tramo - 1].etiqueta]);
    $("#activos").innerHTML = chips.map(([k, t, v]) =>
      `<span class="chip-activo"><small>${t}</small><span>${esc(v)}</span><button data-quitar="${k}" aria-label="Quitar filtro ${t}">${ico("x")}</button></span>`).join("");
    $$("#cat button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cat === f.cat)));
    $$(".topbar [data-unidad]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.unidad === S.unidad)));
  }

  function irA(vista, { recargar = true } = {}) {
    if (!VISTAS[vista]) vista = "resumen";
    S.vista = vista; store.set("vista", vista);
    $$(".tabbar button").forEach((b) => (b.dataset.vista === vista ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    pintarActivos();
    window.scrollTo({ top: 0 });
    if (recargar) cargar();
  }

  function setFiltro(k, v, vista) {
    S.f[k] = v;
    if (vista && vista !== S.vista) irA(vista); else { pintarActivos(); cargar(); }
  }

  /* ---------- Eventos ---------- */
  function eventos() {
    document.addEventListener("click", (e) => {
      const t = e.target.closest("button, [data-cerrar]");
      if (!t) return;
      const d = t.dataset;
      if (d.cerrar !== undefined) return cerrarSheet();
      if (d.vista) return irA(d.vista);
      if (d.vistaIr) return irA(d.vistaIr);
      if (d.unidad) { S.unidad = d.unidad; store.set("unidad", S.unidad); S.previo.clear(); pintarActivos(); return cargar(); }
      if (d.cat !== undefined && t.closest("#cat")) return setFiltro("cat", d.cat);
      if (d.quitar) return setFiltro(d.quitar, null);
      if (d.irTramo) { S.f.estado = ""; return setFiltro("tramo", Number(d.irTramo), "pedidos"); }
      if (d.irOrden) { S.f.orden = d.irOrden; S.f.estado = ""; return irA("pedidos"); }
      if (d.irEstado !== undefined) { S.f.estado = d.irEstado; return irA("pedidos"); }
      if (d.tramo !== undefined) return setFiltro("tramo", d.tramo ? Number(d.tramo) : null);
      if (d.pedido) return abrirPedido(d.pedido);
      if (d.cliente) { if (d.cerrarLuego !== undefined) cerrarSheet(); return setFiltro("cliente", { id: d.cliente, label: d.label }, "pedidos"); }
      if (d.sku) return setFiltro("sku", { id: d.sku, label: d.label }, "pedidos");
      if (t.id === "btn-mas") { t.disabled = true; t.textContent = "Cargando…"; return cargarPedidos({ mas: true }).catch((err) => { toast(err.message); pintarListaPedidos(); }); }
      if (t.id === "btn-refresh") return cargar();
      if (t.id === "btn-ajustes") return abrirAjustes();
    });
    document.addEventListener("change", (e) => {
      if (e.target.id === "sel-estado") setFiltro("estado", e.target.value);
      if (e.target.id === "sel-orden") setFiltro("orden", e.target.value);
      if (e.target.id === "sel-orden-grupo") { S.ordenGrupo = e.target.value; cargar(); }
    });
    let tq;
    $("#q").addEventListener("input", (e) => {
      clearTimeout(tq);
      tq = setTimeout(() => { S.f.q = e.target.value.trim(); cargar(); }, 350);
    });
    window.addEventListener("popstate", () => cerrarSheet(true));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarSheet(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && S.token) cargar({ silencioso: true }); });
    window.addEventListener("online", () => cargar({ silencioso: true }));

    // Reloj: indicador "en vivo" y refresco automático
    setInterval(() => {
      pintarLive();
      if (!S.token || document.hidden || !S.refresco || S.cargando) return;
      if (Date.now() - S.ultimaCarga >= S.refresco * 1000) cargar({ silencioso: true });
    }, 1000);
  }

  /* ---------- Sesión ---------- */
  function mostrarLogin(msg = "") {
    $("#shell").hidden = true;
    $("#login").hidden = false;
    $("#login-error").textContent = msg;
    $("#l-servidor").value = S.servidor;
    $("#campo-servidor").hidden = !(NATIVO || S.servidor);
    $("#l-mostrar-servidor").hidden = !$("#campo-servidor").hidden;
    setTimeout(() => (NATIVO && !S.servidor ? $("#l-servidor") : $("#l-token")).focus(), 50);
  }

  function salir(msg) {
    S.token = ""; store.del("token"); S.previo.clear();
    mostrarLogin(msg);
  }

  async function entrar() {
    try {
      const res = await fetch(base() + "/api/sesion", { headers: { Authorization: "Bearer " + S.token } });
      if (res.status === 401) return false;
      const j = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 503) throw new Error(j.error || `Error ${res.status}`);
      S.sesion = j;
      if (res.status === 503) toast("El servidor responde, pero no llega a SQL Server: " + (j.detalle || ""));
      return true;
    } catch (e) {
      // Sin red: si ya había sesión guardada, se entra en modo sin conexión.
      if (store.get("cidx", []).length) { estadoRed("off", e.message, Date.now()); return true; }
      throw e;
    }
  }

  async function iniciarApp() {
    $("#login").hidden = true;
    $("#shell").hidden = false;
    irA(S.vista);
  }

  async function init() {
    document.title = CFG.marca;
    $("#marca").textContent = CFG.marca;
    $("#login-marca").textContent = CFG.marca;
    aplicarTema();
    eventos();

    $("#l-mostrar-servidor").addEventListener("click", () => { $("#campo-servidor").hidden = false; $("#l-mostrar-servidor").hidden = true; $("#l-servidor").focus(); });
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter || $("#login-form .btn-primary");
      btn.disabled = true;
      $("#login-error").textContent = "";
      S.servidor = $("#l-servidor").value.trim(); store.set("servidor", S.servidor);
      S.token = $("#l-token").value.trim();
      try {
        if (NATIVO && !S.servidor) throw new Error("Escribe la dirección del servidor de la API.");
        if (!(await entrar())) { S.token = ""; $("#login-error").textContent = "Código de acceso incorrecto."; return; }
        store.set("token", S.token);
        iniciarApp();
      } catch (err) {
        $("#login-error").textContent = "No se pudo conectar: " + err.message;
      } finally { btn.disabled = false; }
    });

    if (!S.token) return mostrarLogin();
    try {
      if (await entrar()) iniciarApp(); else salir("Tu código de acceso ya no es válido.");
    } catch (e) { mostrarLogin("No se pudo conectar: " + e.message); }
  }

  if ("serviceWorker" in navigator && !NATIVO && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* sin SW: la app funciona igual */ });
  }
  init();
})();
