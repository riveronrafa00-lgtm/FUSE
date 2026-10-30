/* =====================================================================
   03 · VISTAS DE PEDIDOS  ·  PedidosApp -> [900] (cmch-dc1)
   ---------------------------------------------------------------------
   Las vistas NO llevan valores fijos: la app les aplica los filtros
   (cliente, SKU, antigüedad, fechas, estado) como parámetros en el WHERE,
   y SQL Server los empuja hasta los índices de orkrg/orsrg/gbkmut.

     app.v_linea           1 fila por línea de pedido de venta abierto (cantidades + HL)
     app.v_pedido          1 fila por pedido (totales)
     app.v_factura_saldo   1 fila por factura: saldo en cuentas de deudores (0 = cobrada)
     app.v_pedido_estado   v_pedido + facturación/cobro + estado del ciclo
     app.v_pedido_factura  facturas de cada pedido con su saldo
     app.v_pedido_mov      movimientos contables/inventario ligados a un pedido (trazabilidad)

   Ciclo:  PENDIENTE -> PARCIAL -> ENTREGADO -> FACTURADO -> COBRADO
   Tramos de antigüedad (días desde la fecha del pedido):
     1: 0-7 · 2: 8-15 · 3: 16-30 · 4: 31-60 · 5: más de 60
   ===================================================================== */
USE PedidosApp;
GO

