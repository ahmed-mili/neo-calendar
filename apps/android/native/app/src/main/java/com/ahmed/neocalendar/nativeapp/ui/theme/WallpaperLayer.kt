package com.ahmed.neocalendar.nativeapp.ui.theme

import android.content.Context
import android.content.res.Configuration
import android.graphics.BitmapFactory
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.WallpaperStore
import kotlinx.coroutines.Dispatchers
import java.io.InputStream
import kotlinx.coroutines.withContext

/** Les photos vivent dans `.neo-calendar/wallpapers/` du dossier de notes (`WallpaperStore`), pas dans l'APK. */
private fun decode(context: Context, name: String, width: Int, height: Int): ImageBitmap? {
    val store = WallpaperStore(context)
    return decode({ store.open(name) }, width, height)
}

/** Décodée à la taille de l'écran ACTUEL (relue à chaque rotation : en paysage, la largeur est celle du grand côté). */
private fun decode(open: () -> InputStream?, width: Int, height: Int): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    val stream = open() ?: return null
    stream.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width && bounds.outHeight / (sample * 2) >= height) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return open()?.use { BitmapFactory.decodeStream(it, null, options) }?.asImageBitmap()
}

/**
 * `#nc-wallpaper-render-layer` : la photo (cover, centrée) sous un voile teinté de la surface (16 % en haut,
 * 24 % en bas), couche étendue de 36 dp de chaque côté puis agrandie de 4 %, assombrie (`brightness`) et floutée.
 * `reloadKey` relance la lecture (le dossier peut n'être choisi qu'après le premier dessin).
 * `onSettled` : la photo est décodée (ou il n'y en a pas à décoder : fond uni, aucun dossier, fichier absent) ; la photo
 * apparaît en fondu quand elle arrive après le premier dessin.
 * Sous Android 12 `Modifier.blur` ne fait rien : le fond reste net, la luminosité et le voile s'appliquent.
 * Tablette en paysage (un téléphone reste en portrait) : la version paysage du fond, téléchargée une fois en arrière-plan ;
 * en attendant, le portrait recadré, pour que le premier écran n'attende jamais le réseau.
 */
@Composable
fun WallpaperLayer(reloadKey: Any? = null, modifier: Modifier = Modifier, onSettled: () -> Unit = {}) {
    val context = LocalContext.current
    val tokens = NeoAppearance.tokens
    val effects = NeoAppearance.effects
    val id = NeoAppearance.wallpaperId
    val solid = id == "none"
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val bitmap by produceState<ImageBitmap?>(null, id, reloadKey, landscape) {
        val own = if (id == "theme-default") tokens.themeWallpaperFile else "$id.jpg"
        val metrics = context.resources.displayMetrics
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        value = if (solid) null else withContext(Dispatchers.IO) {
            try {
                val wide = if (landscape) WallpaperDownloads.landscapeLocal(context, own) else null
                wide?.let { file -> decode({ file.inputStream() }, width, height) }
                    ?: decode(context, own, width, height)
                    ?: decode(context, tokens.themeWallpaperFile, width, height)
            } catch (e: Exception) {
                null
            }
        }
        onSettled()
        // Première rotation en paysage avec ce fond : la version paysage arrive après coup et remplace le portrait recadré.
        if (!solid && landscape && WallpaperDownloads.landscapeLocal(context, own) == null) {
            val fetched = withContext(Dispatchers.IO) { WallpaperDownloads.landscape(context, own) }
            if (fetched != null) withContext(Dispatchers.IO) { decode({ fetched.inputStream() }, width, height) }?.let { value = it }
        }
    }
    val photoAlpha by animateFloatAsState(if (bitmap != null) 1f else 0f, tween(300), label = "photo")
    BoxWithConstraints(modifier.fillMaxSize().clipToBounds().background(tokens.background)) {
        val layer = Modifier
            .align(Alignment.Center)
            .requiredSize(maxWidth + 72.dp, maxHeight + 72.dp)
            .graphicsLayer { scaleX = 1.04f; scaleY = 1.04f }
            .let { if (effects.blur > 0f) it.blur(effects.blur.dp, BlurredEdgeTreatment.Unbounded) else it }
        Box(layer) {
            Box(Modifier.fillMaxSize().background(tokens.surface))
            if (!solid) {
                bitmap?.let { Image(it, null, Modifier.fillMaxSize().graphicsLayer { alpha = photoAlpha }, contentScale = ContentScale.Crop) }
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            listOf(
                                tokens.surface.copy(alpha = tokens.wallpaperVeilTop),
                                tokens.surface.copy(alpha = tokens.wallpaperVeilBottom),
                            ),
                        ),
                    ),
                )
            }
            // brightness(b) : chaque canal x b, soit du noir posé à 1 - b.
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 1f - effects.brightness)))
        }
    }
}
