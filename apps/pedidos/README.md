# Cartera de pedidos: pedidos pendientes en tiempo real (Exact Globe, `cmch-dc1` / BD `900`)

Este panel muestra los pedidos de venta pendientes por **cliente**, **SKU** y **antigüedad**. Cerveza y malta se ven en **hectolitros (HL)**. Los promocionales y los demás artículos se ven en **unidades** y nunca se suman a los HL. Funciona en Android de dos maneras: como app instalada desde Chrome (PWA) o como un APK propio.

```
 Teléfonos Android ──HTTP(S)──►  API Node (Windows, red interna)  ──SQL──►  cmch-dc1
  (PWA o APK)                     caché de 15 s, solo lectura                 ├─ PedidosApp   (vistas app.*, sinónimos src.*)
                                                                              └─ [900]        (Exact Globe: orkrg, orsrg, gbkmut…)
```

| Carpeta | Contenido |
|---|---|
| `sql/` | Scripts en orden: descubrimiento, base y sinónimos, catálogo HL, vistas, kardex, índices, seguridad y pruebas |
| `api/` | API Node.js (Express + mssql) que también sirve el panel web (`api/public`) |
| `android/` | Empaquetado del panel como APK con Capacitor |

---

## 1. Qué muestra la app

| Pantalla | Para qué sirve |
|---|---|
| **Resumen** | Total de HL pendientes (cerveza y malta por separado) y, aparte, las unidades de otros SKU. También: pedidos abiertos, clientes, pedidos con entrega vencida, antigüedad media ponderada por HL, barras por tramo (0–7, 8–15, 16–30, 31–60 y más de 60 días) y los principales clientes y SKU |
| **Pedidos** | Lista de pedidos con filtros por tramo, estado (sin entregar, parcial, entregado, facturado, cobrado) y orden (más antiguos, más HL, más atrasados, cliente) |
| **Clientes** | Clientes ordenados por volumen pendiente, antigüedad o número de pedidos. Al tocar uno se ven sus pedidos |
| **SKU** | Artículos con lo pendiente en HL o en unidades, y aviso si a una cerveza o malta le falta el factor HL |
| **Detalle** | El recorrido del pedido (Pedido → Entrega → Factura → Cobro), sus líneas con la barra de avance, sus facturas y los movimientos contabilizados en gbkmut |

Arriba hay un selector **HL / Und** que cambia todas las cifras, y filtros globales: búsqueda, categoría (cerveza, malta u otros) y los filtros activos que se van tocando. La app se actualiza sola cada 30 segundos (se puede cambiar en Ajustes). Si se pierde la conexión, sigue mostrando los últimos datos e indica la hora en que se obtuvieron.

---

## 2. Paso a paso

### Paso 1: Confirmar las columnas (5 minutos, solo lectura)

1. Abre **SSMS** y conéctate a `cmch-dc1`.
2. Abre y ejecuta `sql/00_descubrimiento.sql`.
3. Revisa los resultados:
   - **Punto 1:** la versión de SQL Server debe ser **2012 o superior**.
   - **Punto 3:** confirma que `orsrg` tiene `esr_aantal` (cantidad pedida) y `aant_gelev` (cantidad entregada).
     Si se llaman de otra manera, cámbialos en `sql/03_vistas.sql`, en la vista `app.v_linea`. Son las líneas marcadas con `>>> AJUSTAR` y es el único lugar que hay que tocar.
   - **Punto 5:** compara 2 o 3 pedidos con lo que ves en Exact. Las cantidades deben coincidir.

### Paso 2: Crear la base de la app y las vistas

Ejecuta los scripts en este orden, con un usuario administrador:

| Script | Qué hace |
|---|---|
| `01_base_y_sinonimos.sql` | Crea la base `PedidosApp` con la misma intercalación que `[900]` y los sinónimos `src.*` → `[900].dbo.*`. **No se crea nada dentro de la base de Exact** |
| `02_sku_medida.sql` | Crea el catálogo `app.sku_medida` y lo prellena leyendo la descripción de cada artículo (por ejemplo, `24X355ML` → 8,52 L por caja) |
| `03_vistas.sql` | Crea las vistas `app.v_linea`, `v_pedido`, `v_pedido_estado`, `v_factura_saldo`, `v_pedido_factura` y `v_pedido_mov` |
| `04_kardex.sql` | Crea `app.fn_kardex(...)`: tu consulta original convertida en función con parámetros y con el filtro por cliente |
| `05_indices.sql` | **Opcional.** Índices de apoyo en `[900]`. Coordínalo con el partner de Exact y ejecútalo fuera del horario de trabajo |
| `06_seguridad.sql` | Crea el login de solo lectura `app_pedidos_ro`. **Cambia la contraseña antes de ejecutarlo** |
| `07_pruebas.sql` | Consultas de ejemplo para medir tiempos |

> Si algún día los datos pasan a otra base (901, 902…), cambia `@bd_origen` en `01_base_y_sinonimos.sql` y vuelve a ejecutarlo. Las vistas no cambian.

