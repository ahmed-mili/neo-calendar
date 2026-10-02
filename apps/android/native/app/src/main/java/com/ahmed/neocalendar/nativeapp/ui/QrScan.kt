package com.ahmed.neocalendar.nativeapp.ui

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** Le scanner de QR code de Google (services Google Play) : son écran, sa caméra et sa permission ; l'app ne garde que le texte lu. */
internal fun scanQrCode(context: Context, onScanned: (String) -> Unit) {
    val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    GmsBarcodeScanning.getClient(context, options).startScan()
        .addOnSuccessListener { barcode -> barcode.rawValue?.let(onScanned) }
        .addOnFailureListener { Notices.show("Le scanner demande les services Google Play, absents ou à mettre à jour sur ce téléphone.") }
}
