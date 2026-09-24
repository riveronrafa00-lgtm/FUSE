/* =============================================================
   FUSE — Cloudflare Pages Function: POST /api/contact
   -------------------------------------------------------------
   Recibe el formulario de contacto, lo valida y lo envía por correo.

   Variables de entorno (Cloudflare → Pages → Settings → Variables and Secrets):
     RESEND_API_KEY        (secreto)  API key de https://resend.com para enviar el correo
     CONTACT_TO            (texto)    bandeja que recibe los mensajes. Ej: hola@fuseconsultora.com
     CONTACT_FROM          (texto)    remitente verificado en Resend. Ej: FUSE Web <web@fuseconsultora.com>
     TURNSTILE_SECRET_KEY  (secreto)  opcional: activa la verificación anti-spam de Turnstile
     ALLOWED_ORIGINS       (texto)    opcional: dominios permitidos separados por coma
   Binding opcional:
     CONTACT_KV            (KV)       guarda una copia de cada mensaje y limita envíos por IP

   Si no hay ni RESEND_API_KEY ni CONTACT_KV, responde 503 y el navegador
   abre el correo del visitante (mailto) como plan B: el sitio nunca queda sin contacto.
   ============================================================= */

const MAX = { nombre: 100, empresa: 120, email: 160, telefono: 30, servicio: 80, modalidad: 30, presupuesto: 40, mensaje: 2000 };
const RATE_LIMIT = 5;          // envíos por IP…
const RATE_WINDOW = 60 * 60;   // …por hora

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

async function readBody(request) {
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) return await request.json();
  const fd = await request.formData();
  return Object.fromEntries(fd.entries());
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

async function sendEmail(env, d, meta) {
  const rows = [
    ["Nombre", d.nombre], ["Negocio", d.empresa || "—"], ["Email", d.email],
    ["Teléfono", d.telefono || "—"], ["Servicio", d.servicio || "—"], ["Modalidad", d.modalidad || "—"], ["Presupuesto", d.presupuesto || "—"],
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#0057FF;margin:0 0 12px">Nuevo contacto desde la web</h2>
    <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;width:130px">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(v)}</td></tr>`).join("")}
    </table>
    <h3 style="margin:18px 0 6px">Mensaje</h3>
    <p style="white-space:pre-wrap;background:#f6f7fb;padding:12px;border-radius:8px">${esc(d.mensaje)}</p>
    <p style="color:#999;font-size:12px">Enviado ${esc(meta.date)} · País: ${esc(meta.country)} · Página: ${esc(meta.page)}</p>
  </div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nMensaje:\n${d.mensaje}\n\n— ${meta.date} · ${meta.country}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM || "FUSE Web <onboarding@resend.dev>",
      to: (env.CONTACT_TO || "hola@fuseconsultora.com").split(",").map((s) => s.trim()),
      reply_to: d.email,
      subject: `Nuevo contacto: ${d.nombre}${d.servicio ? " · " + d.servicio : ""}`,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

export async function onRequestPost({ request, env }) {
  // 1. Origen permitido (evita que otros sitios usen tu formulario)
  const origin = request.headers.get("Origin");
  if (origin) {
    const host = new URL(request.url).host;
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const originHost = (() => { try { return new URL(origin).host; } catch { return ""; } })();
    const ok = originHost === host || originHost.endsWith(".pages.dev") || allowed.includes(origin);
    if (!ok) return json({ ok: false, error: "Origen no permitido." }, 403);
  }

  // 2. Leer y limpiar
  let raw;
  try { raw = await readBody(request); } catch { return json({ ok: false, error: "Solicitud inválida." }, 400); }
  if (raw.website) return json({ ok: true }); // honeypot: un bot lo rellenó; fingimos éxito

  const d = {};
  for (const k of Object.keys(MAX)) d[k] = clean(raw[k], MAX[k]);

  // 3. Validar
  const errors = [];
  if (d.nombre.length < 2) errors.push("nombre");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.push("email");
  if (d.mensaje.length < 10) errors.push("mensaje");
  if (d.telefono && !/^[0-9+()\s-]{6,30}$/.test(d.telefono)) errors.push("telefono");
  if (!raw.privacidad) errors.push("privacidad");
  if (errors.length) return json({ ok: false, error: "Revisa los campos marcados.", fields: errors }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const meta = {
    date: new Date().toISOString(),
    country: request.cf?.country || request.headers.get("CF-IPCountry") || "—",
    page: clean(raw.page, 120) || "/contacto",
  };

  // 4. Anti-spam: Turnstile (solo si está configurado)
  if (env.TURNSTILE_SECRET_KEY) {
    const token = raw["cf-turnstile-response"];
    if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip))) {
      return json({ ok: false, error: "No pudimos verificar que eres humano. Recarga la página e inténtalo de nuevo." }, 403);
    }
  }

  const hasEmail = Boolean(env.RESEND_API_KEY);
  const hasKV = Boolean(env.CONTACT_KV);
  if (!hasEmail && !hasKV) return json({ ok: false, error: "Formulario no configurado todavía." }, 503);

  // 5. Límite por IP (requiere KV)
  if (hasKV && ip) {
    const key = `rl:${ip}`;
    const count = parseInt((await env.CONTACT_KV.get(key)) || "0", 10);
    if (count >= RATE_LIMIT) return json({ ok: false, error: "Recibimos varios mensajes desde tu conexión. Intenta más tarde o escríbenos por correo." }, 429);
    await env.CONTACT_KV.put(key, String(count + 1), { expirationTtl: RATE_WINDOW });
  }

  // 6. Guardar copia (respaldo) y enviar
  if (hasKV) {
    const id = `msg:${meta.date}:${crypto.randomUUID().slice(0, 8)}`;
    await env.CONTACT_KV.put(id, JSON.stringify({ ...d, ...meta }), { expirationTtl: 60 * 60 * 24 * 365 });
  }
  if (hasEmail) {
    try { await sendEmail(env, d, meta); }
    catch (e) {
      console.error(e);
      // Si hay copia en KV el mensaje no se perdió; si no, que el visitante use su correo
      if (!hasKV) return json({ ok: false, error: "No pudimos enviar tu mensaje ahora mismo." }, 503);
    }
  }

  return json({ ok: true });
}

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  return json({ ok: false, error: "Método no permitido." }, 405, { Allow: "POST" });
}
