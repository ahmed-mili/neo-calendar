package com.ahmed.neocalendar.core.i18n

/**
 * Le dictionnaire français vers anglais de l'application native, tiré de `src/ui/i18n.ts` (la clé anglaise de l'ancienne EST
 * le texte anglais) plus les textes propres au natif. Format : une ligne `français<TAB>anglais`, `#` pour un commentaire.
 * Une entrée contenant `{}` ou `{n}` est un modèle : « {n} événements » traduit « 3 événements » en « 3 events ».
 * L'orthographe « évènement » du natif et « événement » de l'ancienne se valent.
 */
class FrenchToEnglish(tsv: String) {
    private val exact = HashMap<String, String>()
    private val patterns = ArrayList<Pair<Regex, String>>()

    init {
        for (line in tsv.lineSequence()) {
            if (line.startsWith("#")) continue
            val tab = line.indexOf('\t')
            if (tab <= 0) continue
            val fr = norm(line.substring(0, tab))
            val en = line.substring(tab + 1)
            if (PLACEHOLDER.containsMatchIn(fr)) {
                val pattern = StringBuilder("^")
                var last = 0
                for (m in PLACEHOLDER.findAll(fr)) {
                    pattern.append(Regex.escape(fr.substring(last, m.range.first))).append("(.+?)")
                    last = m.range.last + 1
                }
                pattern.append(Regex.escape(fr.substring(last))).append("$")
                patterns += Regex(pattern.toString()) to en
            } else exact.putIfAbsent(fr, en)
        }
    }

    /** Le texte en anglais, ou tel quel s'il n'est pas dans le dictionnaire. */
    fun translate(text: String): String {
        if (text.isEmpty()) return text
        val key = norm(text)
        exact[key]?.let { return it }
        for ((regex, en) in patterns) {
            val match = regex.matchEntire(key) ?: continue
            var index = 1
            return PLACEHOLDER.replace(en) { match.groupValues.getOrNull(index++)?.let { g -> translate(g) } ?: "" }
        }
        return text
    }

    private companion object {
        val PLACEHOLDER = Regex("\\{[a-z]*\\}")

        fun norm(text: String) = text.replace("événement", "évènement").replace("Événement", "Évènement")
    }
}
