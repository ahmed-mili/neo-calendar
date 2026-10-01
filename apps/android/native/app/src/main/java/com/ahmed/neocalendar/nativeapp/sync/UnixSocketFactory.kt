package com.ahmed.neocalendar.nativeapp.sync

import android.net.LocalSocket
import android.net.LocalSocketAddress
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketAddress
import java.net.SocketException
import javax.net.SocketFactory

/**
 * Pour qu'OkHttp parle à l'interface REST de Syncthing par socket Unix (`filesDir/syncthing/gui.sock`,
 * inaccessible aux autres apps : le dossier parent est en 700). Adresse HTTP `http://localhost/...`,
 * résolveur qui rend 127.0.0.1, et cette fabrique qui ignore l'hôte et le port.
 */
class UnixSocketFactory(private val path: String) : SocketFactory() {
    override fun createSocket(): Socket = UnixSocket(path)
    override fun createSocket(host: String?, port: Int): Socket = UnixSocket(path)
    override fun createSocket(host: String?, port: Int, localHost: InetAddress?, localPort: Int): Socket = UnixSocket(path)
    override fun createSocket(host: InetAddress?, port: Int): Socket = UnixSocket(path)
    override fun createSocket(address: InetAddress?, port: Int, localAddress: InetAddress?, localPort: Int): Socket = UnixSocket(path)
}

/**
 * Un `java.net.Socket` posé sur un `LocalSocket`. Les trois pièges relevés à l'essai (2026-10-01) :
 * OkHttp règle `setSoTimeout` AVANT `connect` (LocalSocket lève « socket not created » : la valeur est mémorisée puis
 * appliquée après la connexion) ; `isInputShutdown` / `isOutputShutdown` lèvent sur LocalSocket (drapeaux maison) ;
 * `setTcpNoDelay` et `setKeepAlive` n'ont pas de sens (ignorés), `getRemoteSocketAddress` doit répondre.
 */
private class UnixSocket(private val path: String) : Socket() {
    private var local: LocalSocket? = null
    private var timeoutMs = 0
    private var connected = false
    private var closed = false
    private var inputShutdown = false
    private var outputShutdown = false

    override fun connect(endpoint: SocketAddress?, timeout: Int) {
        val socket = LocalSocket()
        try {
            socket.connect(LocalSocketAddress(path, LocalSocketAddress.Namespace.FILESYSTEM))
            socket.soTimeout = timeoutMs
        } catch (e: IOException) {
            socket.close()
            throw e
        }
        local = socket
        connected = true
    }

    override fun connect(endpoint: SocketAddress?) = connect(endpoint, 0)

    override fun getInputStream(): InputStream = local?.inputStream ?: throw SocketException("Socket is not connected")

    override fun getOutputStream(): OutputStream = local?.outputStream ?: throw SocketException("Socket is not connected")

    override fun setSoTimeout(timeout: Int) {
        timeoutMs = timeout
        local?.soTimeout = timeout
    }

    override fun getSoTimeout(): Int = timeoutMs

    override fun isConnected(): Boolean = connected
    override fun isBound(): Boolean = connected
    override fun isClosed(): Boolean = closed
    override fun isInputShutdown(): Boolean = inputShutdown
    override fun isOutputShutdown(): Boolean = outputShutdown

    override fun shutdownInput() {
        inputShutdown = true
        local?.shutdownInput()
    }

    override fun shutdownOutput() {
        outputShutdown = true
        local?.shutdownOutput()
    }

    override fun close() {
        closed = true
        local?.close()
    }

    override fun setTcpNoDelay(on: Boolean) = Unit
    override fun getTcpNoDelay(): Boolean = false
    override fun setKeepAlive(on: Boolean) = Unit
    override fun getKeepAlive(): Boolean = false
    override fun getInetAddress(): InetAddress = InetAddress.getLoopbackAddress()
    override fun getPort(): Int = 80
    override fun getRemoteSocketAddress(): SocketAddress = InetSocketAddress(InetAddress.getLoopbackAddress(), 80)
}
