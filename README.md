# FUSE — sitio web

Consultoría de marketing para PyMEs y negocios locales. *Conecta. Activa. Escala.*

Sitio estático (HTML + CSS + JavaScript sin frameworks) listo para **Cloudflare Pages**, con el código respaldado en **GitHub**. Cada `git push` a `main` publica una versión nueva automáticamente.

> 📘 El manual completo paso a paso está en `docs/Manual_FUSE_Cloudflare.docx`.

## Páginas

| Archivo | URL publicada | Qué contiene |
|---|---|---|
| `index.html` | `/` | Hero animado, cifras, pilares, proceso, recomendador de paquetes, testimonios, FAQ |
| `servicios.html` | `/servicios` | 11 servicios en 3 pilares, paquetes, tabla comparativa, FAQ |
| `quienes-somos.html` | `/quienes-somos` | Historia, origen del nombre, valores, red de especialistas |
| `contacto.html` | `/contacto` | Agenda (virtual/presencial) y formulario con envío real, validación y anti-spam |
| `politica-privacidad.html` | `/politica-privacidad` | Plantilla legal (revisar con abogado) |
| `404.html` | cualquier URL inexistente | Página de error con la marca |

## Estructura

```
index.html … 404.html      páginas
styles.css                 todos los estilos (tokens de color al inicio)
main.js                    toda la interactividad
lib/manifest.js            ⭐ datos de contacto y redes (edita AQUÍ)
lib/boot.js                evita parpadeos al cargar
functions/api/contact.js   Cloudflare Pages Function: recibe el formulario y envía el correo
assets/                    logo, favicon, íconos PNG, imagen para redes (og-image.png)
_headers                   cabeceras de seguridad y caché (Cloudflare)
_redirects                 redirecciones cortas (/contact, /precios, /instagram…)
robots.txt, sitemap.xml    SEO
site.webmanifest           ícono al "añadir a pantalla de inicio"
scripts/check-site.mjs     revisión de enlaces rotos (también corre en GitHub Actions)
wrangler.toml.example      config opcional para pruebas locales con Wrangler
```

## Editar lo más común

- **Email, teléfono, WhatsApp, ciudad, redes** → `lib/manifest.js`. Si un campo está vacío, se oculta solo. Al poner el WhatsApp aparece el botón flotante verde.
- **Textos** → directamente en cada `.html`.
- **Colores** → variables `--blue`, `--orange`, `--violet`… al inicio de `styles.css`.
- Si cambias `styles.css` o `main.js`, sube el número `?v=20260924` en los HTML para que los navegadores descarguen la versión nueva.

## Formulario de contacto

`POST /api/contact` (Cloudflare Pages Function). Configura en Cloudflare → tu proyecto → **Settings → Variables and Secrets**:

| Variable | Tipo | Ejemplo |
|---|---|---|
| `RESEND_API_KEY` | Secreto | `re_…` (cuenta gratuita en resend.com) |
| `CONTACT_TO` | Texto | `hola@fuseconsultora.com` |
| `CONTACT_FROM` | Texto | `FUSE Web <web@fuseconsultora.com>` (dominio verificado en Resend) |
| `TURNSTILE_SECRET_KEY` | Secreto, opcional | clave secreta de Turnstile |
| `ALLOWED_ORIGINS` | Texto, opcional | `https://fuseconsultora.com,https://www.fuseconsultora.com` |

Opcional: vincula un namespace KV como `CONTACT_KV` para guardar copia de cada mensaje y limitar a 5 envíos por hora por IP.

**Sin configurar nada**, el formulario sigue funcionando: abre el programa de correo del visitante con el mensaje redactado.

## Agenda de reuniones (Google Calendar)

El botón **Agendar diagnóstico** abre un modal con la página de reservas de Google Calendar, con pestañas **Videollamada** y **Presencial**.

1. En Google Calendar: **Crear → Agenda de citas**, una para videollamada (Google Meet) y otra presencial.
2. En cada una: **Compartir → Insertar en el sitio web → En línea** y copia la URL del `src` (termina en `?gv=true`).
3. Pégalas en `lib/manifest.js` → `booking.virtualUrl` y `booking.presencialUrl`.

Sin enlaces configurados, los botones llevan al formulario con la modalidad ya marcada.

## Ver en local

```bash
python3 -m http.server 8000          # sitio estático → http://localhost:8000
npx wrangler pages dev .             # sitio + formulario real (usa .dev.vars, ver .dev.vars.example)
node scripts/check-site.mjs          # revisar enlaces
```

## Publicar (resumen)

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → elige este repositorio.
2. Framework preset **None**, build command **vacío**, output directory **/** (raíz).
3. **Save and Deploy**. Luego **Custom domains** para conectar tu dominio.

## Pendientes antes de lanzar

- Datos reales en `lib/manifest.js` (teléfono, WhatsApp, ciudad, LinkedIn).
- Confirmar el dominio: hoy las URLs canónicas, `sitemap.xml` y `robots.txt` usan `https://fuseconsultora.com`.
- Reemplazar los 3 testimonios de ejemplo por reseñas reales.
- Logo en alta resolución (hoy es una recreación SVG en `assets/img/logo-mark.svg`).
- Revisión legal de la política de privacidad.