### Paso 3: Configurar los factores de hectolitros (lo más importante)

La conversión a HL depende de `app.sku_medida`:

```
HL = cantidad × litros_unidad / 100
Caja 24 × 355 ml → 8,52   ·   Caja 24 × 330 ml → 7,92   ·   Barril 50 L → 50
```

1. Al final de `02_sku_medida.sql` aparece la lista de revisión. Corrige cada SKU marcado como **FALTA FACTOR HL** o **Revisar sugerencia**:
   ```sql
   UPDATE app.sku_medida
   SET categoria = 'CERVEZA', litros_unidad = 8.52, formato = 'Lata 355 ml × 24', origen = 'REVISADO'
   WHERE artcode = '71020000000000000000';
   ```
2. Los promocionales y los demás artículos llevan `categoria = 'PROMOCIONAL'` u `'OTRO'` y `litros_unidad = NULL`. Se muestran en unidades.
3. Cuando se creen SKU nuevos en Exact, vuelve a ejecutar `02_sku_medida.sql`. Solo agrega los SKU que faltan y no toca lo que ya corregiste. Mientras falte un factor, la app muestra un aviso amarillo.

### Paso 4: Instalar la API en un servidor Windows de la red

Usa un servidor que llegue a `cmch-dc1` por el puerto 1433. Puede ser el propio `cmch-dc1`, aunque es mejor otro equipo, porque `cmch-dc1` parece ser el controlador de dominio.

1. Instala **Node.js 20 LTS o superior** desde nodejs.org.
2. Copia la carpeta `apps/pedidos/api` a `C:\PedidosApp\api`.
3. En una consola, dentro de esa carpeta:
   ```bash
   npm install --omit=dev
   ```
   ```bash
   copy .env.example .env
   ```
4. Edita el archivo `.env`:
   - `DB_SERVER=cmch-dc1`. Si SQL Server es una instancia con nombre, por ejemplo `cmch-dc1\EXACT`, pon `DB_INSTANCE=EXACT` y deja `DB_PORT` vacío.
   - `DB_PASSWORD`: la contraseña que pusiste en `06_seguridad.sql`.
   - `APP_TOKENS`: un código de acceso por persona o por equipo. Por ejemplo: `Rafael:Xk29-pq81-Lm4;Ventas:Hh72-wz09-Rt5`.
5. Pruébala primero sin base de datos:
   ```bash
   npm run demo
   ```
   Abre `http://localhost:8080`. Deberías ver datos ficticios.
6. Ahora pruébala con datos reales:
   ```bash
   npm start
   ```
   Entra con tu código. En **Ajustes** debe aparecer `Servidor SQL: CMCH-DC1 · PedidosApp`.
7. Abre el puerto en el firewall de Windows. En PowerShell como administrador:
   ```bash
   netsh advfirewall firewall add rule name="Pedidos API" dir=in action=allow protocol=TCP localport=8080
   ```
