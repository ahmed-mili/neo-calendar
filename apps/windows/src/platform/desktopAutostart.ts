import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/**
 * Le démarrage automatique, et où vit sa vérité.
 *
 * L'état n'est pas rangé dans les préférences : il est lu dans le registre, où
 * Windows le tient. C'est ce qui fait qu'une entrée désactivée depuis le
 * Gestionnaire des tâches se voit dans l'application, au lieu de laisser deux
 * vérités diverger en silence.
 *
 * Chaque appel est protégé : une machine où l'écriture du registre est refusée
 * doit pouvoir ouvrir ses Paramètres, pas les voir jeter.
 */
export async function isStartupEnabled(): Promise<boolean> {
    try {
        return await isEnabled();
    } catch {
        // Pas de registre, pas de démarrage automatique : répondre « non » est
        // vrai, et c'est la seule réponse sur laquelle on peut s'appuyer.
        return false;
    }
}

/**
 * Écrit, puis relit. Ce qui est rendu est l'état réel, pas celui demandé : un
 * interrupteur qui reste allumé sur une écriture refusée est un interrupteur
 * qui ment, et la promesse « les rappels arrivent même app fermée » ne tiendrait
 * plus.
 */
export async function setStartupEnabled(wanted: boolean): Promise<boolean> {
    try {
        if (wanted) await enable();
        else await disable();
    } catch {
        // Le registre a refusé ; la relecture qui suit dira l'état vrai.
    }
    return isStartupEnabled();
}
