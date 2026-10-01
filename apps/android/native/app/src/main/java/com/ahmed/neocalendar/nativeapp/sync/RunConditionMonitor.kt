package com.ahmed.neocalendar.nativeapp.sync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.ahmed.neocalendar.core.sync.DeviceSnapshot
import com.ahmed.neocalendar.core.sync.NetworkKind

/**
 * Ce que le téléphone dit du réseau, de l'alimentation et de l'économiseur de batterie, et le moment où cela change.
 * Les mêmes sources que `RunConditionMonitor.java` de Syncthing-Fork (réseau actif et son caractère limité, branché ou non,
 * économiseur), par les rappels modernes : `registerDefaultNetworkCallback` et les diffusions d'alimentation.
 */
class RunConditionMonitor(context: Context, private val onChange: () -> Unit) {
    private val app = context.applicationContext
    private val connectivity = app.getSystemService(ConnectivityManager::class.java)
    private val power = app.getSystemService(PowerManager::class.java)
    private var started = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = onChange()
        override fun onLost(network: Network) = onChange()
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = onChange()
    }

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = onChange()
    }

    @Synchronized
    fun start() {
        if (started) return
        started = true
        connectivity.registerDefaultNetworkCallback(networkCallback)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        }
        ContextCompat.registerReceiver(app, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    @Synchronized
    fun stop() {
        if (!started) return
        started = false
        runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
        runCatching { app.unregisterReceiver(receiver) }
    }

    fun snapshot(): DeviceSnapshot {
        val caps = connectivity.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
        val kind = when {
            caps == null -> NetworkKind.None
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetworkKind.Wifi
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetworkKind.Mobile
            else -> NetworkKind.Other
        }
        val metered = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false
        val battery = app.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val charging = (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        return DeviceSnapshot(kind, metered, charging, power.isPowerSaveMode)
    }
}
