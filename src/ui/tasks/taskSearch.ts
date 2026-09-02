import type { TaskItem } from "./taskList";

/**
 * La forme sous laquelle deux textes se comparent dans un champ de recherche :
 * sans casse et sans diacritiques.
 *
 * Personne ne tape « Réinscription » avec son accent pour retrouver une tâche,
 * et une liste qui ne répond qu'à l'orthographe exacte ne sert à rien. La
 * décomposition Unicode sépare la lettre de son accent, et retirer les marques
 * combinantes laisse la lettre — ce qui vaut pour le français comme pour tout
 * script qui accentue, et ne touche pas à ceux qui n'accentuent pas.
 */
export function normalizeForSearch(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Mn}/gu, "")
        .toLocaleLowerCase();
}

/**
 * Si une tâche répond à ce qui est tapé.
 *
 * Chaque mot doit se retrouver, dans le titre ou dans le nom du calendrier :
 * deux mots affinent la recherche au lieu de l'élargir, et le calendrier est
 * souvent ce qui distingue deux tâches portant le même nom. Un champ vide ne
 * cache rien.
 */
export function matchesTaskQuery(task: TaskItem, query: string): boolean {
    const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;

    const haystack = normalizeForSearch(
        `${task.title ?? ""} ${task.calendarName ?? ""}`
    );
    return terms.every((term) => haystack.includes(term));
}
