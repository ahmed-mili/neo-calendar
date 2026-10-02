package com.ahmed.neocalendar.nativeapp.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.nativeapp.VisibleMigration
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction

private const val SENTENCE =
    "Neo Calendar garde vos notes dans le dossier « Neo Calendar » du téléphone, visible dans vos fichiers : autorisez l'accès à tous les fichiers pour le lire."

/**
 * Ouvre le réglage système « Accès à tous les fichiers » de l'app (Android 11 et plus), ou demande l'autorisation d'écrire
 * (avant). `onBack` est appelé au retour, que l'autorisation soit donnée ou non : l'appelant relit alors l'état.
 */
@Composable
private fun rememberAllFilesRequest(onBack: () -> Unit): () -> Unit {
    val context = LocalContext.current
    val settings = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { onBack() }
    val legacy = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { onBack() }
    return {
        if (Build.VERSION.SDK_INT >= 30) {
            val own = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + context.packageName))
            try {
                settings.launch(own)
            } catch (e: ActivityNotFoundException) {
                settings.launch(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            legacy.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }
}

/** Nouvelle installation (ou accès retiré) : une phrase, un bouton. Au retour du réglage, l'app continue. */
@Composable
fun AllFilesAccessScreen(onBack: () -> Unit) {
    val request = rememberAllFilesRequest(onBack)
    Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(16.dp), contentAlignment = Alignment.Center) {
        val shape = RoundedCornerShape(Neo.CardRadius)
        val shadow = Neo.Shadow
        Column(
            Modifier
                .widthIn(max = 440.dp)
                .fillMaxWidth()
                .cssShadow(shadow.offsetY, shadow.blur, shadow.color, Neo.CardRadius)
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.Border, shape)
                .padding(24.dp),
        ) {
            Icon(NeoIcons.FolderOpen, null, tint = Neo.Accent, modifier = Modifier.size(30.dp))
            Text(
                SENTENCE,
                color = Neo.Text,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                modifier = Modifier.padding(top = 16.dp, bottom = 22.dp),
            )
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Neo.Accent)
                    .clickable(onClick = request)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Autoriser", color = Neo.OnAccent, fontSize = 15.sp, fontWeight = FontWeight(650))
            }
        }
    }
}

/**
 * Installation existante : la grille reste utilisable (rien n'est perdu, les notes restent où elles sont) ; le dialogue demande
 * l'autorisation pour copier les notes dans le dossier visible. « Plus tard » le repousse au prochain lancement.
 */
@Composable
fun AllFilesAccessDialog() {
    val migration by VisibleMigration.state.collectAsState()
    if (migration !is VisibleMigration.State.NeedsAccess) return
    // Au retour du réglage, NativeActivity.onResume relance la copie : rien à faire ici.
    val request = rememberAllFilesRequest {}
    NeoDialog(
        "Dossier Neo Calendar",
        onDismiss = { VisibleMigration.postpone() },
        confirm = { TextAction("Autoriser", onClick = request) },
        dismissLabel = "Plus tard",
    ) {
        SText(SENTENCE, color = Neo.TextSecondary, size = 13f, lineHeight = 18f)
        SText("Vos notes actuelles sont copiées puis vérifiées, les originaux ne sont pas touchés.", color = Neo.TextSecondary, size = 13f, lineHeight = 18f)
    }
}
