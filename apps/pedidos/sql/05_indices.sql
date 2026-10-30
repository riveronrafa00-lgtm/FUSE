/* =====================================================================
   05 · ÍNDICES DE APOYO EN [900]  (OPCIONAL, coordinar con el partner de Exact)
   ---------------------------------------------------------------------
   Antes de ejecutar: revisa el punto 8 de 00_descubrimiento.sql. Si ya
   existe un índice que empiece por las mismas columnas, NO crees el nuevo.

   Reglas que sigue este script:
     - Prefijo IX_APP_ para identificarlos (y poder borrarlos) fácilmente.
     - Sin índices filtrados: exigen opciones SET que el cliente de Exact
       podría no usar y harían fallar sus INSERT. Solo índices normales.
     - Ejecútalo fuera del horario de trabajo (bloquea la tabla mientras
       crea el índice). En edición Enterprise puedes añadir ONLINE = ON.
     - Tras una actualización de Exact, verifica que sigan existiendo.
   ===================================================================== */
USE [900];
GO

-- Pedido -> sus facturas/entregas (estado del pedido y detalle)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_gbkmut_bkstnr_sub' AND object_id = OBJECT_ID('dbo.gbkmut'))
    CREATE NONCLUSTERED INDEX IX_APP_gbkmut_bkstnr_sub
        ON dbo.gbkmut (bkstnr_sub)
        INCLUDE (faktuurnr, transtype, reknr)
        WITH (SORT_IN_TEMPDB = ON);
GO

-- Factura -> saldo en deudores (cobrada / no cobrada)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_gbkmut_faktuurnr' AND object_id = OBJECT_ID('dbo.gbkmut'))
    CREATE NONCLUSTERED INDEX IX_APP_gbkmut_faktuurnr
        ON dbo.gbkmut (faktuurnr, reknr)
        INCLUDE (bdr_hfl, transtype, datum)
        WITH (SORT_IN_TEMPDB = ON);
GO

-- Kardex por artículo / cuenta / fecha
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_gbkmut_art_cta_fecha' AND object_id = OBJECT_ID('dbo.gbkmut'))
    CREATE NONCLUSTERED INDEX IX_APP_gbkmut_art_cta_fecha
        ON dbo.gbkmut (artcode, reknr, datum)
        INCLUDE (warehouse, transtype, remindercount, debnr, aantal, bdr_hfl, faktuurnr)
        WITH (SORT_IN_TEMPDB = ON);
GO

-- Pedidos de venta por cliente y por fecha (filtros de la app)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_orkrg_soort_debnr' AND object_id = OBJECT_ID('dbo.orkrg'))
    CREATE NONCLUSTERED INDEX IX_APP_orkrg_soort_debnr
        ON dbo.orkrg (ord_soort, debnr, orddat)
        INCLUDE (afldat, refer)
        WITH (SORT_IN_TEMPDB = ON);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_orkrg_soort_fecha' AND object_id = OBJECT_ID('dbo.orkrg'))
    CREATE NONCLUSTERED INDEX IX_APP_orkrg_soort_fecha
        ON dbo.orkrg (ord_soort, orddat)
        INCLUDE (debnr, afldat, refer)
        WITH (SORT_IN_TEMPDB = ON);
GO

-- Líneas por SKU (filtro por SKU)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_APP_orsrg_artcode' AND object_id = OBJECT_ID('dbo.orsrg'))
    CREATE NONCLUSTERED INDEX IX_APP_orsrg_artcode
        ON dbo.orsrg (artcode, ordernr)
        INCLUDE (esr_aantal, aant_gelev, afldat, magcode)
        WITH (SORT_IN_TEMPDB = ON);
GO

/* Para revertir:
DROP INDEX IX_APP_gbkmut_bkstnr_sub    ON dbo.gbkmut;
DROP INDEX IX_APP_gbkmut_faktuurnr     ON dbo.gbkmut;
DROP INDEX IX_APP_gbkmut_art_cta_fecha ON dbo.gbkmut;
DROP INDEX IX_APP_orkrg_soort_debnr    ON dbo.orkrg;
DROP INDEX IX_APP_orkrg_soort_fecha    ON dbo.orkrg;
DROP INDEX IX_APP_orsrg_artcode        ON dbo.orsrg;
*/
