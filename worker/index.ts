import { runWorker } from "../artifacts/api-server/src/lib/worker-runtime";
runWorker().catch(() => {
  process.stderr.write("Tawqeet worker failed to start. Check the database and schema.\n");
  process.exit(1);
});
