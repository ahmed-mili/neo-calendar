package com.ahmed.neocalendar.core.sync

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/** Le transport du test d'intégration : HTTP en TCP sur 127.0.0.1 (l'app, elle, parle en socket Unix). */
class LoopbackTransport(private val port: Int, private val apiKey: String) : HttpTransport {
    private val client = HttpClient.newHttpClient()

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofString(body)
        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path"))
            .timeout(Duration.ofMillis(readTimeoutMs.toLong()))
            .header("X-API-Key", apiKey)
            .header("Content-Type", "application/json")
            .method(method, publisher)
            .build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        return HttpResult(response.statusCode(), response.body())
    }
}
