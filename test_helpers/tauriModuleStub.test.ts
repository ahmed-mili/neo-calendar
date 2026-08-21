/*
 * Ce que la CI voit à la place des modules natifs.
 *
 * `@tauri-apps/*` n'est installé que dans apps/windows ; la suite tourne depuis
 * la racine, où `npm ci` ne descend pas. Un fichier partagé qui importe le pont
 * faisait donc tomber la suite ENTIÈRE de la CI — pas le test du pont, celle du
 * fichier qui l'importe, avant même le premier rendu — et deux versions sont
 * sorties sans artefact pour cette raison (1.49.0, puis 1.50.0). Le
 * `moduleNameMapper` de jest.config.js rend cet échec impossible en résolvant
 * ces imports vers une doublure.
 *
 * La doublure se laisse importer et refuse d'être appelée : c'est exactement le
 * partage qu'on veut. Importer n'est pas se servir — un module peut être importé
 * par un fichier dont le test n'exerce jamais le pont — tandis qu'appeler pour
 * de vrai un module natif dans un test en environnement `node` ne peut être
 * qu'un oubli de mock, et il vaut mieux l'entendre que le deviner.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

describe("la doublure des modules @tauri-apps", () => {
    it("se laisse importer, quel que soit le module demandé", () => {
        expect(typeof invoke).toBe("function");
        expect(typeof listen).toBe("function");
    });

    it("dit ce qui manque quand un test l'appelle pour de vrai", () => {
        expect(() => invoke("peu_importe")).toThrow(/@tauri-apps/);
        expect(() => invoke("peu_importe")).toThrow(/invoke/);
    });
});
