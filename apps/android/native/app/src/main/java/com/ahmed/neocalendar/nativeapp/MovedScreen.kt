package com.ahmed.neocalendar.nativeapp

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.core.migration.NEW_APP_PACKAGE
import com.ahmed.neocalendar.nativeapp.ui.NeoTheme

/** Ce que l'ancienne app montre à la place de tout le reste quand la nouvelle est installée. */
@Composable
fun MovedScreen() {
    val context = LocalContext.current
    NeoTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Neo Calendar a déménagé", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
                Text(
                    "Vos rappels et votre widget sont maintenant gérés par la nouvelle app. Cette ancienne version peut être désinstallée.",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
                Button(onClick = { openNewApp(context) }, modifier = Modifier.fillMaxWidth()) { Text("Ouvrir la nouvelle app") }
                OutlinedButton(onClick = { uninstallSelf(context) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Désinstaller cette ancienne version")
                }
            }
        }
    }
}

private fun openNewApp(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(NEW_APP_PACKAGE) ?: return
    context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun uninstallSelf(context: Context) {
    context.startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
