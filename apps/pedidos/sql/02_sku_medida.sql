/* =====================================================================
   02 · CATÁLOGO DE UNIDAD DE MEDIDA POR SKU (factor a hectolitros)
   ---------------------------------------------------------------------
   Cerveza y malta se miden en HL. Promocionales y otros artículos NO se
   convierten: se muestran en unidades. Esta tabla le dice a la app qué
   es cada SKU y cuántos litros tiene UNA unidad de venta.

     HL = cantidad × litros_unidad / 100

     Ejemplos de litros_unidad:
       Caja 24 latas × 355 ml   ->  8.52
       Caja 24 botellas × 330ml ->  7.92
       Barril 50 L              -> 50
       Lata suelta 355 ml       ->  0.355

   Paso a paso:
     1) Ejecuta este script: crea la tabla y la PRE-LLENA con una
        sugerencia leída de la descripción del artículo (p. ej. "24X355ML").
     2) Revisa la consulta del final (SKU de cerveza/malta sin factor o con
        factor sugerido) y corrige con UPDATE o desde Excel.
     3) Repite el paso 1 cuando haya SKU nuevos: solo agrega los que faltan,
        nunca pisa lo que ya corregiste.
   ===================================================================== */
USE PedidosApp;
GO

IF OBJECT_ID(N'app.sku_medida', N'U') IS NULL
CREATE TABLE app.sku_medida
(
    artcode        varchar(30)    NOT NULL CONSTRAINT PK_sku_medida PRIMARY KEY,   -- = items.itemcode
    categoria      varchar(12)    NOT NULL
                   CONSTRAINT CK_sku_medida_cat CHECK (categoria IN ('CERVEZA', 'MALTA', 'PROMOCIONAL', 'OTRO')),
    litros_unidad  decimal(12, 5) NULL
                   CONSTRAINT CK_sku_medida_litros CHECK (litros_unidad IS NULL OR litros_unidad > 0),
    formato        varchar(60)    NULL,          -- texto libre: "Lata 355 ml × 24"
    origen         varchar(10)    NOT NULL CONSTRAINT DF_sku_medida_origen DEFAULT ('SUGERIDO'),  -- SUGERIDO | REVISADO
    actualizado    datetime2(0)   NOT NULL CONSTRAINT DF_sku_medida_act DEFAULT (SYSDATETIME())
);
GO

/* ---- Funciones auxiliares para sugerir los litros desde la descripción ---- */
IF OBJECT_ID(N'app.fn_num_antes') IS NULL EXEC (N'CREATE FUNCTION app.fn_num_antes() RETURNS int AS BEGIN RETURN 1 END');
GO
ALTER FUNCTION app.fn_num_antes (@t varchar(200), @fin int)
RETURNS decimal(12, 3)
AS
BEGIN
    DECLARE @i int = @fin;
    WHILE @i > 0 AND SUBSTRING(@t, @i, 1) LIKE '[0-9.,]' SET @i -= 1;
    RETURN TRY_CONVERT(decimal(12, 3), REPLACE(SUBSTRING(@t, @i + 1, @fin - @i), ',', '.'));
END;
GO

IF OBJECT_ID(N'app.fn_num_despues') IS NULL EXEC (N'CREATE FUNCTION app.fn_num_despues() RETURNS int AS BEGIN RETURN 1 END');
GO
ALTER FUNCTION app.fn_num_despues (@t varchar(200), @ini int)
RETURNS decimal(12, 3)
AS
BEGIN
    DECLARE @i int = @ini;
    WHILE @i <= LEN(@t) AND SUBSTRING(@t, @i, 1) LIKE '[0-9.,]' SET @i += 1;
    RETURN TRY_CONVERT(decimal(12, 3), REPLACE(SUBSTRING(@t, @ini, @i - @ini), ',', '.'));
END;
GO

/* Reconoce "24X355ML", "24 x 355 ml", "355MLX24", "CAJA 12X1L", "BARRIL 50L", "LATA 355ML".
   Devuelve litros por unidad de venta o NULL si no puede deducirlo. Es solo una SUGERENCIA. */