/* ---------------------------------------------------------------------
   Líneas. >>> AJUSTAR aquí si 00_descubrimiento.sql muestra otros nombres.
   orkrg/orsrg contienen los pedidos ABIERTOS; Exact pasa los ya procesados
   por completo a orhkrg/orhsrg (histórico), por eso esta vista es la cartera.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_linea') IS NULL EXEC (N'CREATE VIEW app.v_linea AS SELECT 1 AS x');
GO
ALTER VIEW app.v_linea
AS
SELECT  k.ordernr                                       AS ordernr,          -- clave cruda (char con espacios)
        LTRIM(RTRIM(k.ordernr))                         AS pedido,           -- para mostrar
        CONVERT(date, k.orddat)                         AS fecha_pedido,
        CONVERT(date, COALESCE(s.afldat, k.afldat))     AS fecha_entrega,
        k.debnr                                         AS debnr,            -- clave cruda del cliente
        LTRIM(RTRIM(c.debcode))                         AS cliente_cod,
        LTRIM(RTRIM(c.cmp_name))                        AS cliente,
        LTRIM(RTRIM(k.refer))                           AS referencia,
        s.regel                                         AS linea,
        s.artcode                                       AS artcode,
        LTRIM(RTRIM(CONVERT(varchar(200), i.description))) AS sku_desc,
        s.magcode                                       AS almacen,
        ISNULL(m.categoria, 'OTRO')                     AS categoria,
        m.litros_unidad                                 AS litros_unidad,
        CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') AND m.litros_unidad > 0 THEN 1 ELSE 0 END AS es_hl,
        CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') AND m.litros_unidad IS NULL THEN 1 ELSE 0 END AS sin_factor,
        q.pedida                                        AS cant_pedida,
        q.entregada                                     AS cant_entregada,
        q.pendiente                                     AS cant_pendiente,
        CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') THEN q.pedida    * m.litros_unidad / 100.0 END AS hl_pedido,
        CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') THEN q.entregada * m.litros_unidad / 100.0 END AS hl_entregado,
        CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') THEN q.pendiente * m.litros_unidad / 100.0 END AS hl_pendiente,
        d.dias                                          AS dias,
        CASE WHEN d.dias <= 7 THEN 1 WHEN d.dias <= 15 THEN 2 WHEN d.dias <= 30 THEN 3
             WHEN d.dias <= 60 THEN 4 ELSE 5 END        AS tramo
FROM src.orkrg k
JOIN src.orsrg s            ON s.ordernr = k.ordernr
LEFT JOIN src.cicmpy c      ON c.debnr = k.debnr AND k.debnr IS NOT NULL AND c.debnr IS NOT NULL
LEFT JOIN src.items i       ON i.itemcode = s.artcode
LEFT JOIN app.sku_medida m  ON m.artcode = s.artcode
CROSS APPLY (SELECT CONVERT(decimal(18, 4), ISNULL(s.esr_aantal, 0)) AS pedida,       -- >>> AJUSTAR: cantidad pedida
                    CONVERT(decimal(18, 4), ISNULL(s.aant_gelev, 0)) AS entregada     -- >>> AJUSTAR: cantidad entregada
            ) AS q0
CROSS APPLY (SELECT q0.pedida, q0.entregada,
                    CASE WHEN q0.pedida > q0.entregada AND q0.pedida > 0 THEN q0.pedida - q0.entregada ELSE 0 END AS pendiente
            ) AS q
CROSS APPLY (SELECT DATEDIFF(day, k.orddat, GETDATE()) AS dias) AS d
WHERE k.ord_soort = 'V'                 -- solo pedidos de venta
  AND s.artcode IS NOT NULL             -- descarta líneas de texto
  AND ISNULL(s.esr_aantal, 0) <> 0;     -- >>> AJUSTAR si cambia el nombre de la cantidad
GO

/* ---------------------------------------------------------------------
   Pedido (cabecera + totales). HL y unidades NUNCA se suman entre sí:
   hl_* = cerveza + malta con factor; und_* = todo lo que no va en HL.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_pedido') IS NULL EXEC (N'CREATE VIEW app.v_pedido AS SELECT 1 AS x');
GO
ALTER VIEW app.v_pedido
AS
SELECT  l.ordernr, l.pedido, l.fecha_pedido, l.debnr, l.cliente_cod, l.cliente, l.referencia,
        l.dias, l.tramo,
        MIN(l.fecha_entrega)                                                    AS fecha_entrega,
        COUNT(*)                                                                AS lineas,
        SUM(CASE WHEN l.cant_pendiente > 0 THEN 1 ELSE 0 END)                   AS lineas_pendientes,
        SUM(l.sin_factor)                                                       AS lineas_sin_factor,
        SUM(l.cant_pedida)                                                      AS cant_pedida,
        SUM(l.cant_entregada)                                                   AS cant_entregada,
        SUM(l.cant_pendiente)                                                   AS cant_pendiente,
        ISNULL(SUM(l.hl_pedido), 0)                                             AS hl_pedido,
        ISNULL(SUM(l.hl_entregado), 0)                                          AS hl_entregado,
        ISNULL(SUM(l.hl_pendiente), 0)                                          AS hl_pendiente,
        SUM(CASE WHEN l.es_hl = 0 THEN l.cant_pedida    ELSE 0 END)             AS und_pedidas,
        SUM(CASE WHEN l.es_hl = 0 THEN l.cant_entregada ELSE 0 END)             AS und_entregadas,
        SUM(CASE WHEN l.es_hl = 0 THEN l.cant_pendiente ELSE 0 END)             AS und_pendientes
FROM app.v_linea l
GROUP BY l.ordernr, l.pedido, l.fecha_pedido, l.debnr, l.cliente_cod, l.cliente, l.referencia, l.dias, l.tramo;
GO

/* ---------------------------------------------------------------------
   Saldo por factura (corrige el "paid" original):
   - se calcula UNA vez por factura (no una subconsulta por fila),
   - suma SOLO cuentas de deudores (grtbk.omzrek = 'D'),
   - saldo 0 = cobrada.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_factura_saldo') IS NULL EXEC (N'CREATE VIEW app.v_factura_saldo AS SELECT 1 AS x');
GO
ALTER VIEW app.v_factura_saldo
AS
SELECT  g.faktuurnr,
        MIN(g.datum)       AS fecha,
        SUM(g.bdr_hfl)     AS saldo,
        SUM(CASE WHEN g.bdr_hfl > 0 THEN g.bdr_hfl ELSE 0 END) AS importe,
        CASE WHEN SUM(g.bdr_hfl) = 0 THEN 1 ELSE 0 END         AS cobrada
FROM src.gbkmut g
JOIN src.grtbk r ON r.reknr = g.reknr AND r.omzrek = 'D'
WHERE g.transtype IN ('X', 'N', 'C', 'P')
  AND g.faktuurnr IS NOT NULL
GROUP BY g.faktuurnr;
GO

/* ---------------------------------------------------------------------
   Pedido con estado de ciclo completo.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_pedido_estado') IS NULL EXEC (N'CREATE VIEW app.v_pedido_estado AS SELECT 1 AS x');
GO
ALTER VIEW app.v_pedido_estado
AS
SELECT  p.*,
        ISNULL(f.facturas, 0)                           AS facturas,
        f.primera_factura,
        f.saldo_facturas,
        CASE WHEN p.cant_pendiente > 0 AND p.fecha_entrega < CONVERT(date, GETDATE())
             THEN DATEDIFF(day, p.fecha_entrega, GETDATE()) ELSE 0 END AS dias_atraso,
        CASE WHEN p.cant_entregada = 0               THEN 'PENDIENTE'
             WHEN p.cant_pendiente > 0               THEN 'PARCIAL'
             WHEN ISNULL(f.facturas, 0) = 0          THEN 'ENTREGADO'
             WHEN ISNULL(f.saldo_facturas, 0) <> 0   THEN 'FACTURADO'
             ELSE 'COBRADO' END                        AS estado
FROM app.v_pedido p
OUTER APPLY (
        SELECT COUNT(*)            AS facturas,
               MIN(x.faktuurnr)    AS primera_factura,
               SUM(fs.saldo)       AS saldo_facturas
        FROM (SELECT DISTINCT g.faktuurnr
              FROM src.gbkmut g
              WHERE g.bkstnr_sub = p.ordernr
                AND g.faktuurnr IS NOT NULL AND g.faktuurnr <> ''
                AND g.transtype IN ('X', 'N', 'C', 'P')) AS x
        LEFT JOIN app.v_factura_saldo fs ON fs.faktuurnr = x.faktuurnr
) AS f;
GO

/* ---------------------------------------------------------------------
   Facturas de un pedido con su saldo. Úsala con WHERE ordernr = @pedido.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_pedido_factura') IS NULL EXEC (N'CREATE VIEW app.v_pedido_factura AS SELECT 1 AS x');
GO
ALTER VIEW app.v_pedido_factura
AS
SELECT  x.ordernr,
        LTRIM(RTRIM(x.faktuurnr))   AS factura,
        fs.fecha, fs.importe, fs.saldo, ISNULL(fs.cobrada, 0) AS cobrada
FROM (SELECT DISTINCT g.bkstnr_sub AS ordernr, g.faktuurnr
      FROM src.gbkmut g
      WHERE g.bkstnr_sub IS NOT NULL
        AND g.faktuurnr IS NOT NULL AND g.faktuurnr <> ''
        AND g.transtype IN ('X', 'N', 'C', 'P')) AS x
LEFT JOIN app.v_factura_saldo fs ON fs.faktuurnr = x.faktuurnr;
GO

/* ---------------------------------------------------------------------
   Movimientos de un pedido (entregas y facturas contabilizadas).
   Úsala SIEMPRE con WHERE ordernr = @pedido.
   --------------------------------------------------------------------- */
IF OBJECT_ID(N'app.v_pedido_mov') IS NULL EXEC (N'CREATE VIEW app.v_pedido_mov AS SELECT 1 AS x');
GO
ALTER VIEW app.v_pedido_mov
AS
SELECT  g.bkstnr_sub                AS ordernr,
        g.ID                        AS id,
        CONVERT(date, g.datum)      AS fecha,
        LTRIM(RTRIM(g.faktuurnr))   AS factura,
        LTRIM(RTRIM(g.bkstnr))      AS asiento,
        g.artcode,
        g.warehouse                 AS almacen,
        g.aantal                    AS cantidad,
        g.bdr_hfl                   AS importe,
        g.valcode                   AS moneda,
        g.transsubtype,
        CASE WHEN r.omzrek = 'D'                       THEN 'Factura / cobro'
             WHEN r.omzrek IN ('J', 'G', 'K', 'N')     THEN 'Entrega (inventario)'
             ELSE 'Contable' END    AS tipo,
        LTRIM(RTRIM(g.oms25))       AS descripcion
FROM src.gbkmut g
JOIN src.grtbk r ON r.reknr = g.reknr
WHERE g.transtype IN ('X', 'N', 'C', 'P')
  AND g.bkstnr_sub IS NOT NULL;
GO
