import { getAppDatabasePath, migrateAppDatabase } from "../database";
import { spawn } from "node:child_process";

migrateAppDatabase();
const appDbPath = getAppDatabasePath();
console.log("Launching Drizzle Studio for app database");
console.log(`SQLite DB path: ${appDbPath}`);

const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) {
    env[key] = value;
  }
}
env["DRIZZLE_DB_PATH"] = appDbPath;

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const drizzleKitProcess = spawn(
  command,
  ["exec", "drizzle-kit", "studio", "--config=drizzle.config.ts"],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  },
);

drizzleKitProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});
