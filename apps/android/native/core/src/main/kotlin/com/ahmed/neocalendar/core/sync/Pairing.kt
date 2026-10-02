package com.ahmed.neocalendar.core.sync

/**
 * Ce que contient le QR code affiché par le PC (« Ajouter le téléphone ») : l'identifiant de l'appareil PC et un
 * code d'appairage à usage unique, valable 5 minutes. Le format est un contrat avec le PC (`sync/pairing.rs`,
 * `qr_payload`) : le même vecteur d'essai figure des deux côtés.
 */
data class PairingPayload(val deviceId: String, val code: String) {
    companion object {
        private const val PREFIX = "neo-calendar://pair?"
        private val CODE = Regex("[A-HJ-NP-Z2-9]{10}")

        /** Le contenu d'un QR code scanné, ou null s'il n'est pas un appairage Neo Calendar valide (identifiant à somme de contrôle juste, code de 10 caractères). */
        fun parse(text: String): PairingPayload? {
            val trimmed = text.trim()
            if (!trimmed.startsWith(PREFIX)) return null
            val params = trimmed.removePrefix(PREFIX).split('&').mapNotNull { part ->
                part.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] }
            }.toMap()
            val id = DeviceIds.normalize(params["device"] ?: return null) ?: return null
            val code = params["code"] ?: return null
            return if (CODE.matches(code)) PairingPayload(id, code) else null
        }
    }
}

/**
 * Le code voyage dans le nom d'appareil que ce téléphone présente au PC (`Pixel 8 [NC:K7Q2M9XPAB]`) : l'API REST de
 * Syncthing v2.1.5 n'expose, pour un appareil encore inconnu, que son identifiant, son adresse et ce nom
 * (`/rest/cluster/pending/devices`, vérifié sur deux vrais moteurs).
 */
object PairingName {
    private val MARKER = Regex("\\s*\\[NC:[A-HJ-NP-Z2-9]{10}]\\s*$")

    fun hasCode(name: String): Boolean = MARKER.containsMatchIn(name)

    /** Le nom sans son éventuel code. */
    fun strip(name: String): String = name.replace(MARKER, "").trim()

    fun withCode(base: String, code: String): String = "${strip(base).ifEmpty { "Android" }} [NC:$code]"
}

/** Ce que ce téléphone fait après le scan, décidé par des fonctions pures. */
object PairingFollowUp {
    const val WINDOW_MS = 5 * 60 * 1000L

    /**
     * Le nom porte encore le code : il est rendu quand le PC est connecté (il a accepté), quand la fenêtre de 5 minutes
     * est passée, ou quand l'app a redémarré entre-temps (plus de session en mémoire). Le code ne doit pas rester
     * dans ce que les autres appareils voient.
     */
    fun shouldClearName(nameHasCode: Boolean, startedAtMs: Long?, nowMs: Long, pcConnected: Boolean): Boolean =
        nameHasCode && (startedAtMs == null || pcConnected || nowMs - startedAtMs > WINDOW_MS)

    /**
     * Le dossier que le PC propose est adopté sans question seulement si ce téléphone n'a ni note ni réglage locaux ;
     * sinon la carte de confirmation habituelle s'affiche (rien n'est fusionné sans que l'utilisateur le sache).
     */
    fun shouldAutoAdopt(offeredByPairedPc: Boolean, localNotes: Int, hasLocalPreferences: Boolean): Boolean =
        offeredByPairedPc && localNotes == 0 && !hasLocalPreferences
}
