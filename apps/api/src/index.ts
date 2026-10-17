import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import express from "express";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const app = express();
const port = Number(process.env.PORT ?? "3001");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`TeamFlow API listening on http://127.0.0.1:${port}`);
});
