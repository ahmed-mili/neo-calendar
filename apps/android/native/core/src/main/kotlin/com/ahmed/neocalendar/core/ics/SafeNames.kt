package com.ahmed.neocalendar.core.ics

import java.nio.file.Path

/*
 * Port de `safe_join` et `validate_single_name` (apps/windows/src-tauri/src/lib.rs,
 * 113-146). Ces deux gardes sont en Rust : le corpus Jest ne peut pas les
 * atteindre, SafeNamesTest en porte les attendus.
 *
 * Les composants se lisent comme sous Windows (séparateurs `/` et `\`, lecteur
 * `C:`), quel que soit le système : le noyau tourne aussi sous Android, et la
 * lecture la plus stricte est la seule qui protège les deux.
 */

private val DRIVE_PREFIX = Regex("""^[A-Za-z]:""")

/** Les blancs de `str::trim` de Rust (Unicode White_Space) : ni U+FEFF ni U+180E. */
private fun isRustSpace(c: Char): Boolean = when (c) {
    '\t', '\n', '\u000B', '\u000C', '\r', ' ', '\u0085', '\u00A0', '\u1680',
    '\u2028', '\u2029', '\u202F', '\u205F', '\u3000' -> true
    else -> c in '\u2000'..'\u200A'
}

/**
 * `root` suivi des composants de `relativePath`. Lève sur `..`, une racine, un
 * lecteur ou un partage réseau. Le Rust laisse `a/C:/b` sortir de la racine
 * (PathBuf::push d'un préfixe remplace le chemin) ; ici un lecteur est refusé
 * où qu'il soit.
 */
fun safeJoin(root: Path, relativePath: String): Path {
    fun invalid(): Nothing = throw IllegalArgumentException("Invalid relative path: $relativePath")

    var result = root
    relativePath.split('/', '\\').forEachIndexed { index, segment ->
        when {
            segment.isEmpty() -> if (index == 0 && relativePath.isNotEmpty()) invalid()
            segment == "." -> Unit
            segment == ".." -> invalid()
            DRIVE_PREFIX.containsMatchIn(segment) -> invalid()
            else -> result = result.resolve(segment)
        }
    }
    return result
}

/** Un nom de dossier ou de fichier, sans chemin : rogné, non vide, un seul composant. */
fun validateSingleName(name: String, kind: String): String {
    val trimmed = name.trim(::isRustSpace)
    if (trimmed.isEmpty()) throw IllegalArgumentException("The $kind name cannot be empty.")

    // Sous Windows, « C:a » fait deux composants (préfixe + nom) ; « C: » seul n'en fait qu'un.
    val driveWithTail = DRIVE_PREFIX.containsMatchIn(trimmed) && trimmed.length > 2
    if (driveWithTail || trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\')) {
        throw IllegalArgumentException("Invalid $kind name: $trimmed")
    }
    return trimmed
}
