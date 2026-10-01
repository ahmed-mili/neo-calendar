import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Ce que l'APK embarque : les vignettes des fonds d'écran et leur manifeste,
 * rien d'autre. L'ancienne interface (WebView) n'existe plus dans l'APK : plus
 * de page, de script ni de police web. Les fonds en pleine résolution ne
 * voyagent pas non plus ; ils arrivent un par un dans
 * `.neo-calendar/wallpapers/` du dossier de données quand on les choisit.
 *
 * Les vignettes permettent au sélecteur de s'ouvrir instantanément et hors
 * ligne. Elles viennent directement de `apps/windows/public`, sans passer par
 * un build web.
 */
const WALLPAPERS = "themes/neo-wallpapers";
const src = new URL(`../../windows/public/${WALLPAPERS}/`, import.meta.url);
const dst = new URL(`../native/app/src/main/assets/${WALLPAPERS}/`, import.meta.url);
const root = fileURLToPath(src);

function keep(source) {
    const relative = path.relative(root, source).split(path.sep).join("/");
    if (relative === "") return true;
    // Les vignettes et le manifeste ; les pleines résolutions, non.
    return relative.startsWith("thumbs") || !/\.jpe?g$/i.test(relative);
}

fs.rmSync(new URL("../native/app/src/main/assets/", import.meta.url), { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true, filter: keep });

console.log(`Synced wallpaper thumbnails to ${fileURLToPath(dst)}`);
