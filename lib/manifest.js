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
      meetAddress: "",      // dirección para reuniones presenciales, ej. "Av. Reforma 123, CDMX"
      instagram: "https://www.instagram.com/fuse_plus/",
      linkedin: "",         // ej. "https://www.linkedin.com/company/fuse"
      facebook: "",
      tiktok: ""
    },

    /* Agenda de reuniones (Google Calendar → "Página de reservas").
       Pega el enlace público de cada página de reservas. Vacío = el botón
       "Agendar diagnóstico" lleva al formulario de contacto en su lugar.
       Ver manual, sección "Agenda de reuniones". */
    booking: {
      virtualUrl: "",       // ej. "https://calendar.app.google/AbCdEf123" (videollamada con Google Meet)
      presencialUrl: "",    // ej. "https://calendar.app.google/XyZ987"   (reunión presencial)
      virtualNote: "Videollamada por Google Meet. El enlace llega en el correo de confirmación.",
      presencialNote: "Reunión en persona. La dirección aparece en la confirmación."
    },

    form: {
      endpoint: "/api/contact",   // Cloudflare Pages Function (functions/api/contact.js)
      turnstileSiteKey: ""        // ej. "0x4AAAAAAA..." — ver manual, sección Turnstile
    }
  };
})();
