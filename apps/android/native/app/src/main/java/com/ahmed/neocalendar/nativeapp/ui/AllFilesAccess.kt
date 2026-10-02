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
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.asImageBitmap
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
                settings.launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)))
            }
        } else {
            legacy.launch(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }
}

/** Le fond de l'installeur Windows : dégradé crust vers base, halo d'accent derrière le logo. */
private val Crust = androidx.compose.ui.graphics.Color(0xFF11111B)
private val Base = androidx.compose.ui.graphics.Color(0xFF1E1E2E)

/** Nouvelle installation (ou accès retiré) : l'accueil de l'installeur, deux étapes, un bouton. Au retour du réglage, l'app continue. */
@Composable
fun AllFilesAccessScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val request = rememberAllFilesRequest(onBack)
    val granted = com.ahmed.neocalendar.nativeapp.WorkspaceLocation.hasAllFilesAccess(context)
    val icon = remember {
        runCatching {
            val drawable = context.packageManager.getApplicationIcon(context.packageName)
            val bitmap = android.graphics.Bitmap.createBitmap(186, 186, android.graphics.Bitmap.Config.ARGB_8888)
            drawable.setBounds(0, 0, 186, 186)
            drawable.draw(android.graphics.Canvas(bitmap))
            bitmap.asImageBitmap()
        }.getOrNull()
    }
    Box(
        Modifier.fillMaxSize()
            .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Crust, Base)))
            .background(androidx.compose.ui.graphics.Brush.radialGradient(listOf(Neo.Accent.copy(alpha = 0.22f), androidx.compose.ui.graphics.Color.Transparent), radius = 700f))
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            if (icon != null) androidx.compose.foundation.Image(icon, null, Modifier.size(84.dp))
            Text("Neo Calendar", color = Neo.Text, fontSize = 28.sp, fontWeight = FontWeight(690), modifier = Modifier.padding(top = 18.dp))
            Text("Vos notes restent sur ce téléphone, dans un dossier visible.", color = Neo.TextSecondary, fontSize = 15.sp, lineHeight = 22.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 8.dp, bottom = 26.dp))
            Step(1, "Ouvrir le réglage de l'application", done = false)
            Step(2, "Activer l'accès à tous les fichiers", done = granted)
            Row(
                Modifier
                    .padding(top = 28.dp)
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Neo.Accent)
                    .clickable(onClick = request)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Autoriser", color = Neo.OnAccent, fontSize = 16.sp, fontWeight = FontWeight(650))
            }
        }
    }
}

@Composable
private fun Step(number: Int, label: String, done: Boolean) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier.size(28.dp).clip(androidx.compose.foundation.shape.CircleShape).background(if (done) Neo.Accent else Neo.Accent.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            if (done) Icon(NeoIcons.Check, null, tint = Neo.OnAccent, modifier = Modifier.size(16.dp))
            else Text(number.toString(), color = Neo.Accent, fontSize = 14.sp, fontWeight = FontWeight(650))
        }
        Text(label, color = Neo.Text, fontSize = 15.sp)
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
