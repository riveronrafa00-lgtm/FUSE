(function () {
  "use strict";

  var data = window.__BRAND__ || {};
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  /* ---------- Nav: menú móvil ---------- */
  function initNav() {
    var toggle = $("[data-nav-toggle]");
    var mobile = $("[data-nav-mobile]");
    if (!toggle || !mobile) return;
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      mobile.classList.toggle("is-open", !open);
      document.body.style.overflow = !open ? "hidden" : "";
    });
    $$("a", mobile).forEach(function (a) {
      a.addEventListener("click", function () {
        toggle.setAttribute("aria-expanded", "false");
        mobile.classList.remove("is-open");
        document.body.style.overflow = "";
      });
    });
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

  /* ---------- Reveal on scroll ---------- */
  function initReveals() {
    var els = $$("[data-reveal]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
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
    }, { threshold: 0.01, rootMargin: "0px 0px -2% 0px" });
    els.forEach(function (el, i) {
      el.style.setProperty("--i", i % 6);
      io.observe(el);
    });
    setTimeout(function () {
      els.forEach(function (el) {
        if (!el.classList.contains("is-visible") && el.getBoundingClientRect().top < innerHeight) {
          el.classList.add("is-visible");
        }
      });
    }, 6000);
  }

  /* ---------- Botones magnéticos (sutil) ---------- */
  function initMagnetic() {
    if (!fineHover || reduced) return;
    $$("[data-magnetic]").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = "translate(" + (x * 0.18) + "px," + (y * 0.32) + "px)";
      });
      btn.addEventListener("mouseout", function (e) {
        if (btn.contains(e.relatedTarget)) return;
        btn.style.transform = "";
      });
    });
  }

  /* ---------- Scroll suave para anclas ---------- */
  function initAnchorScroll() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id === "#") return;
      var el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      var navOffset = 92;
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - navOffset,
        behavior: reduced ? "auto" : "smooth"
      });
    });
  }

  /* ---------- Formulario de contacto ---------- */
  function initContactForm() {
    var form = $("[data-contact-form]");
    if (!form) return;
    var success = $("[data-form-success]", form.parentElement) || $("[data-form-success]");

    form.addEventListener("submit", function (e) {
      if (!form.reportValidity()) return;
      e.preventDefault();

      var name = $('[name="nombre"]', form);
      var email = $('[name="email"]', form);
      var phone = $('[name="telefono"]', form);
      var service = $('[name="servicio"]', form);
      var message = $('[name="mensaje"]', form);

      var subject = "Contacto desde la web — " + (name ? name.value : "");
      var body = [
        "Nombre: " + (name ? name.value : ""),
        "Email: " + (email ? email.value : ""),
        "Teléfono: " + (phone ? phone.value : "(no indicado)"),
        "Servicio de interés: " + (service ? service.value : "(no indicado)"),
        "",
        "Mensaje:",
        (message ? message.value : "")
      ].join("\n");

      var mailto = form.getAttribute("action") || "mailto:hola@fuseconsultora.com";
      var link = mailto + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);

      window.location.href = link;

      if (success) {
        success.classList.add("is-visible");
        success.setAttribute("tabindex", "-1");
        success.focus({ preventScroll: true });
      }
      form.reset();
    });
  }

  /* ---------- Año dinámico en footer ---------- */
  function mountYear() {
    var els = $$("[data-year]");
    var year = String(new Date().getFullYear());
    els.forEach(function (el) { el.textContent = year; });
  }

  function boot() {
    safe(initNav, "initNav");
    safe(initHeroGradient, "initHeroGradient");
    safe(initReveals, "initReveals");
    safe(initMagnetic, "initMagnetic");
    safe(initAnchorScroll, "initAnchorScroll");
    safe(initContactForm, "initContactForm");
    safe(mountYear, "mountYear");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
