/* Se carga en <head> sin defer: marca que hay JS antes del primer pintado
   para que las animaciones de entrada no provoquen parpadeos. */
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

/* Modo liviano: con "ahorro de datos" o conexión lenta (2G/3G) se apagan
   los efectos más pesados (desenfoques, animaciones continuas). */
try {
  var c = navigator.connection || {};
  if (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || "") ||
      (window.matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches)) {
    document.documentElement.classList.add("lite");
  }
} catch (e) {}
