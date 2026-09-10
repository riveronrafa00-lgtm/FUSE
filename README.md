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

- **Datos de contacto reales**: email, teléfono/WhatsApp, ciudad y redes sociales. Hoy aparecen como marcadores de posición en `contacto.html`, `lib/manifest.js` y en los pies de página de todas las páginas.
- **Imágenes**: la estructura está lista para recibirlas en `assets/img/` (siguiente paso del proceso).
- **Precios de los paquetes** (Fusión Base / Activa / Total): hoy se muestran como "Cotización personalizada" en `servicios.html`.
- **Revisión legal** de `politica-privacidad.html` (es una plantilla base).

## Estructura

```
index.html, quienes-somos.html, servicios.html, contacto.html, politica-privacidad.html
styles.css        ← todos los estilos
main.js           ← toda la interactividad
lib/manifest.js   ← datos de marca y contacto (edítalo para actualizar datos reales)
assets/           ← imágenes, favicon
.htaccess         ← configuración de caché para cuando se publique en Hostinger
```
