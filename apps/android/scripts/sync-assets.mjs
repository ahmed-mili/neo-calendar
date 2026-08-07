import fs from "node:fs";
import { fileURLToPath } from "node:url";

const src = new URL("../dist/", import.meta.url);
const dst = new URL("../native/app/src/main/assets/", import.meta.url);

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });

console.log(`Synced Android web assets to ${fileURLToPath(dst)}`);
