// Les évènements du bureau, côté téléphone : personne n'en émet.
//
// La coque Android parle à la fenêtre par ses propres évènements DOM (voir
// appUpdates), pas par le bus de Tauri. Ce module n'existe que parce que le
// bundle Android embarque aussi le code du bureau, où l'écoute est réelle. Il
// rend donc un désabonnement qui ne fait rien, plutôt que de laisser
// l'importation échouer au chargement.
export async function listen<T>(
    _event: string,
    _handler: (payload: { payload: T }) => void
): Promise<() => void> {
    return () => {};
}
