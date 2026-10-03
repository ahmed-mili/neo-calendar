package com.ahmed.neocalendar.nativeapp

import android.app.Activity
import android.content.pm.ActivityInfo

/**
 * Un téléphone reste en portrait ; une tablette (petit côté d'au moins 600 dp, le seuil des mises en page tablette
 * d'Android) tourne librement, et son fond d'écran suit l'orientation (`WallpaperLayer`).
 */
fun Activity.lockPortraitOnPhones() {
    if (resources.configuration.smallestScreenWidthDp < 600) requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
}
