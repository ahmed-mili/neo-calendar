package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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

    Column {
        FieldRow(NeoIcons.MapPin, minHeight = 52) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (location.isEmpty()) Text("Lieu", color = Neo.TextFaint, fontSize = 15.sp)
                BasicTextField(
                    location,
                    onChange,
                    enabled = editable,
                    textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp),
                    cursorBrush = SolidColor(Neo.Accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                )
            }
        }
        if (destination != null) {
            FieldRow(null, minHeight = 40) {
                Box {
                    ValuePill("Ouvrir dans les cartes", open = menuOpen, chevron = choices.size > 1, onClick = {
                        val direct = choices.firstOrNull { it.id != null && it.id == mapsApp }
                        when {
                            destination is LocationDestination.Link -> ExternalOpen.openMap(context, destination, null, mapsTravelMode)
                            direct != null -> ExternalOpen.openMap(context, destination, direct, mapsTravelMode)
                            choices.isEmpty() -> ExternalOpen.openMap(context, destination, null, mapsTravelMode)
                            else -> menuOpen = true
                        }
                    })
                    NeoMenu(menuOpen, { menuOpen = false }) {
                        for (choice in choices) {
                            NeoMenuItem(choice.label) {
                                menuOpen = false
                                ExternalOpen.openMap(context, destination, choice, mapsTravelMode)
                            }
                        }
                    }
                }
            }
        }
    }
}
