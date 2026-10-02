# Thèmes et fond d'écran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réduire Neo Calendar à 6 thèmes fidèles à leur palette officielle (clair et sombre), rendre le fond d'écran indépendant du thème, et prouver la lisibilité de tous les panneaux par un test de contraste et des images côte à côte (PC et Android).

**Architecture:** Un réglage global `wallpaperId` s'ajoute à `AppearancePreferences` (PC `appearancePreferences.ts`, Android `core/.../appearance/AppearancePreferences.kt`), lu avec repli sur le fond du thème actuel puis sur le défaut ; il est écrit au même format JSON des deux côtés. Les 8 thèmes retirés disparaissent du registre, du CSS et de `Themes.kt` ; un identifiant inconnu retombe sur Catppuccin (`getTheme`). La dérivation des couleurs de panneau (aujourd'hui des `color-mix` inline dans `App.tsx`, des formules dans `ThemeColors.kt`) devient du code pur testable ; un module de contraste WCAG et un test échouent si une paire texte / surface passe sous son seuil. Chaque thème gagne une palette claire (`light`) relevée à la source officielle.

**Tech Stack:** PC : TypeScript, React 17, Jest + ts-jest (lancé depuis la racine), Vite, Tauri. Android : Kotlin, Jetpack Compose, `core` (JVM pur, JUnit), Gradle.

**Spec:** `docs/superpowers/specs/2026-10-02-themes-et-fond-d-ecran-design.md`

## Global Constraints

Règles d'Ahmed (s'imposent à toutes les tâches) :

