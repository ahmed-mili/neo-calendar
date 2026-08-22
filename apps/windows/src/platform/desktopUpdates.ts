import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
    UPDATE_PROGRESS_EVENT,
    noteDownloadedUpdate,
    setUpdateInstaller,
} from "../../../../src/ui/calendar/appUpdates";

/**
 * Ce que le bureau rapporte de sa mise à jour, traduit pour la fenêtre.
 *
 * Le natif parle par le bus de Tauri, le téléphone par des évènements DOM. Un
 * seul contrôle affiche les deux, donc c'est ici qu'on traduit : le bureau
 * émet, ce module redit la même chose dans la langue que la fenêtre écoute
 * déjà. Sans cela il faudrait deux contrôles qui ne pourraient que diverger.
 */
export async function watchDesktopUpdates(): Promise<() => void> {
    // Le contrôle appelle une seule fonction, où qu'il tourne : c'est ici que le
    // bureau dit comment il pose la sienne.
    setUpdateInstaller(() => void installPendingUpdate());
    const stopProgress = await listen<number>(
        "neo-update-progress",
        ({ payload }) => {
            window.dispatchEvent(
                new CustomEvent(UPDATE_PROGRESS_EVENT, {
                    detail: { percent: payload },
                })
            );
        }
    );
    const stopReady = await listen<string>(
        "neo-update-ready",
        ({ payload }) => {
            /* La version prête AVANT l'effacement du compteur, et l'ordre n'est
               pas une coquetterie : le contrôle disparaît quand il n'a rien à
               dire, or React 17 ne groupe pas deux états posés hors de ses
               propres évènements. Le compteur effacé en premier laissait donc
               un rendu sans rien — la pastille démontée puis remontée, et
               l'animation de l'un vers l'autre perdue. */
            noteDownloadedUpdate(payload);
            // Ce qui descendait est arrivé : le compteur peut s'effacer.
            window.dispatchEvent(
                new CustomEvent(UPDATE_PROGRESS_EVENT, {
                    detail: { percent: -2 },
                })
            );
        }
    );
    return () => {
        stopProgress();
        stopReady();
    };
}

/**
 * Pose la mise à jour déjà descendue, puis l'application redémarre.
 *
 * Rien à retélécharger : les octets attendent depuis le lancement, c'est tout
 * l'intérêt d'avoir séparé les deux moitiés.
 */
export async function installPendingUpdate(): Promise<void> {
    await invoke("install_pending_update");
}
