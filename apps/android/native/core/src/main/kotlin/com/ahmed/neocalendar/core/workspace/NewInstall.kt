package com.ahmed.neocalendar.core.workspace

/** Ce que l'app sait d'elle-même au premier lancement ; rien n'est lu sur le disque des notes. */
data class InstallFacts(
    val storedMode: String?,
    val treeUri: String?,
    /** Nombre d'autorisations durables de dossier encore accordées à l'app. */
    val persistedGrantCount: Int,
    val oldAppInstalled: Boolean,
    val firstInstallTime: Long,
    val lastUpdateTime: Long,
)

/**
 * Une VRAIE nouvelle installation, seule autorisée à créer le dossier privé : tout est vrai à la fois. Au moindre
 * doute (préférences perdues, app mise à jour avant son premier lancement, ancienne app encore là, autorisation de
 * dossier survivante), on ne crée ni n'écrit rien : l'écran « Choisir le dossier » reste le comportement d'avant.
 */
fun isGenuineNewInstall(facts: InstallFacts): Boolean =
    facts.storedMode == null &&
        facts.treeUri.isNullOrEmpty() &&
        facts.persistedGrantCount == 0 &&
        !facts.oldAppInstalled &&
        facts.firstInstallTime == facts.lastUpdateTime

/** Le choix d'un dossier externe est refusé en mode intégré : il passerait en `External` sans copier les notes. */
fun mayPickExternalTree(mode: StorageMode?): Boolean = mode != StorageMode.Integrated
