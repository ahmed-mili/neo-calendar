package com.ahmed.neocalendar.nativeapp.sync

import com.ahmed.neocalendar.core.sync.HttpResult
import com.ahmed.neocalendar.core.sync.HttpTransport
import java.net.InetAddress
import java.net.Proxy
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** L'interface REST du moteur par OkHttp sur socket Unix ; la clé d'API (`X-API-Key`) est exigée par Syncthing hors `/rest/noauth/`. */
class OkHttpTransport(socketPath: String, private val apiKey: String) : HttpTransport {
    private val client = OkHttpClient.Builder()
        .socketFactory(UnixSocketFactory(socketPath))
        // Jamais de proxy système : le trafic passe par le socket Unix, rien d'autre.
        .proxy(Proxy.NO_PROXY)
        .dns(object : Dns {
            override fun lookup(hostname: String): List<InetAddress> = listOf(InetAddress.getByAddress("localhost", byteArrayOf(127, 0, 0, 1)))
        })
        .connectTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        // Aucune connexion gardée : le moteur ferme les connexions inactives, et le contrôle de santé d'OkHttp ne peut pas
        // le voir sur un socket Unix (isInputShutdown lève). Réutilisée, elle donnait « Broken pipe » à la première requête
        // après un temps mort, et un échec silencieux de l'attente d'envoi avant l'arrêt du moteur. Un socket local est quasi gratuit.
        .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
        .build()

    override fun request(method: String, path: String, body: String?, readTimeoutMs: Int): HttpResult {
        val needsBody = method == "POST" || method == "PUT" || method == "PATCH"
        val requestBody = when {
            body != null -> body.toRequestBody(JSON)
            needsBody -> ByteArray(0).toRequestBody(null)
            else -> null
        }
        val request = Request.Builder().url("http://localhost$path").header("X-API-Key", apiKey).method(method, requestBody).build()
        // Un délai de lecture par requête : `/rest/events` est une longue requête (30 s côté moteur).
        val call = client.newBuilder().readTimeout(readTimeoutMs.toLong(), TimeUnit.MILLISECONDS).build().newCall(request)
        call.execute().use { response -> return HttpResult(response.code, response.body?.string().orEmpty()) }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
