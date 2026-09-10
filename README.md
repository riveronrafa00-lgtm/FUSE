# FUSE — sitio web

Consultoría de marketing para PyMEs y negocios locales. *Conecta. Activa. Escala.*

## Qué hay aquí

Sitio estático (HTML + CSS + JS, sin frameworks ni instalación) con 5 páginas:

- `index.html` — Inicio
- `quienes-somos.html` — Quiénes somos
- `servicios.html` — Servicios (catálogo completo)
- `contacto.html` — Contacto
- `politica-privacidad.html` — Política de privacidad

## Ver el sitio en tu computadora

No necesitas instalar nada especial. Dos formas:

1. **Doble clic en `index.html`** — se abre directo en el navegador.
2. Con Python instalado, desde esta carpeta: `python3 -m http.server 8000` y abre `http://localhost:8000` en el navegador.

## Pendientes antes de publicar

- **Logo real en alta resolución**: hoy el símbolo es una recreación en SVG (`assets/img/logo-mark.svg`) porque el archivo del manual de marca es de muy baja resolución. Cuando llegue el logo real como archivo (no pegado en el chat), se reemplaza en un momento.
- **Datos de contacto reales**: email, teléfono/WhatsApp y ciudad. Hoy aparecen como marcadores de posición en `contacto.html`, `lib/manifest.js` y en los pies de página de todas las páginas. Instagram ya está cargado (`https://www.instagram.com/fuse_plus/`); falta LinkedIn.
- **Testimonios reales**: en `index.html` hay un espacio ya armado ("Lo que dicen nuestros clientes") con 3 tarjetas de ejemplo marcadas como demo — reemplázalas por reseñas reales cuando las tengas.
- **Imágenes**: la estructura está lista para recibirlas en `assets/img/` (siguiente paso del proceso).
- **Precios de los paquetes** (Fusión Base / Activa / Total): hoy se muestran como "Cotización personalizada" en `servicios.html`.
- **Revisión legal** de `politica-privacidad.html` (es una plantilla base).

## Publicar en Hostinger

Esta sesión no tiene salida de red hacia los dominios de Hostinger (política del entorno remoto), así que no pude conectar el hosting automáticamente. La forma más simple de publicar, sin necesitar eso:

1. Descarga `fuse-sitio-hostinger.zip` (te lo compartí en el chat).
2. En hPanel de Hostinger, entra a **Archivos → Administrador de archivos** y abre la carpeta `public_html` de tu dominio.
3. Sube el zip ahí y usa la opción **Extraer** (o descomprímelo en tu computadora y arrastra todos los archivos/carpetas dentro de `public_html`).
4. Verifica que `index.html` quede directamente dentro de `public_html` (no dentro de una subcarpeta extra).
5. Visita tu dominio — el sitio ya debería verse.

## Estructura

```
index.html, quienes-somos.html, servicios.html, contacto.html, politica-privacidad.html
styles.css        ← todos los estilos
main.js           ← toda la interactividad
lib/manifest.js   ← datos de marca y contacto (edítalo para actualizar datos reales)
assets/           ← imágenes, favicon
.htaccess         ← configuración de caché para cuando se publique en Hostinger
```
