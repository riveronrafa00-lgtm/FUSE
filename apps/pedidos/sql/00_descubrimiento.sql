/* =====================================================================
   00 · DESCUBRIMIENTO (solo lectura)  ·  Servidor: cmch-dc1  ·  BD: [900]
   ---------------------------------------------------------------------
   Ejecútalo PRIMERO en SSMS. No modifica nada. Sirve para confirmar los
   nombres reales de las columnas antes de crear las vistas (03_vistas.sql).
   Si algún nombre no coincide, el único lugar que hay que tocar es la
   vista app.v_linea (marcado con  >>> AJUSTAR).
   ===================================================================== */
USE [900];
GO

-- 1) Versión de SQL Server (las vistas requieren 2012 o superior: TRY_CONVERT, OFFSET/FETCH)
SELECT @@VERSION AS version_sql,
       DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS collation_bd_900;

-- 2) ¿Existen las tablas que usa la app? (orhkrg/orhsrg = histórico de pedidos ya procesados)
SELECT t.name AS tabla, SUM(p.rows) AS filas
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.name IN ('orkrg','orsrg','orhkrg','orhsrg','gbkmut','grtbk','cicmpy','items','btwtrs','dagbk','pwmagaz')
GROUP BY t.name
ORDER BY t.name;

-- 3) Columnas de cabecera y líneas de pedido. Confirma estas:
--    orkrg: ordernr, ord_soort, debnr, orddat, afldat, refer
--    orsrg: ordernr, regel, artcode, esr_aantal (pedida), aant_gelev (entregada), afldat, magcode
SELECT c.TABLE_NAME, c.ORDINAL_POSITION, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME IN ('orkrg', 'orsrg')
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

-- 4) Columnas de cantidades candidatas en orsrg (por si no es esr_aantal / aant_gelev)
SELECT c.COLUMN_NAME, c.DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME = 'orsrg'
  AND (c.COLUMN_NAME LIKE '%aant%' OR c.COLUMN_NAME LIKE '%qty%' OR c.COLUMN_NAME LIKE '%gelev%'
       OR c.COLUMN_NAME LIKE '%afgeh%' OR c.COLUMN_NAME LIKE '%stat%');

-- 5) Muestra de 20 líneas de pedidos de venta abiertos: compara con lo que ves en Exact
SELECT TOP (20)
       k.ordernr, k.ord_soort, k.debnr, k.orddat, k.afldat, k.refer,
       s.regel, s.artcode, s.esr_aantal, s.aant_gelev, s.afldat AS afldat_linea, s.magcode
FROM dbo.orkrg k
JOIN dbo.orsrg s ON s.ordernr = k.ordernr
WHERE k.ord_soort = 'V'
ORDER BY k.orddat DESC;

-- 6) Columnas de items que podrían traer el volumen/litros del artículo (para el factor HL)
SELECT c.COLUMN_NAME, c.DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME = 'items'
  AND (c.COLUMN_NAME LIKE '%vol%' OR c.COLUMN_NAME LIKE '%litr%' OR c.COLUMN_NAME LIKE '%inhoud%'
       OR c.COLUMN_NAME LIKE '%content%' OR c.COLUMN_NAME LIKE '%weight%' OR c.COLUMN_NAME LIKE '%unit%'
       OR c.COLUMN_NAME LIKE '%class%' OR c.COLUMN_NAME LIKE '%assortment%' OR c.COLUMN_NAME LIKE '%package%');

-- 7) Artículos con pedidos de venta abiertos y su descripción (base del catálogo HL)
SELECT s.artcode, MAX(i.description) AS descripcion, COUNT(*) AS lineas_abiertas
FROM dbo.orkrg k
JOIN dbo.orsrg s ON s.ordernr = k.ordernr
LEFT JOIN dbo.items i ON i.itemcode = s.artcode
WHERE k.ord_soort = 'V'
GROUP BY s.artcode
ORDER BY lineas_abiertas DESC;

-- 8) Índices que ya existen en las tablas grandes (para no duplicar en 05_indices.sql)
SELECT OBJECT_NAME(i.object_id) AS tabla, i.name AS indice, i.type_desc,
       STUFF((SELECT ', ' + c.name
              FROM sys.index_columns ic JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS columnas_clave
FROM sys.indexes i
WHERE OBJECT_NAME(i.object_id) IN ('gbkmut', 'orkrg', 'orsrg') AND i.type > 0
ORDER BY tabla, indice;
