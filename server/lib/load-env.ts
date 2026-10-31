// Loads .env for standalone scripts (worker, migrate, seed). Next.js loads it on its own;
// on Replit secrets come from the environment, so a missing file is fine.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}
