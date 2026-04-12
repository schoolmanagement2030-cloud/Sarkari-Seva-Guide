import { fetchAndSyncData } from "./server.ts";

async function run() {
  console.log("Running manual sync...");
  await fetchAndSyncData();
  console.log("Sync completed.");
  process.exit(0);
}

run();
