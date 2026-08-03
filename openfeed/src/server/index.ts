import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port.");
}

const isProduction = process.env.NODE_ENV === "production";
const app = createApp({ isProduction, serveClient: isProduction });
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Openfeed ${isProduction ? "production" : "API"} server listening on port ${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received; closing Openfeed.`);
  server.close((error) => {
    if (error) {
      console.error("Server shutdown failed", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
