/* =====================================================================
   04 · KARDEX PARAMETRIZADO (tu consulta original, como función)
   ---------------------------------------------------------------------
   Misma salida y mismas columnas que la consulta de partida, pero:
     - Los valores fijos (artículo, cuenta, almacén, res_id, fechas,
       remindercount) son PARÁMETROS.
     - Nuevo filtro opcional por cliente (@debcode).
     - "paid" se calcula una sola vez por factura y solo con cuentas de
       deudores (antes: una subconsulta por fila y sumando todas las cuentas).
     - CONVERT(VARCHAR(10), ...) con longitud.
     - pwmagaz se evalúa con EXISTS (no duplica filas) y @res_id puede ser NULL.
     - Fechas: @hasta es inclusiva aunque datum traiga hora.
   Pendiente de confirmar con contabilidad: el redondeo a 0 decimales se
   aplica cuando valcode = 'EUR' (se conservó igual que el original).

   Uso (equivale a la consulta original):
     SELECT * FROM app.fn_kardex('71020000000000000000', '189000004', 'A410', 60683,
                                 '2026-05-01', '2026-06-08', 12, NULL)
     ORDER BY datum, periode, faktuurnr, ID
     OPTION (RECOMPILE);
   ===================================================================== */
USE PedidosApp;
GO

