/* =====================================================================
   07 · PRUEBAS Y CONSULTAS DE EJEMPLO (las mismas que lanza la API)
   ===================================================================== */
USE PedidosApp;
GO
SET STATISTICS TIME, IO ON;   -- mira en "Mensajes" cuánto tarda y cuántas lecturas hace

-- Cartera pendiente total por categoría
SELECT categoria, COUNT(DISTINCT ordernr) AS pedidos,
       SUM(hl_pendiente) AS hl_pendiente, SUM(cant_pendiente) AS cant_pendiente
FROM app.v_linea
WHERE cant_pendiente > 0
GROUP BY categoria;

-- Antigüedad (tramos) en HL y en unidades
SELECT tramo, COUNT(DISTINCT ordernr) AS pedidos,
       SUM(hl_pendiente) AS hl,
       SUM(CASE WHEN es_hl = 0 THEN cant_pendiente END) AS unidades
FROM app.v_linea
WHERE cant_pendiente > 0
GROUP BY tramo
ORDER BY tramo;

-- Pedidos pendientes de un cliente (parámetro)
DECLARE @debcode varchar(20) = '1001';         -- código de cliente visible en Exact
SELECT pedido, fecha_pedido, dias, estado, hl_pendiente, und_pendientes, facturas
FROM app.v_pedido_estado
WHERE cliente_cod = @debcode AND cant_pendiente > 0
ORDER BY fecha_pedido;

-- Pedidos que contienen un SKU y llevan más de 30 días
DECLARE @sku varchar(30) = '71020000000000000000';
SELECT p.pedido, p.cliente, p.dias, p.hl_pendiente
FROM app.v_pedido_estado p
WHERE p.fecha_pedido < DATEADD(day, -30, CONVERT(date, GETDATE()))
  AND EXISTS (SELECT 1 FROM app.v_linea l WHERE l.ordernr = p.ordernr AND l.artcode = @sku AND l.cant_pendiente > 0)
ORDER BY p.dias DESC;

-- Tu consulta original, ahora parametrizada
SELECT * FROM app.fn_kardex('71020000000000000000', '189000004', 'A410', 60683,
                            '2026-05-01', '2026-06-08', 12, NULL)
ORDER BY datum, periode, faktuurnr, ID
OPTION (RECOMPILE);

-- SKU de cerveza/malta sin factor HL (la app los marca con un aviso)
SELECT DISTINCT artcode, sku_desc, categoria FROM app.v_linea WHERE sin_factor = 1;
