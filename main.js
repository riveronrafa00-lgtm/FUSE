/* =============================================================
   FUSE — main.js (JavaScript sin dependencias)
   Cada módulo corre aislado con safe(): si uno falla, el resto sigue.
   ============================================================= */
(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var contact = data.contact || {};
  var formCfg = data.form || {};
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  /* ---------- Datos de marca: rellena [data-brand] desde lib/manifest.js ---------- */
  function waLink(message) {
    if (!contact.whatsapp) return "";
    var text = message || contact.whatsappMessage;
    return "https://wa.me/" + String(contact.whatsapp).replace(/\D/g, "") +
      (text ? "?text=" + encodeURIComponent(text) : "");
  }
  function mountBrand() {
    var values = {
      email: contact.email ? { text: contact.email, href: "mailto:" + contact.email } : null,
      phone: contact.phone ? { text: contact.phone, href: "tel:" + contact.phone.replace(/[^\d+]/g, "") } : null,
      whatsapp: contact.whatsapp ? { text: contact.whatsappLabel || contact.phone || "WhatsApp", href: waLink() } : null,
      city: contact.city ? { text: contact.city } : null,
      hours: contact.hours ? { text: contact.hours } : null,
      meetAddress: contact.meetAddress ? { text: contact.meetAddress } : null,
      instagram: contact.instagram ? { href: contact.instagram } : null,
      linkedin: contact.linkedin ? { href: contact.linkedin } : null,
      facebook: contact.facebook ? { href: contact.facebook } : null,
      tiktok: contact.tiktok ? { href: contact.tiktok } : null
    };
    $$("[data-brand]").forEach(function (el) {
      var key = el.getAttribute("data-brand");
      var v = values[key];
      // El contenedor a ocultar si no hay dato (ej. el <li> o el bloque completo)
      var wrap = el.closest("[data-brand-wrap]") || el;
      if (!v) {
        // data-brand-optional: si no hay dato se conserva el texto por defecto
        if (!el.hasAttribute("data-brand-optional")) wrap.hidden = true;
        return;
      }
      wrap.hidden = false;
      if (v.text && !el.hasAttribute("data-brand-keep-text")) el.textContent = v.text;
      if (v.href && el.tagName === "A") el.setAttribute("href", v.href);
    });
  }

  /* ---------- Nav: estado al hacer scroll + barra de progreso ---------- */
  function initScrollUI() {
    var nav = $(".nav");
    var bar = $("[data-progress]");
    var top = $("[data-to-top]");
    var ticking = false;
    function update() {
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - innerHeight;
      if (nav) nav.classList.toggle("is-scrolled", y > 12);
      if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
      if (top) top.classList.toggle("is-visible", y > innerHeight * 0.9);
      ticking = false;
    }
    addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
    if (top) top.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }

  /* ---------- Nav: menú móvil (Esc para cerrar, bloqueo de scroll) ---------- */
  function initNav() {
    var toggle = $("[data-nav-toggle]");
    var mobile = $("[data-nav-mobile]");
    if (!toggle || !mobile) return;
    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      mobile.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
      if (open) { var first = $("a", mobile); if (first) first.focus({ preventScroll: true }); }
    }
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    $$("a", mobile).forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobile.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
    });
    matchMedia("(min-width: 960px)").addEventListener("change", function (e) { if (e.matches) setOpen(false); });
  }

  /* ---------- Hero: gradiente reactivo al cursor ---------- */
  function initHeroGradient() {
    var hero = $("[data-hero-gradient]");
    if (!hero || !fineHover || reduced) return;
    var raf = null;
    hero.addEventListener("mousemove", function (e) {
      var rect = hero.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        hero.style.setProperty("--mx", x + "%");
        hero.style.setProperty("--my", y + "%");
      });
    });
  }

  /* ---------- Slogan: Conecta → Activa → Escala se encienden en secuencia ---------- */
  function initSlogan() {
    var words = $$("[data-slogan] span");
    if (!words.length) return;
    if (reduced) { words.forEach(function (w) { w.classList.add("is-on"); }); return; }
    var i = 0;
    function step() {
      words.forEach(function (w, k) { w.classList.toggle("is-on", k <= i); });
      i = (i + 1) % (words.length + 1);
      setTimeout(step, i === 0 ? 2200 : 900);
    }
    setTimeout(step, 600);
  }

  /* ---------- Aparición al hacer scroll ---------- */
  function initReveals() {
    var els = $$("[data-reveal]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || reduced) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    // Escalonado: los hermanos dentro del mismo contenedor entran uno tras otro
    els.forEach(function (el) {
      var siblings = el.parentElement ? $$(":scope > [data-reveal]", el.parentElement) : [el];
      el.style.setProperty("--i", Math.max(0, siblings.indexOf(el)) % 6);
      io.observe(el);
    });
    // Red de seguridad: nada queda invisible si el observer no dispara
    setTimeout(function () {
      els.forEach(function (el) {
        if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-visible");
      });
    }, 2500);
  }

  /* ---------- Contadores animados ---------- */
  function initCounters() {
    var els = $$("[data-count]");
    if (!els.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var end = parseInt(el.getAttribute("data-count"), 10) || 0;
        if (reduced) { el.textContent = end; return; }
        var t0 = null, dur = 1400;
        function frame(t) {
          if (!t0) t0 = t;
          var p = Math.min(1, (t - t0) / dur);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Botones magnéticos + spotlight en tarjetas ---------- */
  function initPointerFx() {
    if (!fineHover || reduced) return;
    $$("[data-magnetic]").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = "translate(" + (x * 0.16) + "px," + (y * 0.28) + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
    });
    $$("[data-spotlight]").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--sx", (e.clientX - r.left) + "px");
        card.style.setProperty("--sy", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ---------- Sub-navegación de servicios: resalta la sección visible ---------- */
  function initScrollSpy() {
    var links = $$("[data-subnav] a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("is-active"); });
        var a = map[entry.target.id];
        if (a) {
          a.classList.add("is-active");
          // Desplaza solo la barra (horizontal), nunca la página
          var bar = a.parentElement;
          bar.scrollLeft = a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2;
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Recomendador "¿Por dónde empiezo?" ---------- */
  var PACKAGES = {
    base: {
      name: "Fusión Base",
      value: "Fusión Base",
      badge: "Arranque",
      text: "Primero hay que ordenar la casa: entender tu mercado, definir qué te hace distinto y salir a redes con un mensaje claro.",
      items: ["Diagnóstico de marca y mercado", "Estrategia de marca y tono de voz", "Redes sociales básicas"]
    },
    activa: {
      name: "Fusión Activa",
      value: "Fusión Activa",
      badge: "Retainer mensual",
      text: "Ya tienes una base: lo que te falta es constancia y canales que traigan clientes todos los meses.",
      items: ["Todo lo de Fusión Base", "Publicidad paga en Meta y Google", "Contenido y SEO local"]
    },
    total: {
      name: "Fusión Total",
      value: "Fusión Total",
      badge: "Retainer premium",
      text: "Tu negocio ya tiene tracción. Toca medir, optimizar la conversión y decidir el siguiente canal con datos.",
      items: ["Todo lo de Fusión Activa", "Analítica y reportería mensual", "Optimización de conversión y acompañamiento estratégico"]
    }
  };
  function initQuiz() {
    var quiz = $("[data-quiz]");
    if (!quiz) return;
    var steps = $$("[data-quiz-step]", quiz);
    var bars = $$(".quiz-progress i", quiz);
    var result = $("[data-quiz-result]", quiz);
    var score, current;
    function show(i) {
      current = i;
      steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
      bars.forEach(function (b, k) { b.classList.toggle("is-done", k < i || (i === -1)); });
      result.classList.toggle("is-active", i === -1);
    }
    function reset() { score = { base: 0, activa: 0, total: 0 }; show(0); }
    quiz.addEventListener("click", function (e) {
      var opt = e.target.closest("[data-pick]");
      if (opt) {
        score[opt.getAttribute("data-pick")] += 1;
        if (current + 1 < steps.length) { show(current + 1); $(".quiz-option", steps[current]).focus({ preventScroll: true }); return; }
        var best = "activa";
        ["base", "activa", "total"].forEach(function (k) { if (score[k] > score[best]) best = k; });
        var p = PACKAGES[best];
        $("[data-quiz-name]", result).textContent = p.name;
        $("[data-quiz-badge]", result).textContent = p.badge;
        $("[data-quiz-text]", result).textContent = p.text;
        var ul = $("[data-quiz-items]", result);
        ul.innerHTML = "";
        p.items.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
        $("[data-quiz-cta]", result).setAttribute("href", "contacto.html?servicio=" + encodeURIComponent(p.value) + "#form");
        show(-1);
        $("[data-quiz-name]", result).focus({ preventScroll: true });
      }
      if (e.target.closest("[data-quiz-reset]")) reset();
    });
    reset();
  }

  /* ---------- Formulario de contacto ---------- */
  function loadTurnstile(slot) {
    if (!formCfg.turnstileSiteKey || !slot) return;
    slot.innerHTML = '<div class="cf-turnstile" data-sitekey="' + formCfg.turnstileSiteKey + '" data-theme="dark" data-language="es"></div>';
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }

  function initContactForm() {
    var form = $("[data-contact-form]");
    if (!form) return;
    var status = $("[data-form-status]", form);
    var btn = $("button[type=submit]", form);
    var msg = $("#mensaje", form);
    var counter = $("[data-count-for]", form);

    // Preselecciona el servicio si viene en la URL (?servicio=Fusión Activa)
    var pre = new URLSearchParams(location.search).get("servicio");
    var sel = $("#servicio", form);
    if (pre && sel) {
      $$("option", sel).forEach(function (o) { if (o.value === pre) sel.value = pre; });
    }

    var preMode = new URLSearchParams(location.search).get("modalidad");
    if (preMode) {
      var radio = $('input[name="modalidad"][value="' + preMode.replace(/"/g, "") + '"]', form);
      if (radio) radio.checked = true;
    }

    if (msg && counter) {
      var max = parseInt(msg.getAttribute("maxlength"), 10) || 2000;
      var upd = function () { counter.textContent = msg.value.length + " / " + max; };
      msg.addEventListener("input", upd); upd();
    }

    loadTurnstile($("[data-turnstile]", form));

    // Validación en línea, amable: solo marca errores tras salir del campo
    $$("input, select, textarea", form).forEach(function (f) {
      f.addEventListener("blur", function () { validateField(f); });
      f.addEventListener("input", function () { if (f.closest(".field.is-invalid")) validateField(f); });
    });
    function validateField(f) {
      var wrap = f.closest(".field");
      if (!wrap || f.type === "checkbox") return true;
      var ok = f.checkValidity();
      wrap.classList.toggle("is-invalid", !ok);
      f.setAttribute("aria-invalid", String(!ok));
      return ok;
    }

    function setStatus(kind, html) {
      status.className = "form-status is-visible is-" + kind;
      status.innerHTML = html;
    }

    function mailtoFallback(fd) {
      var to = contact.email || "hola@fuseconsultora.com";
      var subject = "Contacto desde la web — " + (fd.get("nombre") || "");
      var body = [
        "Nombre: " + (fd.get("nombre") || ""),
        "Empresa: " + (fd.get("empresa") || "(no indicada)"),
        "Email: " + (fd.get("email") || ""),
        "Teléfono: " + (fd.get("telefono") || "(no indicado)"),
        "Servicio de interés: " + (fd.get("servicio") || "(no indicado)"),
        "Modalidad de reunión: " + (fd.get("modalidad") || "(no indicada)"),
        "Presupuesto mensual: " + (fd.get("presupuesto") || "(no indicado)"),
        "",
        "Mensaje:",
        fd.get("mensaje") || ""
      ].join("\n");
      window.location.href = "mailto:" + to + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      setStatus("info", "Abrimos tu programa de correo con el mensaje listo para enviar. Si no se abrió, escríbenos a <a href=\"mailto:" + to + "\">" + to + "</a>.");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fields = $$("input, select, textarea", form).filter(function (f) { return f.name && f.name !== "website"; });
      var firstBad = null;
      fields.forEach(function (f) { if (!validateField(f) && !firstBad) firstBad = f; });
      if (!form.checkValidity()) { form.reportValidity(); if (firstBad) firstBad.focus(); return; }

      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function (v, k) { payload[k] = typeof v === "string" ? v.trim() : v; });
      payload.page = location.pathname;

      btn.setAttribute("aria-busy", "true");
      status.className = "form-status";

      fetch(formCfg.endpoint || "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) { return { res: res, json: json }; });
      }).then(function (r) {
        if (r.res.ok && r.json.ok) {
          form.reset();
          if (counter && msg) counter.textContent = "0 / " + (msg.getAttribute("maxlength") || 2000);
          if (window.turnstile) try { window.turnstile.reset(); } catch (_) {}
          setStatus("success", "<strong>¡Mensaje recibido!</strong>&nbsp;Te responderemos muy pronto al correo que nos dejaste (revisa también la carpeta de spam).");
          status.setAttribute("tabindex", "-1"); status.focus();
          if (typeof window.zaraz !== "undefined") try { window.zaraz.track("lead"); } catch (_) {}
          return;
        }
        // El servidor de formularios aún no está configurado (o estamos en local): usamos el correo
        if ([404, 405, 501, 503].indexOf(r.res.status) !== -1) { mailtoFallback(fd); return; }
        setStatus("error", (r.json && r.json.error) || "No pudimos enviar tu mensaje. Intenta de nuevo en un momento.");
      }).catch(function () {
        mailtoFallback(fd);
      }).then(function () {
        btn.removeAttribute("aria-busy");
      });
    });
  }

  /* ---------- Agenda de reuniones (Google Calendar en un modal) ---------- */
  function initBooking() {
    var cfg = data.booking || {};
    var urls = { virtual: cfg.virtualUrl || "", presencial: cfg.presencialUrl || "" };
    var dlg = $("[data-booking-dialog]");
    var triggers = $$("[data-booking]");
    if (!urls.virtual && !urls.presencial) {
      // Sin agenda configurada: los botones llevan al formulario con la modalidad elegida
      triggers.forEach(function (t) {
        var mode = t.getAttribute("data-booking");
        var inPage = !!$("[data-contact-form]");
        var q = mode === "virtual" ? "Videollamada" : mode === "presencial" ? "Presencial" : "";
        t.setAttribute("href", (inPage ? "" : "contacto.html") + (q ? "?modalidad=" + encodeURIComponent(q) : "") + "#form");
        if (inPage && q) t.addEventListener("click", function () {
          var r = $('input[name="modalidad"][value="' + q + '"]'); if (r) r.checked = true;
        });
      });
      return;
    }
    // Solo el enlace largo de Google (…/calendar/appointments/…) se puede incrustar;
    // los enlaces cortos (calendar.app.google) se abren en una pestaña nueva.
    var embeddable = function (u) { return /calendar\.google\.com\/calendar\/appointments|cal\.com\/|calendly\.com\//.test(u); };
    if (!dlg || typeof dlg.showModal !== "function" || !embeddable(urls.virtual || urls.presencial)) {
      // Navegador antiguo: abre la página de reservas en otra pestaña
      triggers.forEach(function (t) {
        var mode = t.getAttribute("data-booking") || (urls.virtual ? "virtual" : "presencial");
        t.setAttribute("href", urls[mode] || urls.virtual || urls.presencial);
        t.setAttribute("target", "_blank"); t.setAttribute("rel", "noopener");
      });
      return;
    }
    var frameBox = $(".booking-frame", dlg);
    var note = $("[data-booking-note]", dlg);
    var tabs = $$("[data-booking-tab]", dlg);
    var lastFocus = null;

    tabs.forEach(function (tab) {
      if (!urls[tab.getAttribute("data-booking-tab")]) tab.hidden = true;
      tab.addEventListener("click", function () { select(tab.getAttribute("data-booking-tab")); });
    });
    if (tabs.filter(function (t) { return !t.hidden; }).length < 2) $(".booking-tabs", dlg).hidden = true;

    function embedUrl(u) {
      // Las páginas de reserva de Google aceptan ?gv=true para incrustarse
      if (/calendar\.google\.com\/calendar\/appointments/.test(u) && u.indexOf("gv=true") === -1) u += (u.indexOf("?") === -1 ? "?" : "&") + "gv=true";
      return u;
    }
    function select(mode) {
      if (!urls[mode]) mode = urls.virtual ? "virtual" : "presencial";
      tabs.forEach(function (t) { t.setAttribute("aria-selected", String(t.getAttribute("data-booking-tab") === mode)); });
      note.textContent = cfg[mode + "Note"] || "";
      var old = $("iframe", frameBox); if (old) old.remove();
      frameBox.classList.add("is-loading");
      var f = document.createElement("iframe");
      f.src = embedUrl(urls[mode]);
      f.title = "Calendario de reservas — " + (mode === "virtual" ? "videollamada" : "presencial");
      f.loading = "lazy";
      f.addEventListener("load", function () { frameBox.classList.remove("is-loading"); });
      frameBox.appendChild(f);
      var nt = $("[data-booking-newtab]", dlg); if (nt) nt.setAttribute("href", urls[mode]);
      if (typeof window.zaraz !== "undefined") try { window.zaraz.track("booking_open", { mode: mode }); } catch (_) {}
    }
    function open(mode) {
      lastFocus = document.activeElement;
      select(mode);
      dlg.showModal();
      document.body.classList.add("is-locked");
    }
    dlg.addEventListener("close", function () {
      document.body.classList.remove("is-locked");
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    });
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest("[data-booking-close]")) dlg.close();
    });
    triggers.forEach(function (t) {
      t.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        open(t.getAttribute("data-booking") || "virtual");
      });
    });
    if (location.hash === "#agendar") open("virtual");
  }

  /* ---------- Botón flotante de WhatsApp ---------- */
  function initWhatsApp() {
    // Enlaces "coordinar por WhatsApp" de la agenda
    var bookLink = waLink(contact.whatsappBookingMessage);
    $$("[data-wa-book]").forEach(function (a) {
      var wrap = a.closest("[data-wa-book-wrap]") || a;
      if (!bookLink) { wrap.hidden = true; return; }
      a.setAttribute("href", bookLink);
      wrap.hidden = false;
    });
    var fab = $("[data-wa-fab]");
    if (!fab) return;
    var link = waLink();
    if (!link) { fab.hidden = true; return; }
    fab.setAttribute("href", link);
    fab.hidden = false;
  }

  /* ---------- Año dinámico en footer ---------- */
  function mountYear() {
    var year = String(new Date().getFullYear());
    $$("[data-year]").forEach(function (el) { el.textContent = year; });
  }

  function boot() {
    safe(mountBrand, "mountBrand");
    safe(initScrollUI, "initScrollUI");
    safe(initNav, "initNav");
    safe(initHeroGradient, "initHeroGradient");
    safe(initSlogan, "initSlogan");
    safe(initReveals, "initReveals");
    safe(initCounters, "initCounters");
    safe(initPointerFx, "initPointerFx");
    safe(initScrollSpy, "initScrollSpy");
    safe(initQuiz, "initQuiz");
    safe(initContactForm, "initContactForm");
    safe(initBooking, "initBooking");
    safe(initWhatsApp, "initWhatsApp");
    safe(mountYear, "mountYear");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
