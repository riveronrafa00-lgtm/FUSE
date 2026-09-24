/* =============================================================
   FUSE — datos de marca y contacto (ÚNICO lugar para editarlos)
   -------------------------------------------------------------
   main.js lee este objeto y rellena automáticamente todos los
   elementos con [data-brand="..."] en las páginas.
   - Si un campo queda vacío (""), el elemento que lo usa se oculta.
   - whatsapp: solo números con código de país, ej. "5215512345678".
   - turnstileSiteKey: clave pública de Cloudflare Turnstile
     (anti-spam). Vacío = el formulario funciona sin captcha.
   ============================================================= */
(function () {
  "use strict";
  window.__BRAND__ = {
    name: "FUSE",
    tagline: "Conecta. Activa. Escala.",
    description: "Consultoría de marketing para PyMEs y negocios locales.",

    contact: {
      email: "hola@fuseconsultora.com",
      phone: "",            // ej. "+52 55 1234 5678"
      whatsapp: "",         // ej. "5215512345678" (sin +, espacios ni guiones)
      whatsappMessage: "Hola FUSE, quiero información sobre sus servicios de marketing.",
      city: "",             // ej. "Ciudad de México, México"
      hours: "Lunes a viernes · 9:00 a 18:00",
      instagram: "https://www.instagram.com/fuse_plus/",
      linkedin: "",         // ej. "https://www.linkedin.com/company/fuse"
      facebook: "",
      tiktok: ""
    },

    form: {
      endpoint: "/api/contact",   // Cloudflare Pages Function (functions/api/contact.js)
      turnstileSiteKey: ""        // ej. "0x4AAAAAAA..." — ver manual, sección Turnstile
    }
  };
})();