IF OBJECT_ID(N'app.fn_kardex') IS NULL EXEC (N'CREATE FUNCTION app.fn_kardex() RETURNS TABLE AS RETURN SELECT 1 AS x');
GO
ALTER FUNCTION app.fn_kardex
(
    @artcode            varchar(30),
    @reknr              varchar(20),
    @warehouse          varchar(10),
    @res_id             int,            -- NULL = cualquier responsable de almacén
    @desde              date,
    @hasta              date,
    @max_recordatorios  int,            -- original: 12
    @debcode            varchar(20)     -- NULL = todos los clientes
)
RETURNS TABLE
AS
RETURN
WITH base AS
(
    SELECT  g.datum, g.periode, g.faktuurnr, g.docnumber, g.project, g.bkstnr,
            ISNULL(de.debcode, '') AS debnr,
            ISNULL(cr.crdcode, '') AS crdnr,
            r.omzrek,
            g.reknr, g.artcode, g.transtype, g.transsubtype,
            g.type AS tipo_num,
            CASE WHEN g.documentID      IS NULL THEN 0 ELSE 1 END AS Note,
            CASE WHEN g.docattachmentID IS NULL THEN 0 ELSE 1 END AS Attach,
            CASE WHEN g.transtype = 'B' THEN NULL
                 WHEN r.omzrek = 'J' AND g.aantal < 0 THEN -g.aantal
                 WHEN r.omzrek IN ('G', 'K', 'N') AND g.aantal > 0 THEN g.aantal END AS QtyIn,
            CASE WHEN g.transtype = 'B' THEN NULL
                 WHEN r.omzrek = 'J' AND g.aantal > 0 THEN g.aantal
                 WHEN r.omzrek IN ('G', 'K', 'N') AND g.aantal < 0 THEN -g.aantal END AS QtyOut,
            g.warehouse, g.warehouse_location, g.oms25, d.afk, g.bkstnr_sub, g.res_id, g.oorsprong,
            ISNULL(o.ord_soort, CASE WHEN g.crdnr IS NOT NULL THEN 'B'
                                     WHEN g.debnr IS NOT NULL THEN 'V'
                                     WHEN g.res_id <> 0       THEN 'I'
                                     ELSE ' ' END) AS ord_soort,
            CASE WHEN r.omzrek IN ('J', 'K', 'G', 'N') THEN
                 CASE WHEN b.exclus = 'E' THEN i.salespackageprice
                      WHEN g.valcode = 'EUR' THEN ROUND(i.salespackageprice / ((100 + b.btwper) * 0.01), 0)
                      ELSE ROUND(i.salespackageprice / ((100 + b.btwper) * 0.01), 2) END
            END AS SalesPrice,
            CASE WHEN g.transtype = 'B' THEN NULL
                 WHEN g.transsubtype NOT IN ('R', 'S') THEN CASE WHEN g.bdr_hfl >= 0 THEN g.bdr_hfl END
                 ELSE CASE WHEN g.bdr_hfl < 0 THEN g.bdr_hfl END END AS Debit,
            CASE WHEN g.transtype = 'B' THEN NULL
                 WHEN g.transsubtype NOT IN ('R', 'S') THEN CASE WHEN g.bdr_hfl < 0 THEN -g.bdr_hfl END
                 ELSE CASE WHEN g.bdr_hfl >= 0 THEN -g.bdr_hfl END END AS Credit,
            CASE WHEN g.transsubtype = 'A' THEN 'CUP' ELSE g.valcode END AS valcode,
            CASE WHEN g.transsubtype = 'A' AND g.valcode <> 'CUP' THEN g.bdr_hfl ELSE g.bdr_val END AS bdr_val,
            g.verwerknrl, g.betaalref, g.ID, g.IBTDeliveryNr
    FROM src.gbkmut g
    JOIN src.grtbk r          ON r.reknr = g.reknr
    JOIN src.items i          ON i.itemcode = g.artcode
    LEFT JOIN src.cicmpy de   ON de.debnr = g.debnr AND g.debnr IS NOT NULL AND de.debnr IS NOT NULL
    LEFT JOIN src.cicmpy cr   ON cr.crdnr = g.crdnr AND g.crdnr IS NOT NULL AND cr.crdnr IS NOT NULL
    LEFT JOIN src.dagbk d     ON d.dagbknr = g.dagbknr AND g.dagbknr IS NOT NULL
    LEFT JOIN src.orkrg o     ON o.ordernr = g.bkstnr_sub AND g.bkstnr_sub IS NOT NULL AND o.ordernr IS NOT NULL
    LEFT JOIN src.btwtrs b    ON b.btwtrans = i.salesvatcode AND i.salesvatcode IS NOT NULL AND b.btwtrans IS NOT NULL
    WHERE g.artcode = @artcode
      AND g.reknr = @reknr
      AND g.warehouse = @warehouse
      AND g.transtype IN ('X', 'N', 'C', 'P')
      AND g.datum >= @desde
      AND g.datum <  DATEADD(day, 1, @hasta)
      AND g.remindercount <= @max_recordatorios
      AND (@debcode IS NULL OR LTRIM(de.debcode) = LTRIM(@debcode))
      AND EXISTS (SELECT 1 FROM src.pwmagaz w
                  WHERE w.magcode = g.warehouse AND (@res_id IS NULL OR w.res_id = @res_id))
),
calc AS
(
    SELECT  bs.*,
            CASE WHEN bs.omzrek = 'D' AND fs.saldo = 0 THEN 1 ELSE 0 END AS paid,
            CASE WHEN bs.tipo_num IN (191, 190, 151, 152, 150) THEN CONVERT(varchar(10), bs.tipo_num)
                 ELSE bs.transsubtype END AS [Type],
            ABS(CASE WHEN ISNULL(bs.QtyIn, 0.0) + ISNULL(bs.QtyOut, 0.0) = 0.0 THEN NULL
                     WHEN bs.QtyIn  IS NOT NULL AND bs.QtyIn  <> 0.0 THEN ISNULL(bs.Debit, 0.0)  / bs.QtyIn
                     WHEN bs.QtyOut IS NOT NULL AND bs.QtyOut <> 0.0 THEN ISNULL(bs.Credit, 0.0) / bs.QtyOut
                END) AS AvgPrice
    FROM base bs
    LEFT JOIN app.v_factura_saldo fs ON fs.faktuurnr = bs.faktuurnr AND bs.omzrek = 'D'
)
SELECT  datum, periode, docnumber, faktuurnr, IBTDeliveryNr, project, [Type], bkstnr, reknr, bkstnr_sub,
        artcode, oms25, Note, Attach, QtyIn, QtyOut, AvgPrice, warehouse, debnr, crdnr, afk, paid,
        Debit, Credit,
        CASE WHEN AvgPrice IS NULL OR SalesPrice = 0 THEN NULL
             ELSE (SalesPrice - AvgPrice) / SalesPrice * 100 END AS margin,
        valcode, bdr_val, verwerknrl, betaalref, ID
FROM calc;
GO
