package com.ahmed.neocalendar.core.sync

/** Un transport pour les tests : rend des réponses fixées d'avance et garde la liste des requêtes reçues. */
class FakeTransport : HttpTransport {
    class Call(val method: String, val path: String, val body: String?)

    val calls = mutableListOf<Call>()
    private val answers = LinkedHashMap<String, HttpResult>()

    /** `key` = « MÉTHODE chemin » exact, query comprise ; une clé qui finit par `*` répond à tout chemin qui commence par elle. */
    fun answer(key: String, body: String, code: Int = 200) { answers[key] = HttpResult(code, body) }

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        calls += Call(method, path, body)
        val key = "$method $path"
        return answers[key]
            ?: answers.entries.firstOrNull { it.key.endsWith("*") && key.startsWith(it.key.dropLast(1)) }?.value
            ?: HttpResult(404, "pas de réponse prévue pour $key")
    }

    fun sent(method: String, path: String): String? = calls.lastOrNull { it.method == method && it.path == path }?.body
}
