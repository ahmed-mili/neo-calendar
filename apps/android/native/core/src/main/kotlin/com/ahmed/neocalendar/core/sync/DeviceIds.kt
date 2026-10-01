package com.ahmed.neocalendar.core.sync

import java.util.Locale

/**
 * Identifiants d'appareil Syncthing : 52 caractères base32 découpés en 4 blocs de 13, chacun suivi
 * d'un caractère de contrôle (somme de contrôle « Luhn mod 32 » de Syncthing, `lib/protocol/luhn.go`),
 * soit 56 caractères, affichés en 8 groupes de 7 séparés par des tirets.
 */
object DeviceIds {
    private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    /** Le caractère de contrôle d'un bloc, ou null si le bloc sort de l'alphabet. */
    fun checkChar(block: String): Char? {
        var factor = 1
        var sum = 0
        for (c in block) {
            val code = ALPHABET.indexOf(c)
            if (code < 0) return null
            val addend = factor * code
            factor = if (factor == 2) 1 else 2
            sum += addend / 32 + addend % 32
        }
        return ALPHABET[(32 - sum % 32) % 32]
    }

    /**
     * L'identifiant mis au format affiché, ou null s'il est invalide. Comme Syncthing : majuscules,
     * tirets et espaces ignorés, 0 / 1 / 8 lus O / I / B (fautes de frappe). Seule la forme à 56
     * caractères est acceptée : sans caractères de contrôle, une faute de frappe passerait.
     */
    fun normalize(raw: String): String? {
        val compact = raw.trim().uppercase(Locale.ROOT)
            .replace("-", "").replace(" ", "")
            .replace('0', 'O').replace('1', 'I').replace('8', 'B')
        if (compact.length != 56) return null
        for (i in 0 until 4) {
            val block = compact.substring(i * 14, i * 14 + 13)
            if (checkChar(block) != compact[i * 14 + 13]) return null
        }
        return compact.chunked(7).joinToString("-")
    }

    fun isValid(raw: String): Boolean = normalize(raw) != null
}