8. Déjala corriendo como **servicio de Windows** con [NSSM](https://nssm.cc/download):
   ```bash
   nssm install PedidosAPI "C:\Program Files\nodejs\node.exe" "--env-file=.env src/server.js"
   ```
   ```bash
   nssm set PedidosAPI AppDirectory C:\PedidosApp\api
   ```
   ```bash
   nssm set PedidosAPI AppStdout C:\PedidosApp\api\api.log
   ```
   ```bash
   nssm start PedidosAPI
   ```
   El servicio arranca solo al reiniciar el servidor y se reinicia si la API falla.

### Paso 5: Ponerla en los teléfonos Android

#### Opción A (recomendada): app instalada desde Chrome (PWA)

Para que se instale como app y funcione sin conexión, Android exige **HTTPS**. Hay dos maneras de dárselo:

- **IIS como proxy inverso** con un certificado de la CA interna del dominio. Requiere los módulos URL Rewrite y ARR, y apuntar `https://pedidos.empresa.local` a `http://localhost:8080`.
- **Caddy**, que es más simple. Crea un archivo `Caddyfile`:
  ```
  pedidos.empresa.local {
      tls internal
      reverse_proxy localhost:8080
  }
  ```
  Luego instala en cada teléfono el certificado raíz de Caddy, o usa uno de la CA corporativa.

En el teléfono:

1. Abre Chrome y entra en `https://pedidos.empresa.local`.
2. Escribe tu código de acceso.
3. En el menú ⋮, toca **Instalar app** o **Agregar a pantalla principal**.

Para actualizar la app basta con cambiar los archivos en el servidor. Los teléfonos toman la versión nueva solos.

> Sin HTTPS también funciona en Chrome con `http://IP:8080`, pero como página web: no se instala y no tiene la carcasa sin conexión.

#### Opción B: APK propio (sin certificados)

Necesitas un PC con **Android Studio** y **Node.js**.

1. Entra en la carpeta `apps/pedidos/android` e instala las dependencias:
   ```bash
   npm install
   ```
2. Copia el panel y deja preconfigurada la dirección del servidor:
   ```bash
   npm run copiar -- http://192.168.1.20:8080
   ```
3. Crea el proyecto Android (solo la primera vez):
   ```bash
   npx cap add android
   ```
4. Sincroniza el panel con el proyecto:
   ```bash
   npx cap sync android
   ```
5. Abre el proyecto en Android Studio:
   ```bash
   npm run abrir
   ```
6. En Android Studio: **Build → Generate Signed App Bundle / APK → APK**. Crea una clave y **guárdala bien**, porque la vas a necesitar para cada actualización.
7. Instala el APK en los teléfonos (por WhatsApp, por correo o con un MDM). Hay que permitir "instalar apps desconocidas".

Para actualizar el APK, repite los pasos 2, 4 y 6 y sube el `versionCode` en `android/app/build.gradle`.

En `capacitor.config.json` cambia `appId` por el identificador de tu empresa antes de crear el proyecto. Ese valor no se puede cambiar después.

### Paso 6: Acceso desde fuera de la oficina

**No publiques el puerto 8080 en internet.** Usa la VPN de la empresa o un túnel privado, como Cloudflare Tunnel con Cloudflare Access o Tailscale. Los códigos de acceso protegen frente a curiosos, pero no reemplazan una red privada.

---

## 3. Por qué es rápida

- **Vistas sin valores fijos.** Los filtros (cliente, SKU, tramo, fechas, estado) llegan como parámetros y la API **solo agrega al WHERE los que están informados**, así SQL Server arma el mejor plan para cada combinación. El tramo de antigüedad se traduce en un rango de fechas sobre `orddat`, que aprovecha los índices.
- **El resumen hace un solo viaje a la base.** Lee las líneas pendientes una vez en una tabla temporal y de ahí salen los KPI, los tramos, los principales clientes, los principales SKU y los estados.
- **Caché de 15 s en la API y unión de peticiones iguales.** Aunque 50 teléfonos refresquen a la vez, SQL recibe como mucho 1 consulta de cada tipo cada 15 s.
- **ETag y 304.** Si los datos no cambiaron, el teléfono recibe una respuesta vacía y no vuelve a dibujar la pantalla.
- **`READ UNCOMMITTED`.** El panel nunca bloquea a Exact ni espera por sus transacciones. Puede, en raros casos, mostrar un dato que se está grabando en ese instante; para un panel de seguimiento es aceptable.
- **El "pagado" está corregido.** Antes había una subconsulta por cada fila que sumaba todas las cuentas. Ahora se calcula una vez por factura y solo con las cuentas de deudores (`omzrek = 'D'`).
- **El panel no usa frameworks.** Unos 40 KB en total y abre al instante.

## 4. API (por si se quiere conectar Excel, Power BI u otra app)

Todas las rutas requieren la cabecera `Authorization: Bearer <código>`.

| Ruta | Parámetros |
|---|---|
| `GET /api/resumen` | `cliente`, `sku`, `categoria` (`CERVEZA`, `MALTA`, `HL`, `OTROS`…), `tramo` (1–5), `q`, `desde`, `hasta` |
| `GET /api/pedidos` | Los mismos, más `estado`, `orden` (`antiguedad`, `recientes`, `hl`, `cant`, `atraso`, `cliente`), `limit` y `offset` |
| `GET /api/pedidos/:id` | `id` = `ordernr` tal como lo devuelve la lista |
| `GET /api/clientes`, `GET /api/skus` | Filtros comunes, más `orden` (`hl`, `cant`, `antiguedad`, `pedidos`, `nombre`) |
| `GET /api/kardex` | `artcode`, `reknr`, `almacen`, `res_id`, `desde`, `hasta`, `max_recordatorios`, `cliente`. Es tu consulta original |

Ejemplo: tu consulta original vía API.

```
/api/kardex?artcode=71020000000000000000&reknr=189000004&almacen=A410&res_id=60683&desde=2026-05-01&hasta=2026-06-08
```

## 5. Puntos que hay que confirmar con contabilidad o con el partner de Exact

1. **Nombres de las cantidades en `orsrg`** (`esr_aantal` y `aant_gelev`). Se confirman en el paso 1.
2. **Pedidos cerrados.** Exact pasa a `orhkrg`/`orhsrg` los pedidos procesados por completo. Por eso la app muestra la **cartera abierta**. Los estados "Facturado" y "Cobrado" solo aparecen mientras el pedido sigue en las tablas abiertas.
3. **Redondeo con `valcode = 'EUR'`** en `fn_kardex`. Se conservó igual que en la consulta original; parece invertido respecto a CUP.
4. **Tipos de transacción `X, N, C, P`** y **cuentas de deudores `omzrek = 'D'`**. Se mantuvo el criterio de la consulta original.
5. **Antigüedad.** Se cuenta desde la fecha del pedido (`orddat`). El atraso se cuenta desde la fecha de entrega prometida (`afldat`).
