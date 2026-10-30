/* =====================================================================
   06 · USUARIO DE SOLO LECTURA PARA LA API
   ---------------------------------------------------------------------
   La API se conecta con este login. Solo puede LEER las tablas que usa
   y las vistas del esquema app. No puede escribir en [900].
   Cambia la contraseña antes de ejecutar y guárdala en el .env de la API.
   Requiere: autenticación mixta (SQL + Windows) activa en cmch-dc1.
   ===================================================================== */
USE master;
GO
IF SUSER_ID(N'app_pedidos_ro') IS NULL
    CREATE LOGIN app_pedidos_ro
        WITH PASSWORD = N'CAMBIAR-esta-Clave-2026!', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF,
             DEFAULT_DATABASE = PedidosApp;
GO

/* ---- En la base de Exact: lectura de tablas concretas, nada más ---- */
USE [900];
GO
IF USER_ID(N'app_pedidos_ro') IS NULL CREATE USER app_pedidos_ro FOR LOGIN app_pedidos_ro;
GRANT SELECT ON dbo.orkrg   TO app_pedidos_ro;
GRANT SELECT ON dbo.orsrg   TO app_pedidos_ro;
GRANT SELECT ON dbo.gbkmut  TO app_pedidos_ro;
GRANT SELECT ON dbo.grtbk   TO app_pedidos_ro;
GRANT SELECT ON dbo.cicmpy  TO app_pedidos_ro;
GRANT SELECT ON dbo.items   TO app_pedidos_ro;
GRANT SELECT ON dbo.btwtrs  TO app_pedidos_ro;
GRANT SELECT ON dbo.dagbk   TO app_pedidos_ro;
GRANT SELECT ON dbo.pwmagaz TO app_pedidos_ro;
GO

/* ---- En la base de la app: lectura de las vistas y funciones ---- */
USE PedidosApp;
GO
IF USER_ID(N'app_pedidos_ro') IS NULL CREATE USER app_pedidos_ro FOR LOGIN app_pedidos_ro;
GRANT SELECT ON SCHEMA::app TO app_pedidos_ro;
DENY  INSERT, UPDATE, DELETE ON SCHEMA::app TO app_pedidos_ro;
GO

/* Comprobación: conéctate como app_pedidos_ro y ejecuta
   SELECT TOP (5) * FROM PedidosApp.app.v_pedido_estado;        -- debe funcionar
   UPDATE [900].dbo.orkrg SET refer = refer WHERE 1 = 0;         -- debe fallar (sin permiso)
*/
