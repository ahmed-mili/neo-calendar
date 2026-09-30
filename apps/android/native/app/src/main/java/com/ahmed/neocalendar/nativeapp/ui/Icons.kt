package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/** Les icônes sont des tracés Lucide (24 x 24, trait de 2), comme partout dans l'interface. */
private fun lucide(name: String, vararg paths: String): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
        for (path in paths) {
            addPath(
                pathData = addPathNodes(path),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
    }.build()

object NeoIcons {
    val Menu: ImageVector by lazy { lucide("menu", "M4 6h16", "M4 12h16", "M4 18h16") }
    val ChevronDown: ImageVector by lazy { lucide("chevron-down", "M6 9l6 6 6-6") }
    val ChevronLeft: ImageVector by lazy { lucide("chevron-left", "M15 18l-6-6 6-6") }
    val ChevronRight: ImageVector by lazy { lucide("chevron-right", "M9 18l6-6-6-6") }
    val ChevronUp: ImageVector by lazy { lucide("chevron-up", "M18 15l-6-6-6 6") }
    val Search: ImageVector by lazy { lucide("search", "M21 21l-4.3-4.3", "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z") }
    val Plus: ImageVector by lazy { lucide("plus", "M5 12h14", "M12 5v14") }
    val Close: ImageVector by lazy { lucide("x", "M18 6L6 18", "M6 6l12 12") }
    val Eye: ImageVector by lazy {
        lucide(
            "eye",
            "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
            "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
        )
    }
    val EyeOff: ImageVector by lazy {
        lucide(
            "eye-off",
            "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
            "M14.084 14.158a3 3 0 0 1-4.242-4.242",
            "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
            "M2 2l20 20",
        )
    }
    val Check: ImageVector by lazy { lucide("check", "M20 6L9 17l-5-5") }
}
