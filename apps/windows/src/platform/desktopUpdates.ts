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
            // Le compteur s'efface : ce qui descendait est arrivé.
            window.dispatchEvent(
                new CustomEvent(UPDATE_PROGRESS_EVENT, {
                    detail: { percent: -2 },
                })
            );
            noteDownloadedUpdate(payload);
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
