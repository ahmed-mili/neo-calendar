package com.ahmed.neocalendar.core.format

/**
 * La langue des textes du noyau (jours, mois, rappels). Le français par défaut : le corpus de conformité est en français.
 * L'application la passe à `true` quand l'utilisateur choisit English ; l'anglais est alors la clé de l'ancien dictionnaire
 * (`t("Every day")` rend « Every day »), comme `t()` de `src/ui/i18n.ts` sans entrée française.
 */
object CoreLanguage {
    @Volatile
    var english: Boolean = false
}
