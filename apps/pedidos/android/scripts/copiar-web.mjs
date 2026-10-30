// Copia el panel (../api/public) a www/ para empaquetarlo dentro del APK.
// Si pasas la URL del servidor, queda preconfigurada:  npm run copiar -- http://192.168.1.20:8080
import { cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";

const origen = new URL("../../api/public/", import.meta.url);
const destino = new URL("../www/", import.meta.url);
rmSync(destino, { recursive: true, force: true });
cpSync(origen, destino, { recursive: true });

const servidor = process.argv[2];
if (servidor) {
  const cfg = new URL("config.js", destino);
  writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/servidor: ".*?"/, `servidor: ${JSON.stringify(servidor)}`));
  console.log("Servidor preconfigurado:", servidor);
}
console.log("Panel copiado a android/www");
