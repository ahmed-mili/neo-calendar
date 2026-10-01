package com.ahmed.neocalendar.core.sync

import java.io.StringWriter
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.OutputKeys
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.w3c.dom.Element

/**
 * Pose, dans le `config.xml` qu'un `syncthing generate` vient d'écrire, les options de sécurité et de cohabitation
 * d'[EngineConfig.options] AVANT le premier `serve` : le moteur n'écoute ainsi jamais sur le port par défaut ni sur la
 * découverte locale. Passe par un analyseur XML (jamais d'édition par texte). Ensuite l'API REST reste la source de vérité.
 *
 * @throws IllegalArgumentException le fichier n'est pas une configuration Syncthing (pas de `<options>`) ou porte une
 * déclaration de type (entités externes refusées).
 */
fun applyEngineOptions(configXml: String, port: Int): String {
    require(!configXml.contains("<!DOCTYPE", ignoreCase = true)) { "déclaration de type refusée" }
    val factory = DocumentBuilderFactory.newInstance().apply { isExpandEntityReferences = false }
    val doc = try {
        factory.newDocumentBuilder().parse(configXml.byteInputStream())
    } catch (e: Exception) {
        throw IllegalArgumentException("config.xml illisible : ${e.message}", e)
    }
    val options = doc.getElementsByTagName("options").item(0) as? Element
        ?: throw IllegalArgumentException("config.xml sans <options>")

    fun remove(tag: String) {
        val nodes = options.childNodes
        for (i in nodes.length - 1 downTo 0) if (nodes.item(i).nodeName == tag) options.removeChild(nodes.item(i))
    }
    fun set(tag: String, values: List<String>) {
        remove(tag)
        values.forEach { v -> options.appendChild(doc.createElement(tag).also { it.textContent = v }) }
    }

    for ((key, value) in EngineConfig.options(port)) {
        when {
            key == "listenAddresses" -> set("listenAddress", (value as JsonArray).map { (it as JsonPrimitive).content })
            else -> set(key, listOf((value as JsonPrimitive).content))
        }
    }

    val out = StringWriter()
    TransformerFactory.newInstance().newTransformer().apply {
        setOutputProperty(OutputKeys.INDENT, "no")
        setOutputProperty(OutputKeys.ENCODING, "UTF-8")
    }.transform(DOMSource(doc), StreamResult(out))
    return out.toString()
}