- **LANCEMENT ANDROID : ULTRA IMPORTANT.** L'app se lance aussi vite qu'en 1.87.0. RIEN de nouveau avant le premier écran, RIEN sur le fil principal (pas d'I/O, pas de boucle sur le catalogue, pas de calcul de contraste, pas de WebView). Ne pas contourner ni déplacer la copie des notes `CachedWorkspaceStorage`. Garder « le rond seul sur fond uni pendant le chargement, fond d'écran et grille arrivent ensemble » (commits `ddc44f6`, `9f5c67a`, spec `2026-10-02-android-lancement-rapide.md`) : ne pas toucher à `WallpaperLayer`, à l'ordre d'appel de `NeoAppearance.load(this)` dans `NativeActivity.onCreate`, ni au fond de fenêtre (`res/values*/themes.xml`). Le démarrage est MESURÉ avant (Task 2, Step 1) et après (Task 8) ; une régression BLOQUE la livraison.
- **Aucune migration forcée.** Une mise à jour ne change rien de visible tant que la personne ne touche à rien : on ne réécrit aucune préférence au chargement ; le fond global est lu avec repli, et n'est écrit que sur un geste (choisir un fond, changer de thème, réinitialiser un thème). Exceptions voulues et seules visibles : le thème retiré qui retombe sur Catppuccin, les écarts de palette corrigés (Task 4), le mode clair thématisé (Task 5 et 6).
- **Préférences partagées PC / Android au même format** : clé `neo-calendar.appearance` (JSON `{mode, translucentSidebar, contrast, themeOverrides, wallpaperId?}`), effets du fond `neo-calendar-wallpaper-effects-v1`, format de partage `codex-theme-v1`. `wallpaperId` global est écrit EN DERNIER (après `themeOverrides`), uniquement s'il est défini.
- **Tout code Android est en Kotlin ; aucun fichier Java créé.**
- **D'autres personnes ont l'app** : un utilisateur dont le thème enregistré est retiré, ou dont les préférences viennent d'une version plus ancienne, ne doit jamais voir un plantage ni un écran vide.
- **adb : TOUJOURS `-s emulator-5554`.** Le téléphone d'Ahmed n'est pas branché ; ne viser aucun autre appareil. Ne JAMAIS désinstaller l'app de l'émulateur (`adb install -r` seulement ; en cas d'échec de signature, s'arrêter et demander).
- **Aucun agent de revue** pour UI, libellés, tests mécaniques ; une revue sonnet seulement pour la Task 1, la Task 2 (écriture de préférences relues par des versions plus anciennes) ; jamais de re-revue. Tout agent délégué : modèle `sonnet` écrit explicitement ; lire `quota` (ou `~/.claude/quota-last.txt`) avant chaque dispatch, s'arrêter à 90 % sur 5 h sauf reset dans 20 min ou moins.
- **Fidélité** : aucune valeur de palette n'est écrite de mémoire dans ce plan NI dans le code. Chaque valeur adoptée cite sa source (URL brute, chemin, clé, SHA ou date de lecture) dans le relevé de la Task 4.
- **Commits** en français, avec les deux trailers : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex`.
- Textes en français (accents), sans emoji ni tiret cadratin.

Conventions de travail :

- Copie de travail : `C:\dev\neo-calendar`, branche `android-parite`.
- **PC** : tests depuis la RACINE, `npx jest <chemin>` (Jest + ts-jest, config `jest.config.js`, environnement `node`) ; suite entière : `npm test` (long, une seule fois en fin de tâche si demandé). Type-check : `npx tsc --noEmit -p apps/windows` (depuis la racine) ; build complet : `npm run build`.
- **Android** : PowerShell dans `C:\dev\neo-calendar\apps\android\native`, avec `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`. Build : `.\gradlew.bat :core:test assembleDebug`. `adb` = `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`. Paquet : `com.ahmedmili.neocalendar`, activité : `com.ahmed.neocalendar.nativeapp.NativeActivity`.
- **Piège Windows** : `--tests '*mot*'` est transformé en nom de fichier par le lanceur Java. Toujours un nom de classe ou de paquet complet : `--tests 'com.ahmed.neocalendar.core.appearance.AppearancePreferencesTest'`.
- **Fins de ligne** : les sources sont en CRLF (`core.autocrlf=true`). Les blocs de ce plan sont en LF : créer un fichier avec l'outil Write, modifier un existant avec l'outil Edit (il garde les fins de ligne). Les scripts Node de ce plan lisent et écrivent en conservant `\r\n`.
- Préférences natives de l'émulateur : sauvegarder avant tout essai : `& $adb -s emulator-5554 shell run-as com.ahmedmili.neocalendar cat shared_prefs/neo_native_appearance.xml > $env:TEMP\neo_native_appearance.avant.xml`, et la restaurer après.

## Review Focus

Entrées et conditions que la spec implique, qu'aucune tâche ne teste d'elle-même, par ordre de probabilité de gêner une vraie personne. Chaque ligne a son test dans la tâche qui possède le code.

1. **Thème enregistré retiré (PC `themeId` dans `desktop-settings.json`, Android `theme_id`)** : retombe sur Catppuccin sans message, sans plantage ; sa personnalisation (`themeOverrides["tokyo-night"]`) est ignorée mais n'est pas supprimée du fichier. Attendu : `getTheme("tokyo-night").id === "catppuccin-mocha"`, `normalizeDesktopPreferences({themeId:"lobster"}).themeId` idem, `themeIdOfDesktopPreferences` idem (Task 3).
2. **Fond global absent / présent / incohérent avec l'ancien fond par thème** : absent : fond du thème actuel puis défaut ; présent : il gagne sur n'importe quel fond par thème ; valeur inconnue : écartée (donc retour au repli). Attendu : aucun changement visible à la mise à jour (Tasks 1 et 2).
3. **Changer de thème, enregistrer les couleurs, ou réinitialiser un thème tant que le global est absent** ne doit pas changer le fond : sans garde, le repli relirait le fond PAR THÈME du nouveau thème (ou le défaut) et le fond sauterait. Attendu : `pinWallpaperId` au changement de thème, `setThemeCustomization` qui garde le fond par thème existant, `resetThemeCustomization` qui le fige en global (Tasks 1 et 2).
4. **Préférences écrites par une version plus ancienne puis relues** : une version ancienne réécrit le JSON sans `wallpaperId` global (elle le jette à la normalisation) et peut y laisser un fond par thème plus récent : le repli le reprend, aucun plantage ; un JSON avec `wallpaperId` global lu par la version ancienne est ignoré proprement (clé inconnue). Attendu : test de relecture de JSON ancien et nouveau (Tasks 1 et 2).
5. **Mode clair d'un thème** : jamais de texte clair sur fond clair (le thème sombre qui garde son texte dans la coque claire) ; texte sur accent lisible même avec un accent jaune (Ayu) ; accent personnalisé gardé en clair. Attendu : test de contraste clair pour les 6 thèmes + capture des 6 thèmes en clair (Tasks 5, 6, 8).
6. **Contraste du texte secondaire et des pastilles** : `muted` 4,5:1 et `faint` 3:1 sur chaque surface (primaire, secondaire, champ, survol), texte sur accent 4,5:1, accent sur surface 3:1 (pastille de thème, icônes). Une surface personnalisée par l'utilisateur n'est pas garantie : le test porte sur les palettes des thèmes (Tasks 5 et 6).

## Fichiers touchés (carte)

PC (`apps/windows/src`) :
- `themes/appearancePreferences.ts` : fond global, repli, figeage (Task 1).
- `themes/appearancePreferences.test.ts` : créé (Task 1).
- `App.tsx` : passage du changement de thème par le figeage (Task 1), dérivation extraite (Task 5).
- `DesktopSettings.tsx` : fond global, brouillon sans fond, import / copie, deux sections (Tasks 1, 7).
- `themes/types.ts`, `themes/registry.ts`, `themes/codex-themes.css`, `themes/tokyo-night.css` (supprimé), `App.css`, `main.tsx`, `apps/android/src/main.tsx` : retrait des 8 thèmes (Task 3).
- `themes/registry.test.ts`, `platform/preferences.test.ts` : thème retiré (Task 3).
- `themes/themeParity.test.ts` : créé, parité PC / Kotlin (Task 4).
- `themes/contrast.ts`, `themes/panelTokens.ts`, `themes/contrast.test.ts`, `themes/panelTokens.test.ts`, `themes/themeContrast.test.ts` : créés (Task 5).

Android (`apps/android/native`) :
- `core/.../appearance/AppearancePreferences.kt`, `ThemeShare.kt` : fond global (Task 2).
- `core/.../appearance/Themes.kt` : retrait des 8 thèmes (Task 3), `light` (Task 4).
- `core/.../appearance/Contrast.kt` : créé ; `ThemeColors.kt` : clair thématisé (Task 6).
- `app/.../ui/theme/NeoAppearance.kt`, `NeoTokens.kt`, `ui/AppearanceScreen.kt`, `res/raw/i18n_fr_en.tsv` (Tasks 2, 6, 7).
- Tests `core/src/test/.../appearance/` : `AppearancePreferencesTest`, `ThemeShareTest`, `ThemeColorsTest` mis à jour ; `ThemeContrastTest` créé.

Hors dépôt de code : `docs/superpowers/specs/2026-10-02-themes-releve-palettes.md` (relevé, Task 4), `.superpowers/themes/` (mesures, images, rapport, scripts jetables ; Task 8).

---

### Task 1: PC, fond d'écran global

**Files:**
- Modify: `apps/windows/src/themes/appearancePreferences.ts`
- Create: `apps/windows/src/themes/appearancePreferences.test.ts`
- Modify: `apps/windows/src/App.tsx` (import l.8-13, `setTheme` l.62-78 et `onThemeChange` l.321)
- Modify: `apps/windows/src/DesktopSettings.tsx` (`createThemeDraft` l.237-257, `applyWallpaper` l.502-507, `copyCurrentTheme` l.540-560, `importThemeFile` l.563-625, `ThemeWallpaperPicker` l.1488-1493)

**Interfaces:**
- Produces (consommés par les Tasks 3, 5, 7) :
  - `AppearancePreferences.wallpaperId?: WallpaperId`
  - `resolveWallpaperId(preferences: AppearancePreferences, themeId: string): WallpaperId`
  - `setWallpaperId(preferences: AppearancePreferences, wallpaperId: WallpaperId): AppearancePreferences`
  - `pinWallpaperId(preferences: AppearancePreferences, themeId: string): AppearancePreferences`
  - `getEffectiveThemeAppearance(theme, preferences)` : signature inchangée, `wallpaperId` = `resolveWallpaperId(preferences, theme.id)`
  - `resetThemeCustomization` fige le fond ; `setThemeCustomization` garde le fond par thème existant.

- [ ] **Step 1: Write the failing test**

Créer `apps/windows/src/themes/appearancePreferences.test.ts` :

```ts
import {
    getEffectiveThemeAppearance,
    normalizeAppearancePreferences,
    pinWallpaperId,
    resetThemeCustomization,
    resolveWallpaperId,
    setThemeCustomization,
    setWallpaperId,
    type AppearancePreferences,
} from "./appearancePreferences";
import { getTheme } from "./registry";

const base = (patch: Partial<AppearancePreferences> = {}): AppearancePreferences =>
    normalizeAppearancePreferences({ ...patch });

describe("fond d'écran global", () => {
    it("sans réglage global ni fond par thème : le défaut", () => {
        const prefs = base();
        expect(prefs.wallpaperId).toBeUndefined();
        expect(resolveWallpaperId(prefs, "catppuccin-mocha")).toBe("theme-default");
    });

    it("sans réglage global : le fond du thème actuel, jamais celui d'un autre", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: {
                github: { wallpaperId: "panorama-valley" },
                one: { wallpaperId: "golden-summit" },
            },
        });
        expect(resolveWallpaperId(prefs, "github")).toBe("panorama-valley");
        expect(resolveWallpaperId(prefs, "one")).toBe("golden-summit");
        expect(resolveWallpaperId(prefs, "ayu")).toBe("theme-default");
    });

    it("le réglage global l'emporte sur tout fond par thème (incohérence)", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "none",
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        expect(resolveWallpaperId(prefs, "github")).toBe("none");
        expect(getEffectiveThemeAppearance(getTheme("github"), prefs).wallpaperId).toBe("none");
    });

    it("un réglage global inconnu est écarté et le repli reprend", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "inexistant",
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        expect(prefs.wallpaperId).toBeUndefined();
        expect(resolveWallpaperId(prefs, "github")).toBe("panorama-valley");
    });

    it("lit le JSON d'une version plus ancienne (sans clé globale) sans rien inventer", () => {
        const old = '{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{"catppuccin-mocha":{"wallpaperId":"golden-summit"}}}';
        const prefs = normalizeAppearancePreferences(JSON.parse(old));
        expect("wallpaperId" in prefs).toBe(false);
        expect(resolveWallpaperId(prefs, "catppuccin-mocha")).toBe("golden-summit");
        expect(JSON.stringify(prefs)).toBe(old);
    });

    it("écrit la clé globale en dernier, seulement si elle est définie", () => {
        const withGlobal = setWallpaperId(base(), "none");
        expect(JSON.stringify(withGlobal)).toBe(
            '{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{},"wallpaperId":"none"}'
        );
        expect(JSON.stringify(base())).not.toContain("wallpaperId");
    });

    it("un thème retiré dans les préférences ne plante rien et ne change pas le fond lu", () => {
        const prefs = normalizeAppearancePreferences({
            wallpaperId: "none",
            themeOverrides: { "tokyo-night": { accent: "#112233", wallpaperId: "golden-summit" } },
        });
        expect(prefs.themeOverrides["tokyo-night" as never]).toBeDefined();
        expect(resolveWallpaperId(prefs, getTheme("tokyo-night").id)).toBe("none");
    });

    it("changer de thème fige le fond tant que rien n'est global", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        const pinned = pinWallpaperId(prefs, "github");
        expect(pinned.wallpaperId).toBe("panorama-valley");
        expect(resolveWallpaperId(pinned, "one")).toBe("panorama-valley");
        // déjà global : rien ne bouge
        expect(pinWallpaperId(pinned, "one")).toBe(pinned);
    });

    it("enregistrer les couleurs d'un thème garde son fond par thème (repli intact)", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { wallpaperId: "panorama-valley" } },
        });
        const saved = setThemeCustomization(prefs, "github", { accent: "#112233" });
        expect(saved.themeOverrides.github?.accent).toBe("#112233");
        expect(resolveWallpaperId(saved, "github")).toBe("panorama-valley");
    });

    it("réinitialiser un thème ne change plus le fond", () => {
        const prefs = normalizeAppearancePreferences({
            themeOverrides: { github: { accent: "#112233", wallpaperId: "panorama-valley" } },
        });
        const reset = resetThemeCustomization(prefs, "github");
        expect(reset.themeOverrides.github).toBeUndefined();
        expect(resolveWallpaperId(reset, "github")).toBe("panorama-valley");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run : `npx jest apps/windows/src/themes/appearancePreferences.test.ts`
Expected : FAIL, `resolveWallpaperId` / `setWallpaperId` / `pinWallpaperId` « is not exported » (erreur de type ts-jest).

- [ ] **Step 3: Write minimal implementation**

Dans `apps/windows/src/themes/appearancePreferences.ts` (Edit) :

1. Ajouter le champ à l'interface :

```ts
export interface AppearancePreferences {
    mode: AppearanceMode;
    translucentSidebar: boolean;
    contrast: number;
    themeOverrides: Partial<Record<ThemeId, ThemeCustomization>>;
    /** Fond d'écran commun à tous les thèmes. Absent : le fond du thème actuel, puis le défaut. */
    wallpaperId?: WallpaperId;
}
```

2. Dans `normalizeAppearancePreferences`, remplacer le `return` final par :

```ts
    return {
        mode: normalizeMode(input.mode),
        translucentSidebar:
            typeof input.translucentSidebar === "boolean"
                ? input.translucentSidebar
                : DEFAULT_APPEARANCE.translucentSidebar,
        contrast: clampContrast(input.contrast, DEFAULT_APPEARANCE.contrast),
        themeOverrides,
        ...(isWallpaperId(input.wallpaperId)
            ? { wallpaperId: input.wallpaperId }
            : {}),
    };
```

3. Ajouter, avant `getEffectiveThemeAppearance` :

```ts
/**
 * Le fond en vigueur : le réglage global s'il existe, sinon le fond que le
 * thème actuel avait déjà (lecture de repli pour les préférences d'avant le
 * fond global), sinon le défaut. Les fonds des autres thèmes sont ignorés.
 */
export function resolveWallpaperId(
    preferences: AppearancePreferences,
    themeId: string
): WallpaperId {
    return (
        preferences.wallpaperId ??
        preferences.themeOverrides[themeId as ThemeId]?.wallpaperId ??
        getRuntimeDefaultWallpaperId()
    );
}

export function setWallpaperId(
    preferences: AppearancePreferences,
    wallpaperId: WallpaperId
): AppearancePreferences {
    return saveAppearancePreferences({ ...preferences, wallpaperId });
}

/**
 * Écrit le fond en vigueur comme réglage global quand il n'y en a pas encore.
 * À appeler AVANT de changer de thème : sans cela le repli relirait le fond du
 * NOUVEAU thème et l'image sauterait, alors que changer de thème ne doit plus
 * toucher au fond.
 */
export function pinWallpaperId(
    preferences: AppearancePreferences,
    themeId: string
): AppearancePreferences {
    if (preferences.wallpaperId !== undefined) return preferences;
    return setWallpaperId(preferences, resolveWallpaperId(preferences, themeId));
}
```

4. Dans `getEffectiveThemeAppearance`, remplacer la ligne `wallpaperId: override.wallpaperId ?? getRuntimeDefaultWallpaperId(),` par `wallpaperId: resolveWallpaperId(preferences, theme.id),`.

5. Remplacer `setThemeCustomization` et `resetThemeCustomization` par :

```ts
export function setThemeCustomization(
    preferences: AppearancePreferences,
    themeId: ThemeId,
    customization: ThemeCustomization
): AppearancePreferences {
    const normalized = normalizeThemeCustomization(customization);
    // Le fond par thème n'est plus choisi ici, mais tant que le réglage global
    // manque il sert de repli : l'effacer ferait sauter l'image.
    const kept = preferences.themeOverrides[themeId]?.wallpaperId;
    if (kept && !normalized.wallpaperId) normalized.wallpaperId = kept;
    return saveAppearancePreferences({
        ...preferences,
        themeOverrides: { ...preferences.themeOverrides, [themeId]: normalized },
    });
}

export function resetThemeCustomization(
    preferences: AppearancePreferences,
    themeId: ThemeId
): AppearancePreferences {
    const themeOverrides = { ...preferences.themeOverrides };
    // Réinitialiser les couleurs ne touche pas au fond : on le fige.
    const pinned =
        preferences.wallpaperId ?? themeOverrides[themeId]?.wallpaperId;
    delete themeOverrides[themeId];
    return saveAppearancePreferences({
        ...preferences,
        themeOverrides,
        ...(pinned ? { wallpaperId: pinned } : {}),
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run : `npx jest apps/windows/src/themes/appearancePreferences.test.ts`
Expected : PASS, 10 tests. (Si `base()` fait râler le type : `normalizeAppearancePreferences({})` rend déjà un `AppearancePreferences`.)

- [ ] **Step 5: Brancher l'application**

`App.tsx` : importer `loadAppearancePreferences` et `pinWallpaperId` (déjà dans l'import de `./themes/appearancePreferences` : ajouter `pinWallpaperId`). Après `const theme = getTheme(savedThemeId);` ajouter :

```ts
    // Changer de thème ne touche pas au fond : on fige le fond en vigueur
    // avant la bascule, sinon le repli relirait celui du nouveau thème.
    const changeTheme = useCallback(
        async (next: ThemeId) => {
            pinWallpaperId(loadAppearancePreferences(), theme.id);
            await setTheme(next);
        },
        [setTheme, theme.id]
    );
```

Remplacer `onThemeChange={setTheme}` (l.321) par `onThemeChange={changeTheme}`. Vérifier que `ThemeId` et `useCallback` sont déjà importés (`ThemeId` : ajouter `import type { ThemeId } from "./themes/types";` sinon).

`DesktopSettings.tsx` :
- `createThemeDraft` : type de retour `Required<Omit<ThemeCustomization, "wallpaperId">>` et supprimer la ligne `wallpaperId: effective.wallpaperId,`. Faire de même pour l'état `themeDraft` (chercher `useState<Required<ThemeCustomization>>` ou équivalent et appliquer le même type).
- `applyWallpaper` devient :

```ts
    const applyWallpaper = (wallpaperId: WallpaperId) => {
        setAppearance(setWallpaperId(appearance, wallpaperId));
        setThemeMessage(null);
    };
```
  (importer `setWallpaperId`, `resolveWallpaperId` depuis `./themes/appearancePreferences`.)
- `copyCurrentTheme` : supprimer `wallpaperId: themeDraft.wallpaperId,` du JSON copié (le fond n'appartient plus au thème).
- `importThemeFile` : supprimer `wallpaperId?: unknown;` du type analysé et le bloc `if (isWallpaperId(imported.wallpaperId)) {...}` (un fond importé est ignoré) ; retirer l'import `isWallpaperId` s'il n'est plus utilisé.
- Page Apparence : avant `renderAppearance`, ajouter `const currentWallpaperId = resolveWallpaperId(appearance, currentTheme.id);` et passer `value={currentWallpaperId}` à `ThemeWallpaperPicker` (au lieu de `themeDraft.wallpaperId`).

Run : `npx tsc --noEmit -p apps/windows` puis `npx jest apps/windows/src/themes apps/windows/src/DesktopSettings.test.tsx`
Expected : tsc sans erreur ; tous les tests verts.

- [ ] **Step 6: Commit**

```bash
git add apps/windows/src/themes/appearancePreferences.ts apps/windows/src/themes/appearancePreferences.test.ts apps/windows/src/App.tsx apps/windows/src/DesktopSettings.tsx
git commit -m "PC : le fond d'écran est un réglage global, repli sur le fond du thème actuel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 2: Android, fond d'écran global (noyau, préférences natives, mesure du lancement)

**Files:**
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/AppearancePreferences.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/ThemeShare.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/theme/NeoAppearance.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/AppearanceScreen.kt` (l.141-148 import, l.221-225 « Enregistrer », `importedDraft` l.264-272)
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/appearance/AppearancePreferencesTest.kt`, `ThemeShareTest.kt`

**Interfaces:**
- Consumes : le format JSON de la Task 1 (`wallpaperId` en dernier, optionnel).
- Produces (Tasks 3, 6, 7) :
  - `AppearancePreferences.wallpaperId: String? = null`
  - `AppearancePreferences.resolvedWallpaperId(themeId: String, default: String = DEFAULT_ANDROID_WALLPAPER_ID): String`
  - `AppearancePreferences.withWallpaper(wallpaperId: String): AppearancePreferences` (signature changée : plus de `themeId`)
  - `AppearancePreferences.withPinnedWallpaper(themeId: String, default: String = DEFAULT_ANDROID_WALLPAPER_ID): AppearancePreferences`
  - `effectiveThemeAppearance(...)` : `wallpaperId = preferences.wallpaperId ?: override.wallpaperId ?: defaultWallpaper`
  - `ImportedTheme` perd `wallpaperId` ; `themeShareText` n'écrit plus `wallpaperId`.

- [ ] **Step 1: Mesurer le lancement AVANT toute modification (référence 1.87.0)**

Sur le HEAD actuel (aucun fichier modifié), construire et installer, puis mesurer :

```powershell
cd C:\dev\neo-calendar\apps\android\native
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat assembleDebug
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"; $pkg = "com.ahmedmili.neocalendar"
& $adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk
1..6 | ForEach-Object {
  & $adb -s emulator-5554 shell am force-stop $pkg; Start-Sleep 3
  & $adb -s emulator-5554 shell am start -W -n "$pkg/com.ahmed.neocalendar.nativeapp.NativeActivity" | Select-String "TotalTime"
}
```
Jeter la première mesure ; noter les 5 suivantes (moyenne et écart-type) dans `.superpowers/themes/lancement.md` (créer le dossier), section « Avant ». Si `install -r` échoue sur la signature : s'arrêter et demander.

- [ ] **Step 2: Write the failing tests**

Dans `AppearancePreferencesTest.kt`, remplacer le test `choisir un fond garde le reste de la personnalisation` (l.50-54) et la ligne de `ecrire puis relire` qui utilise `wallpaperId = "none"` dans la personnalisation n'a pas à changer (le champ par thème reste lu). Ajouter :

```kotlin
    @Test fun `sans reglage global le fond est celui du theme actuel puis le defaut`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        assertEquals("panorama-valley-portrait", p.resolvedWallpaperId("github"))
        assertEquals(DEFAULT_ANDROID_WALLPAPER_ID, p.resolvedWallpaperId("one"))
        assertEquals("panorama-valley-portrait", effectiveThemeAppearance(getTheme("github"), p).wallpaperId)
    }

    @Test fun `le reglage global l'emporte sur un fond par theme incoherent`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
            .withWallpaper("none")
        assertEquals("none", p.resolvedWallpaperId("github"))
        assertEquals("none", effectiveThemeAppearance(getTheme("github"), p).wallpaperId)
    }

    @Test fun `un reglage global inconnu est ecarte`() {
        val p = parseAppearancePreferences("""{"wallpaperId":"inconnu","themeOverrides":{"github":{"wallpaperId":"panorama-valley-portrait"}}}""")
        assertNull(p.wallpaperId)
        assertEquals("panorama-valley-portrait", p.resolvedWallpaperId("github"))
    }

    @Test fun `le JSON d'une version plus ancienne se relit tel quel et se reecrit sans cle globale`() {
        val old = """{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{"catppuccin-mocha":{"wallpaperId":"golden-summit-portrait"}}}"""
        val p = parseAppearancePreferences(old)
        assertNull(p.wallpaperId)
        assertEquals("golden-summit-portrait", p.resolvedWallpaperId("catppuccin-mocha"))
        assertEquals(old, p.toJsonText())
    }

    @Test fun `la cle globale est ecrite en dernier et relue`() {
        val p = AppearancePreferences().withWallpaper("none")
        assertEquals(
            """{"mode":"dark","translucentSidebar":true,"contrast":50,"themeOverrides":{},"wallpaperId":"none"}""",
            p.toJsonText(),
        )
        assertEquals(p, parseAppearancePreferences(p.toJsonText()))
    }

    @Test fun `changer de theme fige le fond tant que rien n'est global`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        val pinned = p.withPinnedWallpaper("github")
        assertEquals("panorama-valley-portrait", pinned.wallpaperId)
        assertEquals("panorama-valley-portrait", pinned.resolvedWallpaperId("one"))
        assertSame(pinned, pinned.withPinnedWallpaper("one"))
    }

    @Test fun `enregistrer les couleurs garde le fond par theme et reinitialiser fige le fond`() {
        val p = AppearancePreferences()
            .withCustomization("github", ThemeCustomization(wallpaperId = "panorama-valley-portrait"))
        val saved = p.withCustomization("github", ThemeCustomization(accent = "#112233"))
        assertEquals("panorama-valley-portrait", saved.resolvedWallpaperId("github"))
        val reset = saved.withoutCustomization("github")
        assertFalse(reset.themeOverrides.containsKey("github"))
        assertEquals("panorama-valley-portrait", reset.resolvedWallpaperId("github"))
    }

    @Test fun `un theme retire dans les preferences ne plante rien`() {
        val p = parseAppearancePreferences("""{"wallpaperId":"none","themeOverrides":{"tokyo-night":{"accent":"#112233"}}}""")
        assertEquals("none", effectiveThemeAppearance(getTheme("tokyo-night"), p).wallpaperId)
    }
