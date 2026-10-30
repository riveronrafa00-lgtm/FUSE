/* =====================================================================
   01 · BASE DE LA APLICACIÓN Y SINÓNIMOS  ·  Servidor: cmch-dc1
   ---------------------------------------------------------------------
   Crea la base PedidosApp (con la MISMA intercalación que [900] para que
   no haya errores de "collation conflict" al cruzar tablas) y un esquema
   src con sinónimos que apuntan a [900].dbo.*.

   Por qué una base aparte: no se tocan objetos de Exact Globe, las
   actualizaciones de Exact no borran nuestras vistas, y si mañana la
   empresa cambia de base (901, 902…) basta con volver a ejecutar este
   script cambiando @bd_origen. Todas las vistas leen de src.*.

   Requiere: login con permiso para crear bases (sysadmin o dbcreator).
   ===================================================================== */
USE master;
GO

DECLARE @bd_app    sysname = N'PedidosApp';
DECLARE @bd_origen sysname = N'900';

IF DB_ID(@bd_origen) IS NULL
    THROW 50001, 'No existe la base de origen [900] en este servidor. Revisa que estás conectado a cmch-dc1.', 1;

IF DB_ID(@bd_app) IS NULL
BEGIN
    DECLARE @collation sysname = CONVERT(sysname, DATABASEPROPERTYEX(@bd_origen, 'Collation'));
    DECLARE @crear nvarchar(400) = N'CREATE DATABASE ' + QUOTENAME(@bd_app) + N' COLLATE ' + @collation + N';';
    EXEC (@crear);
    SET @crear = N'ALTER DATABASE ' + QUOTENAME(@bd_app) + N' SET RECOVERY SIMPLE;';
    EXEC (@crear);
END
GO

USE PedidosApp;
GO
IF SCHEMA_ID('src') IS NULL EXEC (N'CREATE SCHEMA src AUTHORIZATION dbo;');
IF SCHEMA_ID('app') IS NULL EXEC (N'CREATE SCHEMA app AUTHORIZATION dbo;');
GO

/* Sinónimos src.<tabla> -> [900].dbo.<tabla> */
DECLARE @bd_origen sysname = N'900';
DECLARE @sql nvarchar(max) = N'';

SELECT @sql += N'IF OBJECT_ID(N''src.' + t.n + N''', N''SN'') IS NOT NULL DROP SYNONYM src.' + t.n + N';' + NCHAR(10)
            +  N'CREATE SYNONYM src.' + t.n + N' FOR ' + QUOTENAME(@bd_origen) + N'.dbo.' + t.n + N';' + NCHAR(10)
FROM (VALUES (N'orkrg'), (N'orsrg'), (N'gbkmut'), (N'grtbk'), (N'cicmpy'),
             (N'items'), (N'btwtrs'), (N'dagbk'), (N'pwmagaz')) AS t(n);

EXEC sys.sp_executesql @sql;

SELECT name AS sinonimo, base_object_name AS apunta_a FROM sys.synonyms ORDER BY name;
GO
