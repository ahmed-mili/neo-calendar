package com.ahmed.neocalendar.core.sync

import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EngineConfigFileTest {
    private val generated = """<configuration version="51">
    <folder id="" label="" path="">
        <device id="AAA"></device>
    </folder>
    <device id="AAA" name="localhost" compression="metadata"></device>
    <gui enabled="true" tls="false"><address>127.0.0.1:8384</address></gui>
    <options>
        <listenAddress>default</listenAddress>
        <globalAnnounceEnabled>true</globalAnnounceEnabled>
        <localAnnounceEnabled>true</localAnnounceEnabled>
        <relaysEnabled>true</relaysEnabled>
        <urAccepted>0</urAccepted>
        <autoUpgradeIntervalH>12</autoUpgradeIntervalH>
        <crashReportingEnabled>true</crashReportingEnabled>
        <maxSendKbps>0</maxSendKbps>
    </options>
</configuration>
"""

    private fun doc(xml: String) = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xml.byteInputStream())

    private fun options(xml: String) = doc(xml).getElementsByTagName("options").item(0)

    private fun texts(xml: String, tag: String): List<String> {
        val nodes = options(xml).childNodes
        return (0 until nodes.length).map { nodes.item(it) }.filter { it.nodeName == tag }.map { it.textContent }
    }

    @Test fun `les options de securite et de cohabitation sont posees`() {
        val out = applyEngineOptions(generated, 39633)
        assertEquals(listOf("false"), texts(out, "localAnnounceEnabled"))
        assertEquals(listOf("-1"), texts(out, "urAccepted"))
        assertEquals(listOf("0"), texts(out, "autoUpgradeIntervalH"))
        assertEquals(listOf("false"), texts(out, "crashReportingEnabled"))
        assertEquals(listOf("true"), texts(out, "globalAnnounceEnabled"))
        assertEquals(listOf("true"), texts(out, "relaysEnabled"))
    }

    @Test fun `les adresses d'ecoute remplacent l'ancienne`() {
        val out = applyEngineOptions(generated, 39633)
        assertEquals(EngineConfig.listenAddresses(39633), texts(out, "listenAddress"))
    }

    @Test fun `le reste du fichier ne bouge pas`() {
        val out = applyEngineOptions(generated, 39633)
        assertEquals(listOf("0"), texts(out, "maxSendKbps"))
        assertEquals("localhost", doc(out).getElementsByTagName("device").item(1).attributes.getNamedItem("name").nodeValue)
        assertEquals("127.0.0.1:8384", doc(out).getElementsByTagName("address").item(0).textContent)
    }

    @Test fun `une option absente est ajoutee, sans doublon`() {
        val out = applyEngineOptions(generated.replace("<crashReportingEnabled>true</crashReportingEnabled>", ""), 40000)
        assertEquals(listOf("false"), texts(out, "crashReportingEnabled"))
        assertEquals(1, texts(applyEngineOptions(out, 40000), "crashReportingEnabled").size)
    }

    @Test fun `un fichier sans options ou une declaration de type est refuse`() {
        assertThrows(IllegalArgumentException::class.java) { applyEngineOptions("<configuration></configuration>", 1) }
        assertThrows(IllegalArgumentException::class.java) {
            applyEngineOptions("<!DOCTYPE x [<!ENTITY a SYSTEM \"file:///etc/passwd\">]><configuration><options/></configuration>", 1)
        }
    }

    @Test fun `le resultat est un XML relisible`() {
        assertTrue(doc(applyEngineOptions(generated, 1234)).documentElement.nodeName == "configuration")
    }
}
