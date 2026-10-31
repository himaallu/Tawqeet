import { spawnSync } from "node:child_process";
for (const name of ["tawqeet", "api-server"]) {
  const result = spawnSync("pnpm", ["--filter", `@workspace/${name}`, "run", "build"], {
    stdio: "inherit", env: { ...process.env, NODE_ENV: "production", BASE_PATH: process.env.BASE_PATH || "/", PORT: process.env.PORT || "3000" },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
