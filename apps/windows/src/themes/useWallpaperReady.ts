import { useEffect, useState } from "react";
import {
    ensureSelected,
    isReady,
    WALLPAPER_READY_EVENT,
} from "./wallpaperDownload";

/**
 * Le fond choisi est-il là ? Sinon, aller le chercher.
 *
 * Rend `false` le temps qu'un fond absent revienne du réseau, pour que ce qui
 * peint le décor se rabatte sur celui du thème plutôt que de demander une image
 * qui n'existe pas encore et d'afficher un vide. Sur le bureau, où les images
 * sont livrées avec l'application, c'est toujours `true` du premier coup.
 */
export function useWallpaperReady(imageUrl: string | null): boolean {
    const [ready, setReady] = useState(() => isReady(imageUrl));

    useEffect(() => {
        const here = isReady(imageUrl);
        setReady(here);
        if (here) return;

        const onReady = () => setReady(isReady(imageUrl));
        window.addEventListener(WALLPAPER_READY_EVENT, onReady);
        ensureSelected(imageUrl);

        return () => {
            window.removeEventListener(WALLPAPER_READY_EVENT, onReady);
        };
    }, [imageUrl]);

    return ready;
}
