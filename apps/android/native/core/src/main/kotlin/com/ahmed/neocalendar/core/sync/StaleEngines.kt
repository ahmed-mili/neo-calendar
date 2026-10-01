package com.ahmed.neocalendar.core.sync

/** Un processus vu dans `/proc` : identifiant, uid propriétaire, ligne de commande découpée (arguments séparés par NUL). */
data class ProcInfo(val pid: Int, val uid: Int, val cmdline: List<String>)

private const val ENGINE_BINARY = "libsyncthingnative.so"

/**
 * Les processus moteur restés d'un lancement précédent (l'app a été tuée sans arrêter son moteur) : même uid que l'app,
 * binaire `libsyncthingnative.so` et NOTRE dossier d'état en `--home=` (comparaison exacte, pas de préfixe). Ni un
 * autre uid, ni un autre dossier, ni l'app elle-même. Le moniteur et son enfant portent la même ligne : les deux sortent.
 */
fun staleEngines(processes: List<ProcInfo>, ownUid: Int, selfPid: Int, home: String): List<Int> =
    processes.filter { p ->
        p.uid == ownUid && p.pid != selfPid &&
            p.cmdline.firstOrNull()?.substringAfterLast('/') == ENGINE_BINARY &&
            "--home=$home" in p.cmdline
    }.map { it.pid }