IF OBJECT_ID(N'app.fn_litros_sugeridos') IS NULL EXEC (N'CREATE FUNCTION app.fn_litros_sugeridos() RETURNS int AS BEGIN RETURN 1 END');
GO
ALTER FUNCTION app.fn_litros_sugeridos (@descripcion varchar(200))
RETURNS decimal(12, 5)
AS
BEGIN
    DECLARE @t varchar(200) = UPPER(REPLACE(ISNULL(@descripcion, ''), ' ', '')) + '#';
    DECLARE @p int, @litros decimal(12, 5), @pack decimal(12, 3) = 1;

    SET @p = PATINDEX('%[0-9]ML[^A-Z]%', @t);                          -- mililitros
    IF @p > 0 SET @litros = app.fn_num_antes(@t, @p) / 1000.0;
    ELSE
    BEGIN
        SET @p = PATINDEX('%[0-9]L[^A-Z]%', @t);                       -- litros ("1L", "1.5L", "50L")
        IF @p = 0 SET @p = PATINDEX('%[0-9]LT[^A-Z]%', @t);
        IF @p = 0 SET @p = PATINDEX('%[0-9]LTS[^A-Z]%', @t);
        IF @p > 0 SET @litros = app.fn_num_antes(@t, @p);
    END;
    IF @litros IS NULL OR @litros <= 0 RETURN NULL;

    DECLARE @x int = PATINDEX('%[0-9]X[0-9]%', @t);                    -- "24X355ML"
    IF @x > 0 AND @x < @p SET @pack = app.fn_num_antes(@t, @x);
    ELSE
    BEGIN
        SET @x = PATINDEX('%[LT]X[0-9]%', @t);                         -- "355MLX24", "1LX12"
        IF @x > 0 SET @pack = app.fn_num_despues(@t, @x + 2);
    END;

    RETURN @litros * ISNULL(NULLIF(@pack, 0), 1);
END;
GO

/* ---- Pre-llenado: artículos con pedidos de venta, que aún no están en la tabla ---- */
INSERT INTO app.sku_medida (artcode, categoria, litros_unidad, formato, origen)
SELECT  a.artcode,
        CASE WHEN a.descripcion LIKE '%MALTA%'                     THEN 'MALTA'
             WHEN a.descripcion LIKE '%CERV%' OR a.descripcion LIKE '%BEER%' THEN 'CERVEZA'
             WHEN a.descripcion LIKE '%PROMO%' OR a.descripcion LIKE '%POP%'
               OR a.descripcion LIKE '%GORRA%' OR a.descripcion LIKE '%POMO%'
               OR a.descripcion LIKE '%VASO%'  OR a.descripcion LIKE '%CAMISET%' THEN 'PROMOCIONAL'
             ELSE 'OTRO' END,
        CASE WHEN a.descripcion LIKE '%MALTA%' OR a.descripcion LIKE '%CERV%' OR a.descripcion LIKE '%BEER%'
             THEN app.fn_litros_sugeridos(a.descripcion) END,
        LEFT(a.descripcion, 60),
        'SUGERIDO'
FROM (
        SELECT s.artcode, MAX(CONVERT(varchar(200), i.description)) AS descripcion
        FROM src.orsrg s
        JOIN src.orkrg k ON k.ordernr = s.ordernr AND k.ord_soort = 'V'
        LEFT JOIN src.items i ON i.itemcode = s.artcode
        WHERE s.artcode IS NOT NULL
        GROUP BY s.artcode
     ) AS a
WHERE NOT EXISTS (SELECT 1 FROM app.sku_medida m WHERE m.artcode = a.artcode);
GO

/* ---- REVISIÓN: corrige lo que aparezca aquí ---- */
SELECT m.artcode, m.categoria, m.litros_unidad, m.formato, m.origen,
       CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') AND m.litros_unidad IS NULL THEN 'FALTA FACTOR HL'
            WHEN m.origen = 'SUGERIDO' THEN 'Revisar sugerencia' ELSE 'OK' END AS accion
FROM app.sku_medida m
ORDER BY CASE WHEN m.categoria IN ('CERVEZA', 'MALTA') THEN 0 ELSE 1 END, accion, m.artcode;

/* Ejemplos de corrección (descomenta y ajusta):
UPDATE app.sku_medida SET categoria = 'CERVEZA', litros_unidad = 8.52, formato = 'Lata 355 ml × 24',
       origen = 'REVISADO', actualizado = SYSDATETIME()
WHERE artcode = '71020000000000000000';

UPDATE app.sku_medida SET categoria = 'PROMOCIONAL', litros_unidad = NULL, origen = 'REVISADO', actualizado = SYSDATETIME()
WHERE artcode IN ('XXXXXXXX', 'YYYYYYYY');
*/
