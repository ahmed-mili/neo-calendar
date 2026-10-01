package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import com.ahmed.neocalendar.nativeapp.ui.Icon
import com.ahmed.neocalendar.nativeapp.ui.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.location.LocationDestination
import com.ahmed.neocalendar.core.location.locationDestinationFor
import com.ahmed.neocalendar.nativeapp.ExternalOpen
import com.ahmed.neocalendar.nativeapp.InstalledMap
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Le lieu : un texte, et « Ouvrir dans les cartes » quand il mène quelque part.
 * Le menu ne propose que les applications installées (et un lien s'ouvre tel quel) ;
 * si le réglage `mapsApp` en nomme une qui est là, elle s'ouvre sans demander.
 */
@Composable
fun LocationField(
    location: String,
    geo: String?,
    editable: Boolean,
    mapsApp: String,
    mapsTravelMode: String,
    onChange: (String) -> Unit,
) {
    val context = LocalContext.current
    var menuOpen by remember { mutableStateOf(false) }
    var installed by remember { mutableStateOf<List<InstalledMap>?>(null) }
    // Les cartes installées se demandent une fois, hors du fil principal.
    LaunchedEffect(Unit) { installed = withContext(Dispatchers.Default) { ExternalOpen.installedMaps(context) } }

    val destination = locationDestinationFor(location, geo, null)
    val choices = destination?.let { ExternalOpen.mapChoices(it, installed.orEmpty()) }.orEmpty()

    if (!editable && location.isEmpty()) return
    val open: () -> Unit = {
        val direct = choices.firstOrNull { it.id != null && it.id == mapsApp }
        when {
            destination == null -> Unit
            destination is LocationDestination.Link -> ExternalOpen.openMap(context, destination, null, mapsTravelMode)
            direct != null -> ExternalOpen.openMap(context, destination, direct, mapsTravelMode)
            choices.isEmpty() -> ExternalOpen.openMap(context, destination, null, mapsTravelMode)
            else -> menuOpen = true
        }
    }
    Box {
        FieldRow(NeoIcons.MapPin, minHeight = 52, iconOffset = (-3.5).dp) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (editable) {
                    if (location.isEmpty()) Text("Lieu", color = Neo.TextFaint, fontSize = 16.sp, modifier = Modifier.align(Alignment.TopStart).padding(start = 7.dp, top = 13.dp))
                    BasicTextField(
                        location,
                        onChange,
                        textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp),
                        cursorBrush = SolidColor(Neo.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        modifier = Modifier.fillMaxWidth().padding(start = 7.dp, top = 13.dp, bottom = 3.dp),
                    )
                } else {
                    // Verrouillé, le texte EST le lien : rien d'autre à faire de cette rangée que de la suivre.
                    // `.nc-panel-location-link` : texte `--nc-text-primary`, souligné à 2 px de la ligne de base en `--nc-text-faint`.
                    var layout by remember { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
                    Text(
                        location, color = Neo.Text, fontSize = 16.sp,
                        onTextLayout = { layout = it },
                        modifier = (if (destination != null) Modifier.clickable { open() } else Modifier)
                            .padding(start = 7.dp, top = 8.dp, bottom = 8.dp)
                            .drawBehind {
                                layout?.let { text ->
                                    for (line in 0 until text.lineCount) {
                                        drawRect(
                                            Neo.TextFaint,
                                            topLeft = androidx.compose.ui.geometry.Offset(text.getLineLeft(line), text.getLineBaseline(line) + 2.dp.toPx()),
                                            size = androidx.compose.ui.geometry.Size(text.getLineRight(line) - text.getLineLeft(line), 1.dp.toPx()),
                                        )
                                    }
                                }
                            },
                    )
                }
            }
        }
        Popover(menuOpen, { menuOpen = false }, SolidSurface, width = 200.dp) {
            for (choice in choices) {
                PopoverEntry(choice.label, 44.dp, radius = 5.dp) {
                    menuOpen = false
                    if (destination != null) ExternalOpen.openMap(context, destination, choice, mapsTravelMode)
                }
            }
        }
    }
}
