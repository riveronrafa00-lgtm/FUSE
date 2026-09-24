/* Se carga en <head> sin defer: marca que hay JS antes del primer pintado
   para que las animaciones de entrada no provoquen parpadeos. */
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");
