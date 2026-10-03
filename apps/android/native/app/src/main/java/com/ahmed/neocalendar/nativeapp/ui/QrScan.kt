package com.ahmed.neocalendar.nativeapp.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

private const val TAG = "QrScan"
private const val XIAOMI_SCAN_ACTION = "miui.intent.action.scanbarcode"

/**
 * Lance un scanner de QR code et rend le texte lu à `onResult` (null : scan annulé ou impossible, l'appelant relâche alors
 * ce qu'il avait pris). Le scanner natif du téléphone quand il en existe un (Xiaomi / HyperOS), sinon celui de Google.
 * À appeler depuis la composition : le lanceur du scanner natif y est enregistré.
 */
@Composable
internal fun rememberQrScanner(): (onResult: (String?) -> Unit) -> Unit {
    val context = LocalContext.current
    val pending = remember { arrayOfNulls<(String?) -> Unit>(1) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pending[0] ?: return@rememberLauncherForActivityResult
        pending[0] = null
        val text = if (result.resultCode == Activity.RESULT_OK) result.data?.extras?.getString("result")?.takeIf { it.isNotBlank() } else null
        when {
            text != null -> callback(text)
            result.resultCode == Activity.RESULT_OK -> {
                // Retour accepté mais sans texte : le format de ce scanner n'est pas celui attendu. On journalise les clés (jamais les valeurs).
                Log.w(TAG, "Scanner natif : retour OK sans texte, extras = ${result.data?.extras?.keySet()}")
                scanWithGoogle(context, callback)
            }
            else -> callback(null)
        }
    }
    return { onResult ->
        val intent = Intent(XIAOMI_SCAN_ACTION).putExtra("isBackToThirdApp", true)
        if (intent.resolveActivity(context.packageManager) != null) {
            pending[0] = onResult
            try {
                launcher.launch(intent)
            } catch (e: Exception) {
                Log.w(TAG, "Scanner natif impossible à lancer", e)
                pending[0] = null
                scanWithGoogle(context, onResult)
            }
        } else {
            scanWithGoogle(context, onResult)
        }
    }
}

/** Le scanner de QR code de Google (services Google Play) : son écran, sa caméra et sa permission ; l'app ne garde que le texte lu. */
private fun scanWithGoogle(context: Context, onResult: (String?) -> Unit) {
    val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    GmsBarcodeScanning.getClient(context, options).startScan()
        .addOnSuccessListener { barcode -> onResult(barcode.rawValue) }
        .addOnCanceledListener { onResult(null) }
        .addOnFailureListener {
            Notices.show("Le scanner demande les services Google Play, absents ou à mettre à jour sur ce téléphone.")
            onResult(null)
        }
}
