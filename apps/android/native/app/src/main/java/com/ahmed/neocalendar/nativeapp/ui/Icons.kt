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
    val Flag: ImageVector by lazy { lucide("flag", "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7") }
    val Clock: ImageVector by lazy { lucide("clock", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 6v6l4 2") }
    val Calendar: ImageVector by lazy { lucide("calendar", "M8 2v3", "M16 2v3", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z", "M3 9h18") }
    val Repeat: ImageVector by lazy { lucide("repeat", "m17 2 4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "m7 22-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3") }
    val Bell: ImageVector by lazy { lucide("bell", "M10.268 21a2 2 0 0 0 3.464 0", "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326") }
    val MapPin: ImageVector by lazy { lucide("map-pin", "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0") }
    val TextAlignStart: ImageVector by lazy { lucide("text-align-start", "M21 5H3", "M15 12H3", "M17 19H3") }
    val Trash2: ImageVector by lazy { lucide("trash-2", "M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2") }
    val Copy: ImageVector by lazy { lucide("copy", "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2") }
    val EllipsisVertical: ImageVector by lazy { lucide("ellipsis-vertical", "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M11 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0") }
    val Paperclip: ImageVector by lazy { lucide("paperclip", "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551") }
    val Link: ImageVector by lazy { lucide("link", "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71") }
    val ExternalLink: ImageVector by lazy { lucide("external-link", "M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6") }
    val Square: ImageVector by lazy { lucide("square", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z") }
    val SquareCheckBig: ImageVector by lazy { lucide("square-check-big", "M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344", "m9 11 3 3L22 4") }
    val CircleCheck: ImageVector by lazy { lucide("circle-check", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "m9 12 2 2 4-4") }
    val Folder: ImageVector by lazy { lucide("folder", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z") }
    val Gift: ImageVector by lazy { lucide("gift", "M12 7v14", "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5", "M4 7h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1z") }
    val ListChecks: ImageVector by lazy { lucide("list-checks", "M13 5h8", "M13 12h8", "M13 19h8", "m3 17 2 2 4-4", "m3 7 2 2 4-4") }
    val Navigation: ImageVector by lazy { lucide("navigation", "M3 11L22 2L13 21L11 13L3 11z") }
    val RotateCcw: ImageVector by lazy { lucide("rotate-ccw", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5") }
    val Settings: ImageVector by lazy {
        lucide(
            "settings",
            "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        )
    }
    val Pencil: ImageVector by lazy {
        lucide(
            "pencil",
            "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            "m15 5 4 4",
        )
    }
    val FolderOpen: ImageVector by lazy {
        lucide(
            "folder-open",
            "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
        )
    }
    val Download: ImageVector by lazy { lucide("download", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3") }
    val RefreshCw: ImageVector by lazy { lucide("refresh-cw", "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5") }
    val AlertCircle: ImageVector by lazy { lucide("circle-alert", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 8v4", "M12 16h.01") }
    val Circle: ImageVector by lazy { lucide("circle", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0") }

    // --- Les tracés de src/ui/calendar/Icons.tsx (ceux du tiroir et du panneau de l'ancienne), lot 3. ---
    val DrawerGear: ImageVector by lazy {
        lucide(
            "settings",
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        )
    }
    val DrawerEye: ImageVector by lazy { lucide("eye", "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z", "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0") }
    val DrawerEyeOff: ImageVector by lazy {
        lucide(
            "eye-off",
            "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",
            "M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",
            "M9.88 9.88a3 3 0 1 0 4.24 4.24",
            "M2 2L22 22",
        )
    }
    /** Trois points pleins (rayon 1,6), comme `MoreHorizontalIcon`. */
    val Ellipsis: ImageVector by lazy {
        ImageVector.Builder("ellipsis", 24.dp, 24.dp, 24f, 24f).apply {
            for (cx in floatArrayOf(5f, 12f, 19f)) {
                addPath(
                    pathData = addPathNodes("M${cx - 1.6f} 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0"),
                    fill = SolidColor(Color.Black),
                )
            }
        }.build()
    }
    val ListX: ImageVector by lazy {
        lucide("list-x", "M3 6h.01", "M3 12h.01", "M3 18h.01", "M8 6h13", "M8 12h8", "M8 18h5", "m17 16 4 4", "m21 16-4 4")
    }
    val FileText: ImageVector by lazy {
        lucide("file-text", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8")
    }
    val SlidersHorizontal: ImageVector by lazy {
        lucide(
            "sliders-horizontal",
            "M21 4H14", "M10 4H3", "M21 12H12", "M8 12H3", "M21 20H16", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4",
        )
    }
    val ChartColumn: ImageVector by lazy { lucide("chart-column", "M12 20V10", "M18 20V4", "M6 20v-4") }
    val CalendarGlyph: ImageVector by lazy {
        lucide("calendar", "M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z", "M3 10h18")
    }
    val TriangleAlert: ImageVector by lazy {
        lucide("triangle-alert", "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01")
    }
    val Sun: ImageVector by lazy {
        lucide(
            "sun", "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41",
            "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41",
        )
    }
    val ArrowRight: ImageVector by lazy { lucide("arrow-right", "M5 12h14", "m12 5 7 7-7 7") }
    val CopyPlus: ImageVector by lazy {
        lucide(
            "copy-plus", "M15 12v6", "M12 15h6", "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z",
            "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
        )
    }

    val CalendarRange: ImageVector by lazy {
        lucide(
            "calendar-range", "M16 2v4", "M3 10h18", "M8 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "M17 14h-6", "M13 18H7", "M7 14h.01", "M17 18h-.01",
        )
    }
    val Timer: ImageVector by lazy { lucide("timer", "M10 2h4", "M12 14l3-3", "M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16z") }
    val CalendarClock: ImageVector by lazy {
        lucide(
            "calendar-clock", "M16 14v2.2l1.6 1", "M16 2v4", "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5",
            "M3 10h5", "M8 2v4", "M16 10a6 6 0 1 0 0 12 6 6 0 0 0 0-12z",
        )
    }
    val Columns2: ImageVector by lazy { lucide("columns-2", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M12 3v18") }
    val Route: ImageVector by lazy {
        lucide(
            "route", "M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15",
            "M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
        )
    }
    val Map: ImageVector by lazy {
        lucide(
            "map",
            "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
            "M15 5.764v15", "M9 3.236v15",
        )
    }
    val Monitor: ImageVector by lazy { lucide("monitor", "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 21h8", "M12 17v4") }
    val Smartphone: ImageVector by lazy { lucide("smartphone", "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M12 18h.01") }
    val Palette: ImageVector by lazy {
        lucide(
            "palette", "M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
            "M13.5 6.5h.01", "M17.5 10.5h.01", "M6.5 12.5h.01", "M8.5 7.5h.01",
        )
    }
    val Moon: ImageVector by lazy {
        lucide("moon", "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401")
    }
    val Languages: ImageVector by lazy { lucide("languages", "m5 8 6 6", "m4 14 6-6 2-3", "M2 5h12", "M7 2h1", "m22 22-5-10-5 10", "M14 18h6") }
    val CalendarDays: ImageVector by lazy {
        lucide(
            "calendar-days", "M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18",
            "M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01", "M16 18h.01",
        )
    }
    val Globe: ImageVector by lazy {
        lucide("globe", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20")
    }
    val Library: ImageVector by lazy { lucide("library", "m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16") }
    val ArrowLeft: ImageVector by lazy { lucide("arrow-left", "m12 19-7-7 7-7", "M19 12H5") }
    val Columns3: ImageVector by lazy { lucide("columns-3", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 3v18", "M15 3v18") }
    val List: ImageVector by lazy { lucide("list", "M3 5h.01", "M3 12h.01", "M3 19h.01", "M8 5h13", "M8 12h13", "M8 19h13") }
    val Upload: ImageVector by lazy { lucide("upload", "M12 3v12", "m17 8-5-5-5 5", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4") }
    val SunMedium: ImageVector by lazy { lucide("sun-medium", "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0z", "M12 3v1", "M12 20v1", "M3 12h1", "M20 12h1", "m18.364 5.636-.707.707", "m6.343 17.657-.707.707", "m5.636 5.636.707.707", "m17.657 17.657.707.707") }
    val Droplets: ImageVector by lazy { lucide("droplets", "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z", "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97") }
    val Layers: ImageVector by lazy { lucide("layers", "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z", "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12", "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17") }
    val Contrast: ImageVector by lazy { lucide("contrast", "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z", "M12 18a6 6 0 0 0 0-12v12z") }
    val PanelLeft: ImageVector by lazy { lucide("panel-left", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z", "M9 3v18") }
    val Type: ImageVector by lazy { lucide("type", "M12 4v16", "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", "M9 20h6") }
    val CodeXml: ImageVector by lazy { lucide("code-xml", "m18 16 4-4-4-4", "m6 8-4 4 4 4", "m14.5 4-5 16") }
    val Save: ImageVector by lazy { lucide("save", "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", "M7 3v4a1 1 0 0 0 1 1h7") }
    val LoaderCircle: ImageVector by lazy { lucide("loader-circle", "M21 12a9 9 0 1 1-6.219-8.56") }
    val ClipboardPaste: ImageVector by lazy { lucide("clipboard-paste", "M11 14h10", "M16 4h2a2 2 0 0 1 2 2v1.344", "m17 18 4-4-4-4", "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113", "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1z") }
}
