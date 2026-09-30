package com.ahmed.neocalendar.core.ics

import java.nio.file.Path
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/*
 * Les attendus sont ceux de `safe_join` et `validate_single_name`
 * (apps/windows/src-tauri/src/lib.rs, 113-146), relevés en EXECUTANT ces deux
 * fonctions sous Windows dans un programme Rust temporaire (rustc, code copié
 * tel quel) : Path::components y lit aussi `\` et les lecteurs `C:`.
 *
 * Deux écarts voulus, plus stricts que le Rust :
 *  - "a/C:/b" : Rust Windows rend "C:b" (PathBuf::push d'un composant à préfixe
 *    REMPLACE le chemin, donc sort de la racine). Ici : refusé.
 *  - la trame de composants est lue pareil sur tous les systèmes (le noyau tourne
 *    sous Android), sans dépendre du Path de la plateforme.
 */
class SafeNamesTest {
    private val root: Path = Path.of("root")

    private fun joined(relative: String): String =
        root.relativize(safeJoin(root, relative)).toString().replace('\\', '/')

    private fun invalidPath(relative: String) {
        val error = assertThrows(IllegalArgumentException::class.java) { safeJoin(root, relative) }
        assertEquals("Invalid relative path: $relative", error.message)
    }

    @Test
    fun safeJoinAccepteLesCheminsSansEchappee() {
        assertEquals("", joined(""))
        assertEquals("", joined("."))
        assertEquals("a", joined("a"))
        assertEquals("a/b", joined("a/b"))
        assertEquals("a/b", joined("a\\b"))
        assertEquals("a", joined("./a"))
        assertEquals("a/b", joined("a/./b"))
        assertEquals("a/b", joined("a//b"))
        assertEquals("a/b", joined("a/b/"))
        assertEquals("a", joined("a/."))
        assertEquals("Études/EFREI", joined("Études/EFREI"))
        assertEquals("a b/c", joined("a b/c"))
    }

    @Test
    fun safeJoinRefuseLesEchappees() {
        for (relative in listOf(
            "..", "../a", "a/../b", "a/..", "a\\..\\b",
            "/a", "\\a", "C:\\a", "C:a", "C:/a", "C:",
            "\\\\srv\\share\\a", "//srv/share/a",
        )) {
            invalidPath(relative)
        }
    }

    @Test
    fun safeJoinRefuseUnLecteurAuMilieuDuChemin() {
        // Rust Windows rend ici "C:b", hors de la racine : on refuse.
        invalidPath("a/C:/b")
    }

    private fun valid(name: String, expected: String, kind: String = "calendar") =
        assertEquals(expected, validateSingleName(name, kind))

    private fun invalid(name: String, message: String, kind: String = "calendar") {
        val error = assertThrows(IllegalArgumentException::class.java) { validateSingleName(name, kind) }
        assertEquals(message, error.message)
    }

    @Test
    fun validateSingleNameRogneEtAccepte() {
        valid("ok", "ok")
        valid(" ok ", "ok")
        valid("a b", "a b")
        valid("...", "...")
        valid("C:", "C:")
        valid("CON", "CON")
        valid("a.md", "a.md")
        valid("Études", "Études")
        valid("a\u0000b", "a\u0000b")
        valid("a\tb", "a\tb")
        valid(".hidden", ".hidden")
        valid("a.", "a.")
        valid("a\n", "a")
        // str::trim de Rust retire l'espace insécable et U+2003, pas U+FEFF.
        valid("\u00a0a\u00a0", "a")
        valid("\u2003b\u2003", "b")
        valid("\ufeffa", "\ufeffa")
    }

    @Test
    fun validateSingleNameRefuseLeVide() {
        invalid("", "The calendar name cannot be empty.")
        invalid("   ", "The calendar name cannot be empty.")
        invalid("", "The ICS link name cannot be empty.", kind = "ICS link")
    }

    @Test
    fun validateSingleNameRefuseLesChemins() {
        invalid(".", "Invalid calendar name: .")
        invalid("..", "Invalid calendar name: ..")
        invalid(" .. ", "Invalid calendar name: ..")
        invalid("a/b", "Invalid calendar name: a/b")
        invalid("a\\b", "Invalid calendar name: a\\b")
        invalid("/a", "Invalid calendar name: /a")
        invalid("a/", "Invalid calendar name: a/")
        invalid("./a", "Invalid calendar name: ./a")
        invalid("a/b", "Invalid event file name: a/b", kind = "event file")
    }

    @Test
    fun validateSingleNameRefuseUnLecteurSuiviDeTexte() {
        // Sous Windows, "C:a" fait deux composants (préfixe + nom).
        invalid("C:a", "Invalid calendar name: C:a")
        invalid("c:\\", "Invalid calendar name: c:\\")
        invalid("x:y", "Invalid calendar name: x:y")
    }
}
