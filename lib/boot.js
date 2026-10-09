/* Se carga en <head> sin defer: marca que hay JS antes del primer pintado
   para que las animaciones de entrada no provoquen parpadeos. */
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

/* Modo liviano: solo con "ahorro de datos" o conexión 2G real se apagan
   los efectos más pesados (desenfoques, grano, halos).
   No se usa 3G: el navegador estima la velocidad y en Cuba casi todas las
   conexiones (datos móviles, Nauta, wifi compartido) aparecen como "3g",
   lo que dejaba el sitio sin animaciones para el público principal. */
try {
  var c = navigator.connection || {};
  if (c.saveData || /2g$/.test(c.effectiveType || "") ||
      (window.matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches)) {
    document.documentElement.classList.add("lite");
  }
} catch (e) {}
