package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/** L'en-tête d'une liste plein écran : retour, titre, et une pastille de couleur quand la liste est celle d'un calendrier. */
@Composable
fun ListHeader(title: String, onBack: () -> Unit, dot: Color? = null) {
    Row(Modifier.fillMaxWidth().height(Neo.TopBarHeight).padding(horizontal = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(Neo.TouchTarget).clip(RoundedCornerShape(14.dp)).clickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) { Icon(NeoIcons.ChevronLeft, "Retour", tint = Neo.Text, modifier = Modifier.size(24.dp)) }
        if (dot != null) Box(Modifier.padding(start = 4.dp).size(12.dp).clip(CircleShape).background(dot))
        Text(
            title,
            color = Neo.Text,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 10.dp).weight(1f),
        )
    }
}

/**
 * Le champ de recherche des listes : loupe, saisie, croix pour effacer.
 * `autoFocus` attend la fin de l'arrivée de l'écran avant de lever le clavier
 * (comme la recherche du PC : le clavier prend 40 % de la hauteur, et le
 * lever pendant l'animation fait saccader la mise en page).
 */
@Composable
fun ListSearchField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    autoFocus: Boolean = false,
) {
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    if (autoFocus) {
        LaunchedEffect(Unit) {
            delay(SEARCH_ENTER_MS)
            focus.requestFocus()
        }
    }
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier.fillMaxWidth().height(44.dp).background(Neo.Hover, shape).border(1.dp, Neo.Border, shape).padding(start = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(NeoIcons.Search, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
        Box(Modifier.weight(1f).padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text(placeholder, color = Neo.TextFaint, fontSize = 15.sp, maxLines = 1)
            BasicTextField(
                value,
                onChange,
                singleLine = true,
                textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp),
                cursorBrush = SolidColor(Neo.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
        }
        if (value.isNotEmpty()) {
            Box(
                Modifier.size(44.dp).clickable { onChange(""); focus.requestFocus() },
                contentAlignment = Alignment.Center,
            ) { Icon(NeoIcons.Close, "Effacer la recherche", tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
        }
    }
}

/** La durée de l'arrivée de l'écran de recherche (ms), pour y accorder le clavier. */
const val SEARCH_ENTER_MS = 260L

/** Une liste vide le dit : sans un mot elle se lit comme une panne. */
@Composable
fun EmptyNote(text: String) {
    Text(
        text,
        color = Neo.TextFaint,
        fontSize = 14.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
    )
}