```
Ajouter `import org.junit.Assert.assertSame` en tête. Dans `ThemeShareTest.kt` : supprimer l'assertion `assertEquals("none", back.theme.wallpaperId)` (l.24), la ligne `assertNull(ok.theme.wallpaperId)` (l.47), et dans `val custom = effective.copy(... wallpaperId = "none")` (l.18) garder `wallpaperId = "none"` (le champ d'`EffectiveThemeAppearance` subsiste) ; ajouter :

```kotlin
    @Test fun `la copie du theme ne porte plus de fond`() {
        val text = themeShareText("github", effective)
        assertFalse(text.contains("wallpaperId"))
    }
```
(importer `assertFalse`). Remplacer aussi, dans `AppearancePreferencesTest.kt` l'utilisation de `withWallpaper("one", "none")` : le test `choisir un fond garde le reste de la personnalisation` devient :

```kotlin
    @Test fun `choisir un fond ne touche pas aux personnalisations`() {
        val p = AppearancePreferences().withCustomization("one", ThemeCustomization(accent = "#445566")).withWallpaper("none")
        assertEquals("#445566", p.themeOverrides.getValue("one").accent)
        assertEquals("none", p.wallpaperId)
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run : `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.AppearancePreferencesTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeShareTest'`
Expected : échec de compilation (`resolvedWallpaperId`, `withPinnedWallpaper`, `withWallpaper(String)` introuvables).

- [ ] **Step 4: Write minimal implementation**

`AppearancePreferences.kt` (Edit) :

```kotlin
data class AppearancePreferences(
    val mode: AppearanceMode = AppearanceMode.Dark,
    val translucentSidebar: Boolean = true,
    val contrast: Int = 50,
    val themeOverrides: Map<String, ThemeCustomization> = emptyMap(),
    /** Fond d'écran commun à tous les thèmes ; absent : le fond du thème actuel, puis le défaut. */
    val wallpaperId: String? = null,
)
```

Dans `normalizeAppearancePreferences`, ajouter à la construction : `wallpaperId = input["wallpaperId"].string()?.takeIf { isKnownWallpaperId(it) },`.

Dans `toJsonText`, remplacer la construction par :

```kotlin
fun AppearancePreferences.toJsonText(): String {
    val overrides = LinkedHashMap<String, JsonElement>()
    themeOverrides.forEach { (id, custom) -> overrides[id] = custom.toJson() }
    val fields = linkedMapOf<String, JsonElement>(
        "mode" to JsonPrimitive(mode.key),
        "translucentSidebar" to JsonPrimitive(translucentSidebar),
        "contrast" to JsonPrimitive(contrast),
        "themeOverrides" to JsonObject(overrides),
    )
    wallpaperId?.let { fields["wallpaperId"] = JsonPrimitive(it) }
    return JsonObject(fields).toString()
}
```

`effectiveThemeAppearance` : `wallpaperId = preferences.wallpaperId ?: override.wallpaperId ?: defaultWallpaper,`.

Remplacer `withCustomization`, `withoutCustomization` et `withWallpaper` par :

```kotlin
/** `setThemeCustomization` : normalisée avant d'être rangée ; le fond par thème existant est gardé (il sert de repli tant que le fond global manque). */
fun AppearancePreferences.withCustomization(themeId: String, customization: ThemeCustomization): AppearancePreferences {
    val normalized = normalizeCustomization(customization.toJson())
    val kept = themeOverrides[themeId]?.wallpaperId
    val result = if (normalized.wallpaperId == null && kept != null) normalized.copy(wallpaperId = kept) else normalized
    return copy(themeOverrides = themeOverrides + (themeId to result))
}

/** `resetThemeCustomization` : les couleurs reviennent au thème, le fond reste (figé en réglage global). */
fun AppearancePreferences.withoutCustomization(themeId: String): AppearancePreferences =
    copy(themeOverrides = themeOverrides - themeId, wallpaperId = wallpaperId ?: themeOverrides[themeId]?.wallpaperId)

/** Le fond choisi pour tous les thèmes. */
fun AppearancePreferences.withWallpaper(wallpaperId: String): AppearancePreferences =
    copy(wallpaperId = wallpaperId.takeIf { isKnownWallpaperId(it) } ?: this.wallpaperId)

/** Le fond en vigueur : global, sinon celui du thème `themeId`, sinon le défaut. */
fun AppearancePreferences.resolvedWallpaperId(themeId: String, default: String = DEFAULT_ANDROID_WALLPAPER_ID): String =
    wallpaperId ?: themeOverrides[themeId]?.wallpaperId ?: default

/** À appeler AVANT de changer de thème : sans réglage global, le repli relirait le fond du nouveau thème. */
fun AppearancePreferences.withPinnedWallpaper(themeId: String, default: String = DEFAULT_ANDROID_WALLPAPER_ID): AppearancePreferences =
    if (wallpaperId != null) this else copy(wallpaperId = resolvedWallpaperId(themeId, default))
```

`ThemeShare.kt` : supprimer `"wallpaperId" to JsonPrimitive(theme.wallpaperId),`, le champ `val wallpaperId: String? = null,` d'`ImportedTheme` et la ligne `wallpaperId = ...takeIf { isKnownWallpaperId(it) },` de `parseThemeShare`.

- [ ] **Step 5: Run tests to verify they pass**

Run : `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.AppearancePreferencesTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeShareTest'`
Expected : PASS. (`ThemeColorsTest` n'est pas touché ici.)

- [ ] **Step 6: Brancher `NeoAppearance` et l'écran, rien d'ajouté au lancement**

`NeoAppearance.kt` (Edit) :
- `legacyPreferences` : `return AppearancePreferences().withWallpaper(id)` (au lieu de `withWallpaper(DEFAULT_THEME_ID, id)`) ; retirer l'import `DEFAULT_THEME_ID` s'il devient inutilisé ailleurs (il sert encore à `themeId`/`refreshTokens` : garder).
- `setTheme` :

```kotlin
    fun setTheme(context: Context, id: String) {
        // Changer de thème ne touche pas au fond : on le fige avant la bascule.
        preferences = preferences.withPinnedWallpaper(themeId)
        themeId = getTheme(id).id
        changed(context)
    }
```
- `setWallpaper` : `preferences = preferences.withWallpaper(id)`.
- Ajouter `private fun hasWallpaperChoice() = preferences.wallpaperId != null || preferences.themeOverrides[themeId]?.wallpaperId != null` et remplacer les trois tests `preferences.themeOverrides[themeId]?.wallpaperId == null` / `!= null` (dans `load`, `applyFromWebView`, `recoverWallpaper`) par `!hasWallpaperChoice()` / `hasWallpaperChoice()`.
- NE PAS toucher à `load` (ordre, lecture synchrone des préférences natives), à `refreshTokens` ni à `WallpaperLayer`.

`AppearanceScreen.kt` : dans « Enregistrer », retirer `wallpaperId = draft.wallpaperId` de la `ThemeCustomization(...)` ; dans `importedDraft`, retirer `wallpaperId = imported.wallpaperId ?: base.wallpaperId,` (garder `base`).

Run : `.\gradlew.bat :core:test assembleDebug`
Expected : BUILD SUCCESSFUL, tous les tests verts.

- [ ] **Step 7: Mesurer le lancement APRÈS et vérifier à l'écran**

Même protocole que le Step 1, mêmes 6 essais, dans `.superpowers/themes/lancement.md` section « Après Task 2 ». Critère : moyenne « après » inférieure ou égale à « avant » plus un écart-type ; sinon BLOQUER, chercher ce qui travaille avant la grille, corriger. Vérifier aussi à l'écran (`& $adb -s emulator-5554 exec-out screencap -p > ...`) : au lancement le rond seul sur fond uni puis fond + grille ensemble (inchangé), Réglages > Apparence : choisir un fond puis changer de thème : le fond ne change pas.

- [ ] **Step 8: Commit**

```bash
git add apps/android/native/core apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui .superpowers/themes/lancement.md
git commit -m "Android : le fond d'écran est un réglage global, repli sur le fond du thème actuel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 3: Retrait des 8 thèmes (PC, CSS, Android), repli sur Catppuccin

**Files:**
- Modify: `apps/windows/src/themes/types.ts`, `apps/windows/src/themes/registry.ts`, `apps/windows/src/themes/codex-themes.css`, `apps/windows/src/App.css` (règle `.nc-theme-lobster` et son commentaire, l.3783-3788), `apps/windows/src/main.tsx` (l.16), `apps/android/src/main.tsx` (l.14)
- Delete: `apps/windows/src/themes/tokyo-night.css`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/Themes.kt`
- Test: `apps/windows/src/themes/registry.test.ts`, `apps/windows/src/platform/preferences.test.ts`, `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/appearance/AppearancePreferencesTest.kt`, `ThemeShareTest.kt`

**Interfaces:**
- Produces : `THEME_IDS` = `["catppuccin-mocha","github","one","ayu","rose-pine","vercel"]` (dans cet ordre, PC et Android) ; `THEMES` de 6 entrées ; `getTheme(id)` rend toujours un thème (Catppuccin si inconnu).

- [ ] **Step 1: Write the failing tests**

`registry.test.ts`, ajouter à la fin du `describe` :

```ts
    it("ne garde que les six thèmes choisis, Catppuccin en premier", () => {
        expect(THEMES.map((theme) => theme.id)).toEqual([
            "catppuccin-mocha",
            "github",
            "one",
            "ayu",
            "rose-pine",
            "vercel",
        ]);
    });

    it("un thème retiré retombe sur Catppuccin sans rien lever", () => {
        for (const retired of [
            "tokyo-night",
            "absolutely",
            "linear",
            "lobster",
            "matrix",
            "oscurange",
            "raycast",
            "vscode-plus",
        ]) {
            expect(getTheme(retired).id).toBe("catppuccin-mocha");
        }
    });

    it("chaque thème a son bloc CSS, et aucun thème retiré n'en garde un", () => {
        const css = ["codex-themes.css", "catppuccin-mocha.css"]
            .map((file) => readFileSync(join(__dirname, file), "utf8"))
            .join("\n");
        const declared = new Set(
            [...css.matchAll(/\.nc-theme-([a-z-]+)(?=[\s,{])/g)]
                .map((match) => match[1])
                .filter((name) => !["accent", "ink", "surface"].includes(name))
        );
        expect([...declared].sort()).toEqual(
            THEMES.map((theme) => theme.id).sort()
        );
    });
```
avec, en tête : `import { readFileSync } from "fs"; import { join } from "path";`.

`platform/preferences.test.ts` : ajouter (adapter à l'import déjà présent de `normalizeDesktopPreferences`) :

```ts
    it("un thème enregistré puis retiré retombe sur Catppuccin", () => {
        expect(
            normalizeDesktopPreferences({ themeId: "lobster" }).themeId
        ).toBe("catppuccin-mocha");
    });
```
Android `AppearancePreferencesTest.kt` : remplacer le test `le registre a les quatorze themes de l'ancienne` par :

```kotlin
    @Test fun `le registre garde les six themes choisis`() {
        assertEquals(listOf("catppuccin-mocha", "github", "one", "ayu", "rose-pine", "vercel"), THEMES.map { it.id })
        assertEquals("ayu", getTheme("ayu").id)
        assertEquals("catppuccin-mocha", getTheme("zzz").id)
        for (retired in listOf("tokyo-night", "absolutely", "linear", "lobster", "matrix", "oscurange", "raycast", "vscode-plus")) {
            assertEquals("catppuccin-mocha", getTheme(retired).id)
            assertEquals("catppuccin-mocha", themeIdOfDesktopPreferences("""{"themeId":"$retired"}"""))
        }
    }
```
et remplacer, dans les tests existants de ce fichier et de `ThemeShareTest.kt`, `"tokyo-night"` par `"github"` (clé arbitraire d'une personnalisation : `l.41`, `l.45` ; dans `ThemeShareTest` : `getTheme("tokyo-night")`, `themeShareText("tokyo-night", ...)`, le préfixe attendu `"codeThemeId":"tokyo-night","theme":{"accent":"#3d59a1"` devient `"codeThemeId":"github","theme":{"accent":"` suivi de l'accent de GitHub lu dans `getTheme("github").accent` : écrire l'assertion avec `"...{\"accent\":\"${getTheme("github").accent}\",\"contrast\":60,"`). Ajouter dans `ThemeShareTest` : un import de `"codeThemeId":"tokyo-night"` rend `ThemeImport.NotInstalled`.

- [ ] **Step 2: Run tests to verify they fail**

Run : `npx jest apps/windows/src/themes/registry.test.ts apps/windows/src/platform/preferences.test.ts` puis `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.AppearancePreferencesTest'`
Expected : FAIL (14 thèmes encore présents ; `THEMES.size` 14).

- [ ] **Step 3: Écrire et lancer le script de retrait**

Créer `.superpowers/themes/retirer-themes.mjs` (jetable, non commité) :

```js
import { readFileSync, writeFileSync } from "node:fs";

const RETIRED = ["tokyo-night", "absolutely", "linear", "lobster", "matrix", "oscurange", "raycast", "vscode-plus"];
const root = "C:/dev/neo-calendar/apps/";
const edit = (file, fn) => { const before = readFileSync(file, "utf8"); const after = fn(before); writeFileSync(file, after); console.log(file, before.length, "->", after.length); };

// registry.ts : un objet par thème, indenté de 4 espaces, fermé par "\n    },"
edit(root + "windows/src/themes/registry.ts", (text) => {
  for (const id of RETIRED) text = text.replace(new RegExp(`    \\{\\r?\\n        id: "${id}",[\\s\\S]*?\\r?\\n    \\},\\r?\\n`), "");
  return text;
});
// Themes.kt : ThemeDefinition(...) indenté de 4 espaces, fermé par "\n    ),"
edit(root + "android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/Themes.kt", (text) => {
  for (const id of RETIRED) text = text.replace(new RegExp(`    ThemeDefinition\\(\\r?\\n        id = "${id}",[\\s\\S]*?\\r?\\n    \\),\\r?\\n`), "");
  return text;
});
// codex-themes.css : deux règles par thème, fermées par "}" en colonne 0
edit(root + "windows/src/themes/codex-themes.css", (text) => {
  for (const id of RETIRED) {
    text = text.replace(new RegExp(`^\\.nc-theme-${id},\\r?\\nhtml\\.nc-theme-${id},\\r?\\nbody\\.nc-theme-${id} \\{[\\s\\S]*?^\\}\\r?\\n\\r?\\n?`, "m"), "");
    text = text.replace(new RegExp(`^html\\.nc-theme-${id} body,\\r?\\nbody\\.nc-theme-${id} \\{[\\s\\S]*?^\\}\\r?\\n\\r?\\n?`, "m"), "");
  }
  return text;
});
```
Run : `node .superpowers/themes/retirer-themes.mjs`
Expected : trois lignes `... <avant> -> <après>` avec un fichier plus court chacune. Vérifier : `git diff --stat` ne montre que ces trois fichiers ; `grep -c "tokyo\|lobster\|matrix\|raycast\|oscurange\|absolutely\|linear\|vscode-plus" apps/windows/src/themes/registry.ts apps/windows/src/themes/codex-themes.css apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/Themes.kt` rend 0 partout (sinon corriger à la main avec Edit).

- [ ] **Step 4: Le reste du retrait**

- `types.ts` : `THEME_IDS` devient :

```ts
export const THEME_IDS = [
    "catppuccin-mocha",
    "github",
    "one",
    "ayu",
    "rose-pine",
    "vercel",
] as const;
```
- Réordonner les objets de `registry.ts` et les `ThemeDefinition` de `Themes.kt` pour suivre cet ordre (Catppuccin, GitHub, One, Ayu, Rosé Pine, Vercel) : couper-coller les blocs avec Edit, sans changer leur contenu.
- `git rm apps/windows/src/themes/tokyo-night.css` ; retirer `import "./themes/tokyo-night.css";` de `apps/windows/src/main.tsx` et de `apps/android/src/main.tsx`.
- `App.css` : supprimer la règle `.nc-theme-lobster { ... }` et le commentaire qui la précède (« Satoshi is used when installed locally... »).
- `DesktopSettings.tsx` : l'option `Satoshi, "Inter Variable"...` du `datalist` n'est plus liée à un thème : la laisser (suggestion de police), ne rien changer.

- [ ] **Step 5: Run tests to verify they pass**

Run : `npx tsc --noEmit -p apps/windows`, `npx jest apps/windows/src/themes apps/windows/src/platform/preferences.test.ts apps/windows/src/DesktopSettings.test.tsx`, puis `.\gradlew.bat :core:test assembleDebug`.
Expected : tsc sans erreur, tests PC verts, `BUILD SUCCESSFUL` côté Android (`ThemeColorsTest` boucle sur `THEMES` : il passe sur 6). `npm run build` passe aussi (le CSS supprimé n'est plus importé).

- [ ] **Step 6: Vérifier l'utilisateur au thème retiré, à l'écran**

Émulateur : sauvegarder les préférences (voir Conventions), puis `& $adb -s emulator-5554 shell "run-as com.ahmedmili.neocalendar sed -i 's/>catppuccin-mocha</>tokyo-night</' shared_prefs/neo_native_appearance.xml"`, `force-stop`, relancer : l'app s'ouvre en Catppuccin, sans message ni plantage ; capture dans `.superpowers/themes/retire-android.png`. Restaurer ensuite le fichier sauvegardé. (Non vérifié par le plan : que `sed -i` existe sur l'image de l'émulateur ; sinon réécrire le fichier par `run-as ... sh -c 'cat > ...'`.)

- [ ] **Step 7: Commit**

```bash
git add -A apps/windows/src apps/android/src apps/android/native/core
git commit -m "Thèmes : retrait de huit thèmes (PC, CSS, Android), repli sur Catppuccin

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 4: Relevé des palettes officielles, palettes claires, corrections

Cette tâche produit un RELEVÉ SOURCÉ puis applique ses corrections. Aucune couleur n'est écrite avant d'avoir été lue à la source (ce plan n'en donne aucune).

**Files:**
- Create: `docs/superpowers/specs/2026-10-02-themes-releve-palettes.md` (le relevé)
- Modify: `apps/windows/src/themes/types.ts`, `apps/windows/src/themes/registry.ts`, `apps/windows/src/themes/codex-themes.css`, `apps/windows/src/themes/catppuccin-mocha.css`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/Themes.kt`, `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/theme/NeoTokens.kt` (constantes `CatppuccinMocha`)
- Create: `apps/windows/src/themes/themeParity.test.ts`
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/appearance/ThemeColorsTest.kt`

**Interfaces:**
- Produces (Tasks 5, 6) :
  - TS : `ThemeDefinition.light: ThemeLightPalette` avec `export interface ThemeLightPalette { accent: string; surface: string; ink: string; danger: string; success: string; }` (hex `#rrggbb` en minuscules).
  - Kotlin : `data class ThemeLight(val accent: String, val surface: String, val ink: String, val error: String, val success: String)` et `ThemeDefinition.light: ThemeLight` (même ordre de champs, `error` = `danger`).
  - Le relevé : un tableau par thème et par variante.

#### Méthode de relevé

Pour CHAQUE thème, relire la source officielle le jour de la tâche (WebFetch / `fetch` / `curl` des fichiers bruts ; un fichier JSON se lit en entier, jamais d'extrait de mémoire) et noter la date et le SHA du commit lu (`gh api repos/<org>/<repo>/commits?per_page=1 --jq '.[0].sha'`). Sources (existence des URL vérifiée le 2026-10-02 ; le contenu reste à relever) :

| Thème | Variante sombre (celle de l'app) | Variante claire | Source principale |
|---|---|---|---|
| Catppuccin | Mocha | Latte | `https://raw.githubusercontent.com/catppuccin/palette/main/palette.json` (clés des couleurs de la saveur : base, mantle, crust, surface0..2, overlay0..2, text, subtext0/1, blue, red, green...) ; recouper avec le portage VS Code `catppuccin/vscode` |
| GitHub | Dark (le « GitHub Dark » par défaut ; relever laquelle des variantes l'app imite) | Light | `https://github.com/primer/github-vscode-theme` : `src/colors.js` et `src/theme.js` (couleurs `canvas.default`, `fg.default`, `accent.fg`, `danger.fg`, `success.fg`...) |
| One | One Dark | One Light | Atom : `https://raw.githubusercontent.com/atom/atom/master/packages/one-dark-ui/styles/ui-variables.less` et `.../one-light-ui/styles/ui-variables.less` (fond, texte, accent) ; portage VS Code `https://raw.githubusercontent.com/akamud/vscode-theme-onedark/master/themes/OneDark.json` (sombre) |
| Ayu | Dark (relever si l'app imite Dark ou Mirage) | Light | `https://github.com/ayu-theme/vscode-ayu` : `ayu-dark.json`, `ayu-mirage.json`, `ayu-light.json` ; palette de base `https://github.com/ayu-theme/ayu-colors` (`src/`, `themes/`) |
| Rosé Pine | Moon (l'app est en Moon) | Dawn | `https://raw.githubusercontent.com/rose-pine/palette/main/palette.json` (variantes `main`, `moon`, `dawn` : base, surface, overlay, text, subtle, muted, love, pine, foam, gold, rose) ; recouper `rose-pine/vscode` (`themes/`) |
| Vercel | Dark | Light | Système de couleurs Geist : `https://vercel.com/geist/colors` (page rendue par JavaScript : l'ouvrir avec `playwright` sous Brave, ou `freeweb`, puis lire les propriétés CSS calculées sur `:root` en clair et en sombre : `--ds-background-100`, `--ds-gray-*`, `--ds-blue-*`, `--ds-red-*`, `--ds-green-*`). Citer l'URL, la date et les noms de propriétés lus |

Couleurs à comparer, pour chaque thème et chaque variante : **accent** (la couleur d'action principale du thème, avec son rôle officiel nommé), **fond** (`surface`), **texte** (`ink`), **danger** et **succès** (`semanticColors`, `--text-error`, `--nc-success`, `--nc-danger`), et pour le sombre aussi le texte sur accent (`--text-on-accent`). Les couleurs dérivées (muted, faint, survol, secondaire) NE se comparent PAS : elles suivent la dérivation de l'app.

Format du relevé (`docs/superpowers/specs/2026-10-02-themes-releve-palettes.md`) : un titre par thème, la source (URL brute, SHA, date), puis un tableau :

```
| Variante | Rôle | Valeur officielle | Source (fichier, clé) | Valeur de l'app avant | Écart | Décision |
```
`Écart` = `non` si les hex sont identiques, sinon `oui`. Chaque cellule « Valeur officielle » est collée du fichier source, avec sa clé exacte.

Critère de décision (sans exception silencieuse) :
1. Valeur de l'app = valeur officielle : ne rien changer.
2. Écart : la valeur officielle est adoptée telle quelle dans `registry.ts`, `Themes.kt`, `codex-themes.css`/`catppuccin-mocha.css` et, pour Catppuccin, les constantes de `CatppuccinMocha` (`NeoTokens.kt`) qui reprennent cette couleur (`surface`, `text`, `accent`, `onAccent`...). Un thème par commit.
3. Si une valeur officielle ne tient pas un seuil de la Task 5 / 6 pour son rôle (par exemple l'accent officiel est trop clair pour porter du texte blanc) : la valeur officielle reste, et c'est la dérivation (texte sur accent calculé) qui s'adapte ; une exemption n'est admise que pour une paire où la palette officielle est seule en cause, avec sa raison écrite dans le relevé.
4. Soupçons à lever pendant le relevé (à confirmer ou infirmer par la source, sans présumer) : les trois couleurs de Catppuccin viennent-elles de la même saveur ? L'accent d'app de Catppuccin est-il une couleur de la palette (il ne l'est peut-être pas : un écart, donc corrigé, et visible : image avant / après obligatoire) ? Le « danger » de Rosé Pine est-il la couleur officielle de l'erreur, ou un gris de la palette ? Les couleurs d'un thème sont-elles toutes d'une seule variante (Dark / Mirage chez Ayu ; Main / Moon chez Rosé Pine) ?
5. Les 6 variantes claires sont toutes à relever : leur accent, fond, texte, danger, succès deviennent `light`.

- [ ] **Step 1: Relever et écrire le relevé**

Faire le relevé selon la méthode ci-dessus, thème par thème, dans le fichier du relevé. Le relevé est terminé quand chaque ligne du tableau de chaque thème a une valeur officielle citée et une décision. Commit du relevé seul : `Relevé des palettes officielles des six thèmes`.

- [ ] **Step 2: Write the failing parity test**

Créer `apps/windows/src/themes/themeParity.test.ts` (les valeurs viennent des fichiers, aucune n'est écrite ici) :

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { THEMES } from "./registry";

const THEMES_KT = join(
    __dirname,
    "..", "..", "..",
    "android", "native", "core", "src", "main", "kotlin",
    "com", "ahmed", "neocalendar", "core", "appearance", "Themes.kt"
);

function kotlinBlock(source: string, id: string): string {
    const start = source.indexOf(`id = "${id}"`);
    if (start < 0) throw new Error(`Thème absent de Themes.kt : ${id}`);
    const next = source.indexOf("ThemeDefinition(", start);
    return source.slice(start, next < 0 ? undefined : next);
}

function field(block: string, name: string): string {
    const match = new RegExp(`${name} = "(#[0-9a-fA-F]{6})"`).exec(block);
    if (!match) throw new Error(`Champ ${name} introuvable`);
    return match[1].toLowerCase();
}

describe("parité des thèmes PC / Android", () => {
    const kotlin = readFileSync(THEMES_KT, "utf8");

    it("Themes.kt a exactement les thèmes du registre, dans le même ordre", () => {
        const ids = [...kotlin.matchAll(/ThemeDefinition\(\s*id = "([a-z-]+)"/g)].map((m) => m[1]);
        expect(ids).toEqual(THEMES.map((theme) => theme.id));
    });

    for (const theme of THEMES) {
        it(`${theme.id} : mêmes accent, fond, texte (sombre) et palette claire`, () => {
            const block = kotlinBlock(kotlin, theme.id);
            expect(field(block, "accent")).toBe(theme.accent.toLowerCase());
            expect(field(block, "surface")).toBe(theme.surface.toLowerCase());
            expect(field(block, "ink")).toBe(theme.ink.toLowerCase());
            const light = /light = ThemeLight\(([^)]*)\)/.exec(block);
            expect(light).not.toBeNull();
            const inner = light![1];
            expect(field(inner, "accent")).toBe(theme.light.accent.toLowerCase());
            expect(field(inner, "surface")).toBe(theme.light.surface.toLowerCase());
            expect(field(inner, "ink")).toBe(theme.light.ink.toLowerCase());
            expect(field(inner, "error")).toBe(theme.light.danger.toLowerCase());
            expect(field(inner, "success")).toBe(theme.light.success.toLowerCase());
        });
    }

    it("chaque couleur du registre est un hexadécimal à six chiffres", () => {
        const hex = /^#[0-9a-f]{6}$/;
        for (const theme of THEMES) {
            for (const value of [theme.accent, theme.surface, theme.ink, ...Object.values(theme.light)]) {
                expect(value).toMatch(hex);
            }
        }
    });
});
```

Run : `npx jest apps/windows/src/themes/themeParity.test.ts`
Expected : FAIL (`theme.light` n'existe pas : erreur de type ts-jest).

- [ ] **Step 3: Ajouter `light` aux deux registres, avec les valeurs du relevé**

`types.ts` :

```ts
export interface ThemeLightPalette {
    accent: string;
    surface: string;
    ink: string;
    danger: string;
    success: string;
}
```
et dans `ThemeDefinition` : `light: ThemeLightPalette;`. Dans chaque objet de `registry.ts`, après `semanticColors`, ajouter :

```ts
        light: {
            accent: "<hex Latte / Light / ... du relevé>",
            surface: "<hex>",
            ink: "<hex>",
            danger: "<hex>",
            success: "<hex>",
        },
```
(seule exception aux interdits de placeholders de ce plan : les `<hex>` sont ceux du relevé, à recopier ; aucune valeur inventée). Côté Kotlin, dans `Themes.kt` :

```kotlin
/** La variante claire officielle du thème (relevé du 2026-10-02) : fond, texte, accent, rouge et vert. */
data class ThemeLight(val accent: String, val surface: String, val ink: String, val error: String, val success: String)
```
`ThemeDefinition` gagne `val light: ThemeLight,` (après `palette`), et chaque thème : `light = ThemeLight(accent = "<hex>", surface = "<hex>", ink = "<hex>", error = "<hex>", success = "<hex>"),`. Mettre à jour le commentaire d'en-tête de `Themes.kt` (« les thèmes de `registry.ts` ... »).

- [ ] **Step 4: Appliquer les corrections d'écart sombres**

Selon la décision de chaque ligne du relevé : corriger `accent` / `surface` / `ink` / `semanticColors` dans `registry.ts`, les mêmes valeurs dans `Themes.kt`, le CSS du thème (`--background-primary`, `--nc-bg-primary`, `--nc-theme-*`, `--text-normal`, `--nc-text-primary`, `--interactive-accent`, `--nc-accent`, `--text-on-accent`, `--nc-accent-text`, `--text-error`, `--nc-danger`, `--nc-success`, `--nc-skill` : relire le bloc du thème pour toutes les occurrences d'une couleur corrigée) et, pour Catppuccin, les constantes de `CatppuccinMocha` qui reprenaient l'ancienne valeur, ainsi que `ThemePalette` (`onAccent`, `error`, `success`) dans `Themes.kt`. Mettre à jour les assertions de `ThemeColorsTest` et `AppearancePreferencesTest` qui épinglaient une ancienne valeur (Catppuccin : `0xFF1E1E2E`, `#658ff2`, etc., seulement si le relevé les change). Un thème = un commit (`Thème <nom> : <rôle> aligné sur la palette officielle`).

- [ ] **Step 5: Run tests to verify they pass**

Run : `npx jest apps/windows/src/themes` puis `.\gradlew.bat :core:test assembleDebug`
Expected : parité PC / Kotlin verte (6 thèmes), `ThemeColorsTest` vert, build vert.

- [ ] **Step 6: Si le thème par défaut a changé, preuve visuelle avant / après**

Si une couleur de Catppuccin sombre a changé (surface, texte ou accent) : captures avant / après de la grille et de Réglages (PC et émulateur) dans `.superpowers/themes/catppuccin-avant-apres/`, et le dire dans le rapport (Task 8). C'est le thème que tout le monde voit à la mise à jour.

- [ ] **Step 7: Commit** (les commits par thème du Step 4 + celui-ci pour `light` et la parité)

```bash
git add apps/windows/src/themes apps/android/native docs/superpowers/specs/2026-10-02-themes-releve-palettes.md
git commit -m "Thèmes : palette claire officielle, parité PC / Android testée

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 5: PC, contraste WCAG, dérivation des panneaux et test automatique

**Files:**
- Create: `apps/windows/src/themes/contrast.ts`, `apps/windows/src/themes/contrast.test.ts`
- Create: `apps/windows/src/themes/panelTokens.ts`, `apps/windows/src/themes/panelTokens.test.ts`
- Create: `apps/windows/src/themes/themeContrast.test.ts`
- Modify: `apps/windows/src/App.tsx` (bloc `properties` l.172-210, `CUSTOM_THEME_PROPERTIES` l.33-58, props de `WallpaperRenderLayer`)

**Interfaces:**
- Consumes : `ThemeDefinition.light` (Task 4), `EffectiveThemeAppearance` (Task 1).
- Produces (Task 6 en reprend les formules, Task 8 les lit) :
  - `contrast.ts` : `parseColor(value: string): { rgb: [number, number, number]; alpha: number }`, `mixSrgb(a: string, b: string, t: number): string` (hex opaque, `a*(1-t)+b*t`), `withAlpha(hex: string, alpha: number): string` (`rgba(r, g, b, a)`), `over(fg: string, bg: string): string`, `relativeLuminance(hex: string): number`, `contrastRatio(fg: string, bg: string): number` (le premier plan translucide est composé sur `bg`), `readableOn(bg: string): "#ffffff" | "#000000"`.
  - `panelTokens.ts` : `PanelColors`, `PanelTokens`, `derivePanelTokens(colors: PanelColors): PanelTokens`, `deriveLightExtras(colors: PanelColors, semantic: { danger: string; success: string }): LightExtras`, `panelColorsFor(theme: ThemeDefinition, appearance: EffectiveThemeAppearance, mode: "light" | "dark"): PanelColors`, `panelCssProperties(colors, mode, theme): Record<string, string>`.

- [ ] **Step 1: Write the failing tests (contraste)**

Créer `contrast.test.ts` :

```ts
import {
    contrastRatio,
    mixSrgb,
    over,
    parseColor,
    readableOn,
    relativeLuminance,
    withAlpha,
} from "./contrast";

describe("contraste WCAG", () => {
    it("noir sur blanc vaut 21", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
        expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    });

    it("le gris de référence #767676 passe 4,5 sur blanc, #777777 non", () => {
        expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5);
    });

    it("lit l'hexadécimal, rgb() et rgba()", () => {
        expect(parseColor("#1e1e2e")).toEqual({ rgb: [30, 30, 46], alpha: 1 });
        expect(parseColor("rgb(30, 30, 46)")).toEqual({ rgb: [30, 30, 46], alpha: 1 });
        expect(parseColor("rgba(255, 255, 255, 0.22)")).toEqual({ rgb: [255, 255, 255], alpha: 0.22 });
        expect(() => parseColor("bleu")).toThrow();
    });

    it("mélange en sRGB comme color-mix, arrondi au plus proche", () => {
        expect(mixSrgb("#000000", "#ffffff", 0.5)).toBe("#808080");
        expect(mixSrgb("#000000", "#ffffff", 0)).toBe("#000000");
        expect(mixSrgb("#000000", "#ffffff", 1)).toBe("#ffffff");
    });

    it("compose un premier plan translucide sur son fond", () => {
        expect(over(withAlpha("#ffffff", 0.5), "#000000")).toBe("#808080");
        expect(contrastRatio(withAlpha("#ffffff", 0.5), "#000000")).toBeCloseTo(
            contrastRatio("#808080", "#000000"),
            5
        );
    });

    it("choisit du noir ou du blanc selon le fond", () => {
        expect(readableOn("#ffffff")).toBe("#000000");
        expect(readableOn("#000000")).toBe("#ffffff");
        expect(relativeLuminance("#000000")).toBe(0);
    });
});
```

Run : `npx jest apps/windows/src/themes/contrast.test.ts`
Expected : FAIL (module `./contrast` introuvable).

- [ ] **Step 2: Implémenter `contrast.ts`**

```ts
export type Rgb = [number, number, number];

export interface ParsedColor {
    rgb: Rgb;
    alpha: number;
}

/** `#rrggbb`, `rgb(r, g, b)` ou `rgba(r, g, b, a)` : tout le reste lève. */
export function parseColor(value: string): ParsedColor {
    const text = value.trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(text);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
    }
    const fn =
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
            text
        );
    if (fn) {
        return {
            rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
            alpha: fn[4] === undefined ? 1 : Number(fn[4]),
        };
    }
    throw new Error(`Couleur illisible : ${value}`);
}

function toHex(rgb: Rgb): string {
    return (
        "#" +
        rgb
            .map((channel) =>
                Math.max(0, Math.min(255, Math.round(channel)))
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
    );
}

/** `color-mix(in srgb, a (1 - t), b t)` sur deux couleurs opaques. */
export function mixSrgb(a: string, b: string, t: number): string {
    const left = parseColor(a).rgb;
    const right = parseColor(b).rgb;
    return toHex([
        left[0] * (1 - t) + right[0] * t,
        left[1] * (1 - t) + right[1] * t,
        left[2] * (1 - t) + right[2] * t,
    ]);
}

export function withAlpha(hex: string, alpha: number): string {
    const [r, g, b] = parseColor(hex).rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Le premier plan (éventuellement translucide) composé sur un fond opaque. */
export function over(fg: string, bg: string): string {
    const top = parseColor(fg);
    const back = parseColor(bg).rgb;
    return toHex([
        top.rgb[0] * top.alpha + back[0] * (1 - top.alpha),
        top.rgb[1] * top.alpha + back[1] * (1 - top.alpha),
        top.rgb[2] * top.alpha + back[2] * (1 - top.alpha),
    ]);
}

export function relativeLuminance(hex: string): number {
    const [r, g, b] = parseColor(hex).rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG 2.x ; le premier plan translucide est composé sur `bg`. */
export function contrastRatio(fg: string, bg: string): number {
    const a = relativeLuminance(over(fg, bg));
    const b = relativeLuminance(bg);
    const [light, dark] = a >= b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
}

/** Du blanc ou du noir, selon ce qui se lit le mieux sur `bg`. */
export function readableOn(bg: string): "#ffffff" | "#000000" {
    return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg)
        ? "#ffffff"
        : "#000000";
}
```

Run : `npx jest apps/windows/src/themes/contrast.test.ts`
Expected : PASS, 6 tests.

- [ ] **Step 3: Write the failing tests (dérivation)**

Créer `panelTokens.test.ts` (valeurs vérifiées à la main : 12 % de 255 = 30,6 donc 31 ; 22 % = 56,1 donc 56 ; 72 % = 183,6 donc 184 ; 52 % = 132,6 donc 133 ; 16 % = 40,8 donc 41 ; `mix(#ff0000, #ffffff, 0,3)` = canal vert 76,5 donc 77) :

```ts
import { derivePanelTokens, deriveLightExtras } from "./panelTokens";

describe("dérivation des couleurs de panneau", () => {
    const tokens = derivePanelTokens({
        surface: "#000000",
        ink: "#ffffff",
        accent: "#ff0000",
    });

    it("reprend les formules de color-mix d'App.tsx", () => {
        expect(tokens.bgPrimary).toBe("#000000");
        expect(tokens.bgSecondary).toBe("#1f1f1f");
        expect(tokens.formField).toBe("#292929");
        expect(tokens.hover).toBe("#383838");
        expect(tokens.muted).toBe("#b8b8b8");
        expect(tokens.faint).toBe("#858585");
        expect(tokens.text).toBe("#ffffff");
        expect(tokens.border).toBe("rgba(255, 255, 255, 0.22)");
        expect(tokens.borderHover).toBe("#ff4d4d");
    });

    it("le clair garde son texte lisible sur sa surface et sur son accent", () => {
        const light = deriveLightExtras(
            { surface: "#ffffff", ink: "#000000", accent: "#ffcc00" },
            { danger: "#cc0000", success: "#007700" }
        );
        expect(light.accentText).toBe("#000000");
        expect(light.danger).toBe("#cc0000");
        expect(light.glass).toBe("rgba(255, 255, 255, 0.88)");
        expect(light.crust).toBe("#ebebeb");
    });
});
```
(`crust` clair = `mixSrgb(surface, ink, 0.08)` : 8 % de 255 = 20,4 donc `#ebebeb`.)

Run : `npx jest apps/windows/src/themes/panelTokens.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 4: Implémenter `panelTokens.ts`**

```ts
import type { EffectiveThemeAppearance } from "./appearancePreferences";
import { mixSrgb, readableOn, withAlpha } from "./contrast";
import type { ThemeDefinition } from "./types";

export interface PanelColors {
    surface: string;
    ink: string;
    accent: string;
}

export interface PanelTokens {
    bgPrimary: string;
    bgSecondary: string;
    formField: string;
    hover: string;
    border: string;
    borderHover: string;
    text: string;
    muted: string;
    faint: string;
}

/** Les surfaces et textes de tout panneau, à partir de trois couleurs : mêmes formules que les `color-mix` d'`App.tsx` d'origine. */
export function derivePanelTokens({ surface, ink, accent }: PanelColors): PanelTokens {
    return {
        bgPrimary: surface,
        bgSecondary: mixSrgb(surface, ink, 0.12),
        formField: mixSrgb(surface, ink, 0.16),
        hover: mixSrgb(surface, ink, 0.22),
        border: withAlpha(ink, 0.22),
        borderHover: mixSrgb(accent, ink, 0.3),
        text: ink,
        muted: mixSrgb(surface, ink, 0.72),
        faint: mixSrgb(surface, ink, 0.52),
    };
}

export interface LightExtras {
    crust: string;
    glass: string;
    accentStrong: string;
    accentText: string;
    danger: string;
    success: string;
}

/**
 * Ce que le CSS des thèmes fixe en sombre mais qu'un mode clair doit calculer :
 * le fond de page, la vitre, l'accent fort, le texte sur accent (noir ou blanc
 * selon le contraste), le rouge et le vert de la palette claire du thème.
 */
export function deriveLightExtras(
    { surface, ink, accent }: PanelColors,
    semantic: { danger: string; success: string }
): LightExtras {
    return {
        crust: mixSrgb(surface, ink, 0.08),
        glass: withAlpha(surface, 0.88),
        accentStrong: mixSrgb(accent, "#000000", 0.12),
        accentText: readableOn(accent),
        danger: semantic.danger,
        success: semantic.success,
    };
}

/**
 * Les trois couleurs d'un panneau : en sombre celles du thème (personnalisation
 * comprise) ; en clair la palette claire du thème, où seul l'accent suit la
 * personnalisation (un accent égal à celui du thème sombre est « non choisi »).
 */
export function panelColorsFor(
    theme: ThemeDefinition,
    appearance: EffectiveThemeAppearance,
    mode: "light" | "dark"
): PanelColors {
    if (mode === "dark") {
        return {
            surface: appearance.surface,
            ink: appearance.ink,
            accent: appearance.accent,
        };
    }
    return {
        surface: theme.light.surface,
        ink: theme.light.ink,
        accent:
            appearance.accent === theme.accent
                ? theme.light.accent
                : appearance.accent,
    };
}

/** Les propriétés CSS posées sur `html` et `body`. En clair, elles couvrent aussi ce que le CSS du thème fixerait en sombre. */
export function panelCssProperties(
    colors: PanelColors,
    mode: "light" | "dark",
    theme: ThemeDefinition
): Record<string, string> {
    const t = derivePanelTokens(colors);
    const properties: Record<string, string> = {
        "--interactive-accent": colors.accent,
        "--nc-accent": colors.accent,
        "--nc-theme-accent": colors.accent,
        "--background-primary": t.bgPrimary,
        "--nc-bg-primary": t.bgPrimary,
        "--nc-theme-surface": t.bgPrimary,
        "--background-secondary": t.bgSecondary,
        "--nc-bg-secondary": t.bgSecondary,
        "--background-modifier-form-field": t.formField,
        "--background-modifier-hover": t.hover,
        "--background-modifier-border": t.border,
        "--background-modifier-border-hover": t.borderHover,
        "--text-normal": t.text,
        "--nc-text-primary": t.text,
        "--nc-theme-ink": t.text,
        "--text-muted": t.muted,
        "--nc-text-secondary": t.muted,
        "--text-faint": t.faint,
        "--nc-text-faint": t.faint,
    };
    if (mode === "light") {
        const x = deriveLightExtras(colors, theme.light);
        Object.assign(properties, {
            "--nc-bg-crust": x.crust,
            "--nc-surface": x.glass,
            "--nc-surface-hover": t.hover,
            "--nc-accent-strong": x.accentStrong,
            "--nc-accent-text": x.accentText,
            "--text-on-accent": x.accentText,
            "--text-error": x.danger,
            "--nc-danger": x.danger,
            "--nc-success": x.success,
        });
    }
    return properties;
}
```

Run : `npx jest apps/windows/src/themes/panelTokens.test.ts`
Expected : PASS.

- [ ] **Step 5: Brancher `App.tsx`**

Dans `App.tsx` : importer `panelColorsFor`, `panelCssProperties` (`./themes/panelTokens`). Ajouter à `CUSTOM_THEME_PROPERTIES` : `"--nc-bg-crust"`, `"--nc-surface"`, `"--nc-surface-hover"`, `"--nc-accent-strong"`, `"--nc-accent-text"`, `"--text-on-accent"`, `"--text-error"`, `"--nc-danger"`, `"--nc-success"`. Dans l'effet qui pose les propriétés, remplacer la construction littérale de `properties` (de `"--nc-user-contrast"` à `"--nc-text-faint"`) par :

```ts
        const colors = panelColorsFor(theme, effectiveTheme, appearanceMode);
        const properties: Record<string, string> = {
            "--nc-user-contrast": String(contrast),
            "--nc-ui-font": uiFont,
            "--nc-code-font": codeFont,
            ...panelCssProperties(colors, appearanceMode, theme),
        };
```
et, dans ce même effet, remplacer les usages de `surface` (superposition du fond, `${surface} 38%`) par `colors.surface`, en retirant `accent`, `surface`, `ink` de la déstructuration s'ils ne servent plus. Passer `surface={colors.surface}` aux trois `WallpaperRenderLayer` : calculer `colors` hors de l'effet par `useMemo(() => panelColorsFor(theme, effectiveTheme, appearanceMode), [theme, effectiveTheme, appearanceMode])` et le réutiliser dans l'effet. Run : `npx tsc --noEmit -p apps/windows` et `npx jest apps/windows/src`. Expected : vert. À l'écran (PC) : le sombre est identique à avant (mêmes formules, arrondi près), le clair est maintenant celui du thème.

- [ ] **Step 6: Write the failing test de contraste de tous les thèmes**

Créer `themeContrast.test.ts` :

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { contrastRatio } from "./contrast";
import {
    deriveLightExtras,
    derivePanelTokens,
    panelColorsFor,
} from "./panelTokens";
import { getEffectiveThemeAppearance, normalizeAppearancePreferences } from "./appearancePreferences";
import { THEMES } from "./registry";

/** Seuils (spec §3.3) : texte 4,5 ; grands éléments, icônes et pastilles 3. */
const TEXT = 4.5;
const GRAPHIC = 3;

/**
 * Une paire qui ne tient pas SEULEMENT parce que la palette officielle est en
 * cause (relevé de la Task 4). Clé `thème/mode/paire`, valeur : la raison.
 * Vide au départ : toute entrée doit être justifiée dans le relevé.
 */
const EXEMPTIONS: Record<string, string> = {};

const CSS = ["codex-themes.css", "catppuccin-mocha.css"]
    .map((file) => readFileSync(join(__dirname, file), "utf8"))
    .join("\n");

/** Une propriété simple (couleur nue) du bloc CSS d'un thème sombre. */
function cssColor(themeId: string, property: string): string {
    const blocks = [
        ...CSS.matchAll(
            new RegExp(`\\.nc-theme-${themeId}(?=[\\s,{])[^{]*\\{([^}]*)\\}`, "g")
        ),
    ];
    for (const block of blocks) {
        const hit = new RegExp(`${property}:\\s*([^;]+);`).exec(block[1]);
        if (hit && /^(#|rgb)/i.test(hit[1].trim())) return hit[1].trim();
    }
    throw new Error(`${property} introuvable pour ${themeId}`);
}

interface Pair {
    name: string;
    fg: string;
    bg: string;
    min: number;
}

function pairsFor(themeId: string, mode: "light" | "dark"): Pair[] {
    const theme = THEMES.find((candidate) => candidate.id === themeId)!;
    const effective = getEffectiveThemeAppearance(
        theme,
        normalizeAppearancePreferences({})
    );
    const colors = panelColorsFor(theme, effective, mode);
    const t = derivePanelTokens(colors);
    const accentText =
        mode === "dark"
            ? cssColor(themeId, "--nc-accent-text")
            : deriveLightExtras(colors, theme.light).accentText;
    const danger =
        mode === "dark" ? cssColor(themeId, "--nc-danger") : theme.light.danger;
    const success =
        mode === "dark" ? cssColor(themeId, "--nc-success") : theme.light.success;
    const surfaces: Array<[string, string]> = [
        ["fond", t.bgPrimary],
        ["panneau", t.bgSecondary],
        ["champ", t.formField],
        ["survol", t.hover],
    ];
    const pairs: Pair[] = [];
    for (const [surfaceName, surface] of surfaces) {
        pairs.push({ name: `texte sur ${surfaceName}`, fg: t.text, bg: surface, min: TEXT });
        pairs.push({ name: `secondaire sur ${surfaceName}`, fg: t.muted, bg: surface, min: TEXT });
        pairs.push({ name: `discret sur ${surfaceName}`, fg: t.faint, bg: surface, min: GRAPHIC });
    }
    pairs.push({ name: "texte sur accent", fg: accentText, bg: colors.accent, min: TEXT });
    pairs.push({ name: "accent sur fond (pastille, icône)", fg: colors.accent, bg: t.bgPrimary, min: GRAPHIC });
    pairs.push({ name: "accent sur panneau (pastille, icône)", fg: colors.accent, bg: t.bgSecondary, min: GRAPHIC });
    pairs.push({ name: "erreur sur fond", fg: danger, bg: t.bgPrimary, min: TEXT });
    pairs.push({ name: "succès sur fond", fg: success, bg: t.bgPrimary, min: GRAPHIC });
    return pairs;
}

describe("contraste des thèmes, tous les panneaux", () => {
    for (const theme of THEMES) {
        for (const mode of ["dark", "light"] as const) {
            it(`${theme.id} (${mode}) tient tous ses seuils`, () => {
                const failures: string[] = [];
                for (const pair of pairsFor(theme.id, mode)) {
                    const key = `${theme.id}/${mode}/${pair.name}`;
                    const ratio = contrastRatio(pair.fg, pair.bg);
                    if (ratio < pair.min && !(key in EXEMPTIONS)) {
                        failures.push(`${key} : ${ratio.toFixed(2)} < ${pair.min}`);
                    }
                }
                expect(failures).toEqual([]);
            });
        }
    }

    it("chaque exemption a une raison et échoue encore vraiment", () => {
        for (const [key, reason] of Object.entries(EXEMPTIONS)) {
            expect(reason.trim().length).toBeGreaterThan(20);
            const [themeId, mode, name] = key.split("/");
            const pair = pairsFor(themeId, mode as "light" | "dark").find((p) => p.name === name);
            expect(pair).toBeDefined();
            expect(contrastRatio(pair!.fg, pair!.bg)).toBeLessThan(pair!.min);
        }
    });
});
```

Run : `npx jest apps/windows/src/themes/themeContrast.test.ts`
Expected : des échecs (au moins quelques paires claires et peut-être sombres) : `<thème>/<mode>/<paire> : <ratio> < <seuil>`. Ces échecs sont l'objet du Step 7.

- [ ] **Step 7: Corriger dans la dérivation, pas thème par thème**

Pour chaque échec : (a) vérifier d'abord que la valeur de palette n'est pas fausse (relevé, Task 4) ; (b) sinon ajuster la RÈGLE : les proportions de `muted` (0,72) et `faint` (0,52), le choix de `accentText` (déjà calculé en clair ; en sombre, remplacer la lecture du CSS par `readableOn(accent)` si la valeur CSS échoue), ou la teinte des surfaces ; une seule règle pour les six thèmes, dans `derivePanelTokens` / `deriveLightExtras`. Mettre à jour `panelTokens.test.ts` (les valeurs d'or changent avec les proportions : recalculer à la main, ne pas copier la sortie) ; si l'accent sombre échoue en CSS, aligner aussi `--nc-accent-text` des blocs CSS concernés. Relancer jusqu'au vert. N'ajouter une entrée à `EXEMPTIONS` que pour une palette officielle seule en cause, avec sa raison dans le relevé. Limite à écrire dans l'en-tête du test : le contraste est mesuré sur surface opaque ; la transparence sur le fond d'écran est jugée aux images (Task 8). Le sombre par défaut de Catppuccin : si un réglage de règle le change visiblement, refaire la preuve avant / après du Step 6 de la Task 4.

- [ ] **Step 8: Run tests to verify they pass**

Run : `npx jest apps/windows/src/themes apps/windows/src/DesktopSettings.test.tsx` puis `npx tsc --noEmit -p apps/windows`
Expected : tout vert.

- [ ] **Step 9: Commit**

```bash
git add apps/windows/src
git commit -m "PC : dérivation des couleurs de panneau testée, contraste WCAG de tous les thèmes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 6: Android, contraste WCAG, mode clair thématisé

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/Contrast.kt`
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/appearance/ThemeColors.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/theme/NeoTokens.kt` (`deriveTokens`, lignes `settingsValue` et `settingsNote`)
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/appearance/ContrastTest.kt` (créé), `ThemeContrastTest.kt` (créé), `ThemeColorsTest.kt` (mis à jour)

**Interfaces:**
- Consumes : `ThemeDefinition.light` / `ThemeLight` (Task 4), `mixColors`, `argbOfHex`, `withAlpha` (`ThemeColors.kt`).
- Produces : `Contrast.kt` : `relativeLuminance(argb: Long): Double`, `over(fg: Long, bg: Long): Long`, `contrastRatio(fg: Long, bg: Long): Double`, `readableOn(bg: Long): Long` ; `ThemeColors.kt` : `settingsValueColor(c: ThemeColors): Long`, `settingsNoteColor(c: ThemeColors): Long` ; `resolveThemeColors` : en clair, couleurs dérivées de `theme.light` par les mêmes formules que le PC (`derivePanelTokens`).

- [ ] **Step 1: Write the failing tests**

`ContrastTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContrastTest {
    @Test fun `noir sur blanc vaut 21`() {
        assertEquals(21.0, contrastRatio(0xFF000000L, 0xFFFFFFFFL), 1e-9)
        assertEquals(1.0, contrastRatio(0xFFFFFFFFL, 0xFFFFFFFFL), 1e-9)
    }

    @Test fun `le gris 767676 passe 4,5 sur blanc, 777777 non`() {
        assertTrue(contrastRatio(0xFF767676L, 0xFFFFFFFFL) >= 4.5)
        assertTrue(contrastRatio(0xFF777777L, 0xFFFFFFFFL) < 4.5)
    }

    @Test fun `un premier plan translucide est compose sur son fond`() {
        assertEquals(0xFF808080L, over(0x80FFFFFFL, 0xFF000000L))
        assertEquals(contrastRatio(0xFF808080L, 0xFF000000L), contrastRatio(0x80FFFFFFL, 0xFF000000L), 0.02)
    }

    @Test fun `du blanc ou du noir selon le fond`() {
        assertEquals(0xFF000000L, readableOn(0xFFFFFFFFL))
        assertEquals(0xFFFFFFFFL, readableOn(0xFF000000L))
    }
}
```
(`over(0x80FFFFFF, noir)` : alpha `0x80`=128/255 ; 255 * 0,50196 = 128,0 → `0x80` : le test attend `0xFF808080` ; l'arrondi doit être « au plus proche ».)

`ThemeColorsTest.kt` : remplacer le test `le clair est la coque neutre avec l'accent du theme` par :

```kotlin
    @Test fun `le clair est la palette claire du theme, derivee comme le PC`() {
        val ayu = getTheme("ayu")
        val c = resolveThemeColors(ayu, null, AppearanceMode.Light, systemDark = true)
        assertTrue(c.light)
        assertEquals(argbOfHex(ayu.light.surface), c.primary)
        assertEquals(argbOfHex(ayu.light.ink), c.text)
        assertEquals(argbOfHex(ayu.light.accent), c.accent)
        assertEquals(argbOfHex(ayu.light.error), c.error)
        assertEquals(mixColors(c.primary, c.text, 0.12), c.secondary)
        assertEquals(mixColors(c.primary, c.text, 0.72), c.muted)
        assertEquals(mixColors(c.primary, c.text, 0.52), c.faint)
        assertEquals(readableOn(c.accent), c.onAccent)
    }

    @Test fun `un accent personnalise reste en clair`() {
        val c = resolveThemeColors(mocha, ThemeCustomization(accent = "#ff0000"), AppearanceMode.Light, false)
        assertEquals(0xFFFF0000L, c.accent)
    }
```
et dans `chaque theme se resout dans les deux modes`, remplacer l'assertion d'accent par : `assertEquals(argbOfHex(if (c.light) theme.light.accent else theme.accent), c.accent)`.

`ThemeContrastTest.kt` :

```kotlin
package com.ahmed.neocalendar.core.appearance

import org.junit.Assert.assertEquals
import org.junit.Test

/** Seuils de la spec §3.3 : texte 4,5 ; grands éléments, icônes et pastilles 3. */
class ThemeContrastTest {
    private val text = 4.5
    private val graphic = 3.0

    /** `thème/mode/paire` -> raison : seulement si la palette officielle est seule en cause (relevé de la Task 4). Vide au départ. */
    private val exemptions = emptyMap<String, String>()

    private class Pair(val name: String, val fg: Long, val bg: Long, val min: Double)

    private fun pairs(c: ThemeColors): List<Pair> {
        val list = ArrayList<Pair>()
        for ((surfaceName, surface) in listOf("fond" to c.primary, "panneau" to c.secondary, "survol" to c.hover)) {
            list += Pair("texte sur $surfaceName", c.text, surface, text)
            list += Pair("secondaire sur $surfaceName", c.muted, surface, text)
            list += Pair("discret sur $surfaceName", c.faint, surface, graphic)
        }
        list += Pair("valeur de réglage sur panneau", settingsValueColor(c), c.secondary, text)
        list += Pair("note de réglage sur panneau", settingsNoteColor(c), c.secondary, graphic)
        list += Pair("texte sur accent", c.onAccent, c.accent, text)
        list += Pair("accent sur fond (pastille, icône)", c.accent, c.primary, graphic)
        list += Pair("accent sur panneau (pastille, icône)", c.accent, c.secondary, graphic)
        list += Pair("erreur sur fond", c.error, c.primary, text)
        list += Pair("succès sur fond", c.success, c.primary, graphic)
        return list
    }

    @Test fun `chaque theme tient ses seuils en sombre et en clair`() {
        val failures = ArrayList<String>()
        for (theme in THEMES) for (mode in listOf(AppearanceMode.Dark, AppearanceMode.Light)) {
            val colors = resolveThemeColors(theme, null, mode, systemDark = mode == AppearanceMode.Dark)
            for (pair in pairs(colors)) {
                val key = "${theme.id}/${mode.key}/${pair.name}"
                val ratio = contrastRatio(pair.fg, pair.bg)
                if (ratio < pair.min && key !in exemptions) failures += "$key : ${"%.2f".format(java.util.Locale.ROOT, ratio)} < ${pair.min}"
            }
        }
        assertEquals(emptyList<String>(), failures)
    }
}
```

Run : `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.ContrastTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeColorsTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeContrastTest'`
Expected : échec de compilation (`contrastRatio`, `readableOn`, `settingsValueColor` introuvables).

- [ ] **Step 2: Implémenter `Contrast.kt`**

```kotlin
package com.ahmed.neocalendar.core.appearance

import kotlin.math.pow
import kotlin.math.roundToInt

/** Luminance relative WCAG 2.x d'une couleur opaque (l'alpha est ignoré). */
fun relativeLuminance(argb: Long): Double {
    fun lin(shift: Int): Double {
        val c = ((argb shr shift) and 0xFF).toInt() / 255.0
        return if (c <= 0.03928) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }
    return 0.2126 * lin(16) + 0.7152 * lin(8) + 0.0722 * lin(0)
}

/** Le premier plan (éventuellement translucide) composé sur un fond opaque. */
fun over(fg: Long, bg: Long): Long {
    val a = alphaOf(fg) / 255.0
    fun m(shift: Int): Long {
        val top = ((fg shr shift) and 0xFF).toInt()
        val back = ((bg shr shift) and 0xFF).toInt()
        return (top * a + back * (1 - a)).roundToInt().coerceIn(0, 255).toLong()
    }
    return 0xFF000000L or (m(16) shl 16) or (m(8) shl 8) or m(0)
}

/** Rapport de contraste WCAG 2.x ; le premier plan translucide est composé sur `bg`. */
fun contrastRatio(fg: Long, bg: Long): Double {
    val a = relativeLuminance(over(fg, bg))
    val b = relativeLuminance(bg)
    return (maxOf(a, b) + 0.05) / (minOf(a, b) + 0.05)
}

/** Du blanc ou du noir, selon ce qui se lit le mieux sur `bg`. */
fun readableOn(bg: Long): Long =
    if (contrastRatio(0xFFFFFFFFL, bg) >= contrastRatio(0xFF000000L, bg)) 0xFFFFFFFFL else 0xFF000000L
```

Run : `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.ContrastTest'`
Expected : PASS (les autres classes de test ne compilent pas encore : si Gradle compile tout le jeu de tests, faire le Step 3 avant de relancer).

- [ ] **Step 3: Clair thématisé et couleurs de réglage dans `ThemeColors.kt`**

Dans `ThemeColors.kt` : supprimer l'objet `LightShell` ; remplacer la branche `if (light) { return ThemeColors(...) }` par :

```kotlin
    if (light) {
        val l = theme.light
        val primary = argbOfHex(l.surface)
        val text = argbOfHex(l.ink)
        val lightAccent = argbOfHex(custom?.accent ?: l.accent)
        return ThemeColors(
            light = true, primary = primary,
            secondary = mixColors(primary, text, 0.12), crust = mixColors(primary, text, 0.08),
            hover = mixColors(primary, text, 0.22), border = withAlpha(text, 0x38),
            text = text, muted = mixColors(primary, text, 0.72), faint = mixColors(primary, text, 0.52),
            onAccent = readableOn(lightAccent), error = argbOfHex(l.error), success = argbOfHex(l.success),
            accent = lightAccent, accentStrong = mixColors(lightAccent, BLACK, 0.12),
        )
    }
```
Mettre à jour le commentaire de tête (« En mode clair, la palette claire du thème, dérivée comme le PC »). Ajouter à la fin du fichier :

```kotlin
/** Valeurs des réglages (titres, valeurs de droite) : entre le texte secondaire et le texte discret. */
fun settingsValueColor(c: ThemeColors): Long = mixColors(c.muted, c.faint, 0.18)

/** Notes et chevrons des réglages : plus près du texte discret. */
fun settingsNoteColor(c: ThemeColors): Long = mixColors(c.muted, c.faint, 0.78)
```
`NeoTokens.kt`, dans `deriveTokens` : `settingsValue = c(settingsValueColor(colors)),` et `settingsNote = c(settingsNoteColor(colors)),` (importer les deux fonctions ; le calcul est identique à l'ancien, aucun changement visible en sombre). NE PAS toucher à `CatppuccinMocha` ici ni à `refreshTokens`.

- [ ] **Step 4: Run tests**

Run : `.\gradlew.bat :core:test --tests 'com.ahmed.neocalendar.core.appearance.ContrastTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeColorsTest' --tests 'com.ahmed.neocalendar.core.appearance.ThemeContrastTest'`
Expected : `ContrastTest` et `ThemeColorsTest` verts ; `ThemeContrastTest` : des échecs `<thème>/<mode>/<paire> : <ratio> < <seuil>` à corriger.

- [ ] **Step 5: Corriger dans la dérivation**

Même règle qu'en Task 5 Step 7 : vérifier la palette (relevé), sinon ajuster la RÈGLE (proportions 0,72 / 0,52 de `muted` / `faint`, 0,18 / 0,78 de `settingsValueColor` / `settingsNoteColor`, `onAccent` calculé par `readableOn` aussi en sombre si la valeur de `ThemePalette.onAccent` échoue). Pour garder PC et Android d'accord, toute proportion changée ici l'est aussi dans `panelTokens.ts` (et inversement) : relancer les deux suites. `CatppuccinMocha` (constantes mesurées) ne bouge que si le test échoue pour Catppuccin sombre ; dans ce cas, réaligner la constante sur la formule et refaire la preuve avant / après (Task 4 Step 6). Exemptions : `exemptions` vide par défaut ; une entrée n'est admise que pour une palette officielle seule en cause, avec sa raison dans le relevé.

- [ ] **Step 6: Run full core + build**

Run : `.\gradlew.bat :core:test assembleDebug`
Expected : BUILD SUCCESSFUL, tous les tests verts. À l'écran (émulateur) : mode clair d'un thème (par exemple GitHub) : Réglages, tiroir, grille lisibles (capture dans `.superpowers/themes/`).

- [ ] **Step 7: Commit**

```bash
git add apps/android/native
git commit -m "Android : mode clair thématisé, contraste WCAG testé sur tous les thèmes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 7: Pages Apparence, deux sections (PC et Android)

**Files:**
- Modify: `apps/windows/src/DesktopSettings.tsx` (`renderAppearance`, l.1396-1600 environ), `apps/windows/src/SettingsPrimitives.tsx` (ajout de `SettingsSection`), `apps/windows/src/App.css` (style du titre de section, près de `.nc-set-group__title` l.4569), `src/ui/i18n.ts`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/AppearanceScreen.kt` (corps d'`AppearancePage` l.150-250), `ui/SettingsScreen.kt` (ajout de `SectionTitle` près de `Group`, l.585), `app/src/main/res/raw/i18n_fr_en.tsv`
- Test: `apps/windows/src/DesktopSettings.test.tsx`

**Interfaces:**
- Consumes : `setWallpaperId` / `resolveWallpaperId` (Task 1), `NeoAppearance.setWallpaper` (Task 2).
- Produces : PC `SettingsSection({ title, children })` ; Android `internal fun SectionTitle(text: String)`.

Structure cible des deux pages (ordre) :
1. Section « Thème » : groupe sans titre [ligne Thème, Importer, Copier] ; groupe « Couleurs » [Accentuation, Arrière-plan, Avant-plan, Contraste, Barre latérale translucide] ; groupe « Polices » ; groupe sans titre [Enregistrer, Réinitialiser ce thème, message].
2. Section « Fond d'écran » : un groupe, note « L'aperçu et l'application se mettent à jour instantanément. » [sélecteur d'image, Luminosité du fond, Flou du fond, Opacité des conteneurs].
La barre latérale translucide est une propriété du thème (brouillon, « Enregistrer ») : elle passe sous « Thème ».

- [ ] **Step 1: Write the failing test (PC)**

Dans `DesktopSettings.test.tsx`, ajouter :

```tsx
    it("sépare l'apparence en deux sections : Thème puis Fond d'écran", () => {
        const html = renderToStaticMarkup(
            <DesktopSettings open initialTab="appearance" {...commonProps} />
        );
        const theme = html.indexOf('data-section="theme"');
        const wallpaper = html.indexOf('data-section="wallpaper"');
        expect(theme).toBeGreaterThan(-1);
        expect(wallpaper).toBeGreaterThan(theme);
        expect(html).toContain("Fond d&#x27;écran");
        // La barre latérale translucide appartient au thème, les curseurs du fond au fond d'écran.
        expect(html.indexOf("Barre latérale translucide")).toBeLessThan(wallpaper);
        expect(html.indexOf("Luminosité du fond")).toBeGreaterThan(wallpaper);
    });
```
(Si l'apostrophe est rendue autrement, ajuster l'assertion sur le HTML réel : lire la sortie de l'échec.)

Run : `npx jest apps/windows/src/DesktopSettings.test.tsx -t "deux sections"`
Expected : FAIL (`data-section` absent).

- [ ] **Step 2: Implémenter côté PC**

`SettingsPrimitives.tsx`, après `SettingsGroup` :

```tsx
interface SettingsSectionProps {
    id: string;
    title: string;
    children: React.ReactNode;
}

/** Un titre de page de réglages qui regroupe plusieurs blocs : « Thème », « Fond d'écran ». */
export function SettingsSection({ id, title, children }: SettingsSectionProps) {
    return (
        <section className="nc-set-section" data-section={id} aria-label={title}>
            <h2 className="nc-set-section__title">{title}</h2>
            {children}
        </section>
    );
}
```
`App.css`, après la règle `.nc-set-group__title` :

```css
.nc-set-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.nc-set-section__title {
    margin: 0;
    padding: 0 4px;
    font-size: 15px;
    font-weight: 650;
    color: var(--nc-text-primary);
}
```
(Adapter `gap` à celui de `.nc-set-groups` lu dans le fichier, l.4547.) `i18n.ts` : changer `Wallpaper: "Image de fond",` en `Wallpaper: "Fond d'écran",` APRÈS avoir cherché `t("Wallpaper")` dans `apps/windows/src` et `src/ui` : si l'usage dépasse ce titre de groupe, créer plutôt la clé `"Screen wallpaper": "Fond d'écran"` et utiliser `t("Screen wallpaper")` pour le titre de section. `renderAppearance` : envelopper dans `<SettingsSection id="theme" title={t("Theme")}>` les groupes Thème (sans `title`), Couleurs (y ajouter la rangée `SettingsToggleRow` « Barre latérale translucide », déplacée du groupe du fond), Polices, et le groupe Enregistrer / Réinitialiser (lire la fin du rendu pour son code exact, après la ligne 1560), puis `<SettingsSection id="wallpaper" title={t("Wallpaper")}>` autour d'un seul `SettingsGroup note={t("The preview and the app update instantly.")}` contenant `ThemeWallpaperPicker` et `WallpaperEffectsControls`. Importer `SettingsSection`. Run : `npx jest apps/windows/src/DesktopSettings.test.tsx apps/windows/src/SettingsPrimitives.test.tsx` ; `npx tsc --noEmit -p apps/windows`. Expected : PASS.

- [ ] **Step 3: Implémenter côté Android**

`SettingsScreen.kt`, après `Group` :

```kotlin
/** Titre d'une section de page (« Thème », « Fond d'écran ») : plus fort que le titre d'un groupe. */
@Composable
internal fun SectionTitle(text: String) {
    SText(text, Modifier.padding(start = 4.dp, top = 8.dp), color = Neo.Text, size = 17f, weight = 650)
}
```
`AppearanceScreen.kt`, dans `AppearancePage` : placer `SectionTitle("Thème")` avant `Group("Thème")` (qui devient `Group(null)`), déplacer la ligne `toggle(NeoIcons.PanelLeft, "Barre latérale translucide", ...)` à la fin de `Group("Couleurs")`, garder `Group("Polices")` et le groupe Enregistrer / Réinitialiser ; puis `SectionTitle("Fond d’écran")` avant un seul groupe `Group(null, note = "L’aperçu et l’application se mettent à jour instantanément.")` contenant la ligne « Image de fond » et les trois curseurs. Vérifier qu'aucun import n'est mort. `i18n_fr_en.tsv` : ajouter une ligne `Fond d’écran<TAB>Wallpaper` (même apostrophe que le texte du code ; la fin de ligne du fichier est celle du fichier existant, écrire avec Edit) ; `Thème` y existe déjà (vérifier par grep). Run : `.\gradlew.bat :core:test assembleDebug`. Expected : BUILD SUCCESSFUL ; `FrenchToEnglishTest` vert.

- [ ] **Step 4: Vérifier à l'écran**

PC : ouvrir Réglages > Apparence (`npm run dev` selon CLAUDE.md : `node scripts/configure-tauri-updater.mjs` d'abord, `git checkout apps/windows/src-tauri/tauri.conf.json` après) : deux titres de section dans l'ordre, changer de thème ne change pas l'image. Android : même page sur l'émulateur, en français puis en anglais (« Wallpaper »). Captures dans `.superpowers/themes/apparence-{pc,android}.png`.

- [ ] **Step 5: Commit**

```bash
git add apps/windows/src src/ui/i18n.ts apps/android/native
git commit -m "Apparence : deux sections, Thème puis Fond d'écran (PC et Android)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```

---

### Task 8: Images côte à côte, mesure finale du lancement, rapport

**Files:**
- Create (non commités sauf le rapport) : `.superpowers/themes/capture-pc.mjs`, `.superpowers/themes/images/*.png`
- Create: `.superpowers/themes/rapport.md`
- Modify: `.superpowers/themes/lancement.md` (section « Après Task 8 »)

- [ ] **Step 1: Lancement après, sur le build final**

`.\gradlew.bat :core:test assembleDebug`, `install -r`, puis exactement le protocole du Task 2 Step 1 (6 essais, le premier jeté), section « Après Task 8 » de `.superpowers/themes/lancement.md`, avec la moyenne et l'écart-type de « Avant ». Une moyenne supérieure à celle d'« Avant » de plus d'un écart-type est une régression : BLOQUER, chercher ce qui travaille avant la grille, corriger, remesurer. Vérifier à l'écran au lancement à froid : rond seul sur fond uni, puis fond et grille ensemble (captures à 0,3 s, 1 s, 2 s après `am start` avec `screencap` en boucle).

- [ ] **Step 2: Captures Android (émulateur)**

Pour chacun des 6 thèmes et chaque mode (sombre, clair) : écrire les préférences (`appearance` JSON avec `"mode"`, `theme_id`) dans `shared_prefs/neo_native_appearance.xml` après sauvegarde (voir Conventions ; édition par `run-as ... sed -i`), `force-stop`, relancer, ouvrir les quatre panneaux (grille, fiche d'évènement, tiroir, Réglages) et `& $adb -s emulator-5554 exec-out screencap -p > images\android-<thème>-<mode>-<panneau>.png`. Relever UNE FOIS les coordonnées d'appui des quatre panneaux sur Catppuccin (captures + `adb -s emulator-5554 shell input tap x y`) : la mise en page est la même pour tous les thèmes. Restaurer ensuite le fichier de préférences sauvegardé.

- [ ] **Step 3: Captures PC**

Sauvegarder `desktop-settings.json` (le magasin de l'app : chemin sous `%APPDATA%\` lu dans `apps/windows/src-tauri/tauri.conf.json`, champ `identifier`) et `localStorage` ne se sauvegarde pas : noter le mode et le thème actuels pour les remettre. Lancer `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"; npm run dev` (après `configure-tauri-updater.mjs`). Script `.superpowers/themes/capture-pc.mjs` (Node 26 : `WebSocket` global) :

```js
import { writeFileSync } from "node:fs";
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
export const evaluate = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
export async function shot(file) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(r.result.data, "base64")); }
export const setAppearance = (mode) => evaluate(`(() => { const p = JSON.parse(localStorage.getItem("neo-calendar.appearance") || "{}"); p.mode = "${mode}"; localStorage.setItem("neo-calendar.appearance", JSON.stringify(p)); window.dispatchEvent(new CustomEvent("neo-calendar:appearance-change", { detail: p })); })()`);
```
Le mode se change par l'évènement ci-dessus ; le thème, par l'interface (clic sur Réglages > Apparence > Thème > le thème, via `evaluate` de `document.querySelector(...).click()` : lire les sélecteurs dans le DOM, ne pas les deviner) ou, à défaut, en éditant `themeId` dans `desktop-settings.json` app fermée. Une image par thème, mode et panneau (grille, fiche, tiroir, Réglages) dans `images\pc-<thème>-<mode>-<panneau>.png`. Après : restaurer le thème et le mode d'Ahmed, `git checkout apps/windows/src-tauri/tauri.conf.json`.

- [ ] **Step 4: Montages côte à côte**

Pour chaque thème et panneau : sombre | clair sur une image, et un montage « 6 thèmes » par panneau, avec ffmpeg :

```powershell
ffmpeg -y -i images\android-github-dark-grille.png -i images\android-github-light-grille.png -filter_complex hstack=inputs=2 images\cote-android-github-grille.png
ffmpeg -y -i images\pc-github-dark-grille.png -i images\pc-github-light-grille.png -filter_complex hstack=inputs=2 images\cote-pc-github-grille.png
```
(24 montages par plateforme : 6 thèmes x 4 panneaux ; un petit script PowerShell en boucle les produit.) Regarder CHAQUE image (outil Read) : texte secondaire lisible, pastilles visibles, aucune surface qui jure avec ses voisines, fond d'écran traversant les panneaux de la même façon dans les quatre panneaux d'un thème.

- [ ] **Step 5: Suite complète, rapport, commit**

Run : `npm test` (racine) et `.\gradlew.bat :core:test assembleDebug`. Expected : tout vert.

Écrire `.superpowers/themes/rapport.md` : tâches faites, mesures de lancement (avant / après, moyennes et écarts-types), exemptions de contraste s'il y en a (raisons), écarts de palette corrigés (liste du relevé), l'effet visible pour le thème par défaut (avec les images avant / après si besoin), ce qui n'a pas pu être vérifié, et les chemins des montages. Commit :

```bash
git add .superpowers/themes/rapport.md .superpowers/themes/lancement.md
git commit -m "Thèmes et fond d'écran : mesures, images côte à côte et rapport

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0143oZv67zst42zsh4K86Uex"
```
Donner à Ahmed la commande de livraison à copier-coller (`git ship minor "Thèmes : six thèmes fidèles, fond d'écran indépendant"`) sans l'exécuter.

---

## Self-review (faite à l'écriture)

**Couverture de la spec.** §3.1 (fond global, repli, deux sections, effets sous le fond) : Tasks 1, 2, 7. §3.2 (6 thèmes, retrait CSS / Android, repli Catppuccin) : Task 3. §3.3 fidélité clair et sombre : Task 4 ; lisibilité (seuils 4,5 / 3, correction dans la dérivation) : Tasks 5 et 6 ; cohérence des niveaux de surface : mêmes formules dans `derivePanelTokens` et `resolveThemeColors`, pastilles et surfaces vérifiées aux images ; preuve visuelle : Task 8. §4 contraintes (lancement, pas de migration, Kotlin, format partagé) : Global Constraints, Tasks 2 et 8. §5 tests (fond global, thème retiré, contraste, dérivation, contrôle automatique) : tests des Tasks 1 à 6.

**Placeholders.** Les seuls `<hex>` sont ceux du Task 4 Step 3, à recopier du relevé (exigence d'Ahmed : aucune valeur de mémoire). Aucun « TBD ».

**Cohérence des types.** `resolveWallpaperId` / `setWallpaperId` / `pinWallpaperId` (PC) et `resolvedWallpaperId` / `withWallpaper` / `withPinnedWallpaper` (Kotlin) sont utilisés tels quels aux Tasks 1, 2, 7. `ThemeDefinition.light` (`danger`) et `ThemeLight` (`error`) sont reliés par le test de parité. `derivePanelTokens` et `resolveThemeColors` partagent les proportions 0,12 / 0,16 / 0,22 / 0,72 / 0,52 et 0,08 (fond de page clair).

**Points tranchés par le plan (à confirmer par Ahmed au besoin).**
1. Le mode clair devient thématisé (palette claire officielle de chaque thème) au lieu de la coque neutre actuelle : la spec demande de comparer les variantes claires aux palettes officielles ; c'est un changement visible voulu.
2. Thème retiré : le repli du fond lit le fond du thème effectif (Catppuccin), pas celui du thème retiré, conformément à la lettre de la spec.
3. Le texte discret (`faint`) est tenu à 3:1, le texte secondaire (`muted`) à 4,5:1 ; la spec ne tranche pas la catégorie du texte discret.
4. Le contraste est mesuré sur surface opaque ; la transparence sur le fond d'écran est jugée aux images.
5. Copier / importer un thème (`codex-theme-v1`) n'écrit ni ne lit plus de fond.

**Non vérifié à l'écriture.** Le rendu actuel du mode clair sur PC (les propriétés posées en ligne par `App.tsx` semblent l'emporter sur la coque claire de `App.css`) : la Task 5 le corrige par construction, la capture de la Task 8 le confirme. Les valeurs de palette : aucune lue ici. `sed -i` dans `run-as` sur l'émulateur.
