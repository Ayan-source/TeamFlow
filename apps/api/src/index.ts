import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { app } from "./app.js";
import { parsePort } from "./config.js";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const port = parsePort(process.env.PORT);

app.listen(port, "127.0.0.1", () => {
  console.log(`TeamFlow API listening on http://127.0.0.1:${port}`);
});
