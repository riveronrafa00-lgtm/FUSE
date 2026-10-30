// Conexión a SQL Server (cmch-dc1). Un solo pool compartido por toda la API.
import sql from "mssql";

const env = process.env;

const config = {
  server: env.DB_SERVER || "cmch-dc1",
  database: env.DB_NAME || "PedidosApp",
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  port: env.DB_PORT && !env.DB_INSTANCE ? Number(env.DB_PORT) : undefined,
  requestTimeout: 30_000,
  connectionTimeout: 15_000,
  pool: { max: 10, min: 1, idleTimeoutMillis: 60_000 },
  options: {
    instanceName: env.DB_INSTANCE || undefined,
    encrypt: env.DB_ENCRYPT === "true",
    trustServerCertificate: env.DB_TRUST_CERT !== "false",
    appName: "PedidosCerveza",
    // La app solo lee: evita bloquear a Exact y no espera por transacciones abiertas.
    readOnlyIntent: true,
  },
};

let poolPromise = null;

export function pool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = null; // reintenta en la próxima petición
      throw err;
    });
  }
  return poolPromise;
}

export async function request() {
  return (await pool()).request();
}

export const describe = () => `${config.server}${config.options.instanceName ? "\\" + config.options.instanceName : ""} / ${config.database}`;

export { sql };
