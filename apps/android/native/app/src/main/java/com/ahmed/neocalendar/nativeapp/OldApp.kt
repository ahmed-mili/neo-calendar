package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import com.ahmed.neocalendar.core.migration.OLD_APP_PACKAGE

/** L'ancienne app est-elle encore là ? Visibilité du paquet : `<queries>` du manifeste. */
fun isOldAppInstalled(context: Context): Boolean = try {
    context.packageManager.getPackageInfo(OLD_APP_PACKAGE, 0)
    true
} catch (_: PackageManager.NameNotFoundException) {
    false
}

/** Demande à Android de désinstaller l'ancienne app (confirmation système ; `REQUEST_DELETE_PACKAGES`). */
fun uninstallOldApp(context: Context) {
    context.startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:$OLD_APP_PACKAGE")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
