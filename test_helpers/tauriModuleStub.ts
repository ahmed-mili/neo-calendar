/**
 * La doublure que les tests reçoivent à la place des modules @tauri-apps.
 *
 * Ces paquets ne sont installés que dans apps/windows ; la suite tourne depuis
 * la racine, où `npm ci` ne descend pas. Le module manquant ne faisait pas
 * échouer le test du pont — il n'y en a pas — mais celui de tout fichier qui
 * l'importe en chemin, avant le premier rendu. `moduleNameMapper` renvoie ici
 * pour que l'import cesse d'être ce qui décide si une suite peut tourner.
 *
 * Elle répond à n'importe quel nom, parce qu'un seul objet sert les huit
 * modules du pont, et refuse d'être appelée. Appeler pour de vrai un module
 * natif dans un environnement `node` ne peut être qu'un mock oublié : la
 * doublure le dit avec le nom de ce qui a été demandé, plutôt que de rendre
 * `undefined` et de laisser l'erreur surgir trois appels plus loin.
 *
 * Un test qui a besoin d'un comportement le pose lui-même, comme
 * DesktopSettings.test.tsx pose `invoke`. Une précision qui compte alors : tous
 * les spécificateurs @tauri-apps se résolvent vers CE fichier, donc un
 * `jest.mock` sur l'un d'eux vaut pour tous dans le même test. Mocker
 * `api/core` et attendre le vrai `api/event` dans le même fichier ne marchera
 * pas — mais cela se voit tout de suite, à l'appel.
 */
const refuse = (name: string) => {
    throw new Error(
        `@tauri-apps: ${name}() a été appelé dans un test. Le pont natif n'est ` +
            `pas installé à la racine, où tourne la suite — mocke le module qui ` +
            `l'atteint, ou la fonction elle-même.`
    );
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const stub: any = new Proxy(
    {},
    {
        get(_target, property) {
            // Ce qui n'est pas une fonction du pont mais une question posée au
            // module lui-même : l'interop des imports, et le test de « thenable »
            // que fait `await import(...)`. Répondre une fonction à `then`
            // suspendrait la promesse pour toujours.
            if (property === "__esModule") return true;
            if (property === "then") return undefined;
            if (typeof property === "symbol") return undefined;
            return (..._args: unknown[]) => refuse(String(property));
        },
    }
);

export = stub;
