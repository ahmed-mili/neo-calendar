package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.grid.MAX_DAY_COUNT
import com.ahmed.neocalendar.core.grid.MIN_DAY_COUNT
import java.time.LocalDate
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** L'ouverture du tiroir, de 0 (fermé) à 1 (ouvert) : il suit le doigt, puis se pose. */
@Stable
class DrawerState {
    var progress by mutableFloatStateOf(0f)
        private set

    val isOpen: Boolean get() = progress > 0f

    fun dragBy(deltaPx: Float, widthPx: Float) {
        progress = (progress + deltaPx / widthPx).coerceIn(0f, 1f)
    }

    fun settle(scope: CoroutineScope, widthPx: Float, velocityPxPerSec: Float) {
        val open = if (kotlin.math.abs(velocityPxPerSec) > 400f) velocityPxPerSec > 0 else progress > 0.5f
        animateTo(scope, if (open) 1f else 0f, velocityPxPerSec / widthPx)
    }

    fun open(scope: CoroutineScope) = animateTo(scope, 1f, 0f)

    fun close(scope: CoroutineScope) = animateTo(scope, 0f, 0f)

    private fun animateTo(scope: CoroutineScope, target: Float, velocity: Float) {
        scope.launch {
            animate(progress, target, velocity, tween(220, easing = FastOutSlowInEasing)) { value, _ -> progress = value }
        }
    }
}

private val EdgeWidth = 32.dp

/**
 * Le tiroir : `min(305 dp, 82 %)` de large, il suit le doigt depuis le bord
 * gauche, se ferme par un glissé vers la gauche ou un appui sur le voile.
 */
@Composable
fun NeoDrawer(
    state: DrawerState,
    scope: CoroutineScope,
    modifier: Modifier = Modifier,
    edgeTopPadding: Dp = 0.dp,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier.fillMaxSize()) {
        val panelWidth = minOf(305.dp, maxWidth * 0.82f)
        val panelPx = with(androidx.compose.ui.platform.LocalDensity.current) { panelWidth.toPx() }
        val dragState = rememberDraggableState { state.dragBy(it, panelPx) }
        val drag = Modifier.draggable(
            dragState,
            Orientation.Horizontal,
            onDragStopped = { velocity -> state.settle(scope, panelPx, velocity) },
        )

        // Le bord : c'est là que le doigt attrape le tiroir fermé.
        if (state.progress < 1f) {
            // Sous la barre du haut : le bouton du menu est dessous, et un bord qui le couvrirait avalerait son appui.
            Box(Modifier.padding(top = edgeTopPadding).width(EdgeWidth).fillMaxHeight().systemGestureExclusion().then(drag))
        }
        if (state.isOpen) {
            Box(
                Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = state.progress }
                    .background(Color.Black.copy(alpha = 0.5f))
                    .clickable(indication = null, interactionSource = null) { state.close(scope) }
                    .then(drag),
            )
            Box(
                Modifier
                    .width(panelWidth)
                    .fillMaxHeight()
                    .graphicsLayer { translationX = -(1f - state.progress) * panelPx }
                    .background(Neo.Surface)
                    .border(BorderStroke(1.dp, Neo.Border))
                    .then(drag),
            ) { content() }
        }
    }
}

/** Le contenu du tiroir : version, nombre de jours, mini-calendrier, calendriers. */
@Composable
fun DrawerContent(
    version: String,
    dayCount: Int,
    onDayCount: (Int) -> Unit,
    anchor: LocalDate,
    firstDay: Int,
    onSelectDate: (LocalDate) -> Unit,
    calendars: List<CalendarModel>,
    hiddenIds: Set<String>,
    defaultCalendarPath: String?,
    onToggleCalendar: (String) -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.statusBars)
            .verticalScroll(rememberScrollState())
            .windowInsetsPadding(WindowInsets.navigationBars)
            .imePadding()
            .padding(bottom = 16.dp),
    ) {
        Row(Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Neo Calendar", color = Neo.Text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text("v$version", color = Neo.TextFaint, fontSize = 12.sp)
        }
        DaySwitcher(dayCount, onDayCount)
        MiniCalendar(anchor, firstDay, onSelectDate, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), cellHeight = 34.dp)
        Text(
            "Calendriers",
            color = Neo.TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
        )
        for (calendar in calendars) {
            CalendarRow(
                calendar,
                hidden = calendar.id in hiddenIds,
                isDefault = calendar.relativePath == defaultCalendarPath,
                onToggle = { onToggleCalendar(calendar.id) },
            )
        }
    }
}

@Composable
private fun DaySwitcher(dayCount: Int, onDayCount: (Int) -> Unit) {
    var more by remember { mutableStateOf(dayCount > 3) }
    var custom by remember(dayCount) { mutableStateOf(dayCount.toString()) }
    Column(Modifier.padding(horizontal = 12.dp)) {
        Text("Jours affichés", color = Neo.TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (n in 1..3) DayOption(n, active = dayCount == n, Modifier.weight(1f)) { onDayCount(n) }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable { more = !more }
                .padding(horizontal = 4.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Plus de durées", color = Neo.TextSecondary, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp).graphicsLayer { rotationZ = if (more) 180f else 0f })
        }
        if (more) {
            for (rowStart in intArrayOf(4, 7)) {
                Row(Modifier.padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (n in rowStart until rowStart + 3) {
                        val active = dayCount == n
                        Box(
                            Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (active) Neo.Accent.copy(alpha = 0.22f) else Neo.Hover)
                                .clickable { onDayCount(n) },
                            contentAlignment = Alignment.Center,
                        ) { Text(n.toString(), color = if (active) Neo.Accent else Neo.Text, fontSize = 14.sp) }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val apply = {
                    custom.toIntOrNull()?.let { if (it in MIN_DAY_COUNT..MAX_DAY_COUNT) onDayCount(it) }
                }
                BasicTextField(
                    custom,
                    { custom = it.filter(Char::isDigit).take(2) },
                    singleLine = true,
                    textStyle = androidx.compose.ui.text.TextStyle(color = Neo.Text, fontSize = 14.sp),
                    cursorBrush = SolidColor(Neo.Accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { apply() }),
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp)
                        .background(Neo.Hover, RoundedCornerShape(10.dp))
                        .border(1.dp, Neo.Border, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                )
                Box(
                    Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Neo.Accent)
                        .clickable { apply() }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Appliquer", color = Neo.Background, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
            }
            Text("De $MIN_DAY_COUNT à $MAX_DAY_COUNT jours", color = Neo.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(start = 4.dp, top = 4.dp))
        }
    }
}

@Composable
private fun DayOption(count: Int, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier
            .clip(shape)
            .background(if (active) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
            .border(1.dp, if (active) Neo.Accent else Color.Transparent, shape)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.height(16.dp)) {
            repeat(count) {
                Box(Modifier.width(7.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (active) Neo.Accent else Neo.TextSecondary))
            }
        }
        Text(
            if (count == 1) "1 jour" else "$count jours",
            color = if (active) Neo.Accent else Neo.Text,
            fontSize = 12.sp,
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

@Composable
private fun CalendarRow(calendar: CalendarModel, hidden: Boolean, isDefault: Boolean, onToggle: () -> Unit) {
    val color = parseCalendarColor(calendar.color)
    Row(
        Modifier.fillMaxWidth().height(Neo.TouchTarget).padding(start = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // La pastille est pleine quand le calendrier se voit, un anneau quand il est masqué.
        Box(
            Modifier
                .size(14.dp)
                .clip(CircleShape)
                .then(if (hidden) Modifier.border(2.dp, color, CircleShape) else Modifier.background(color)),
        )
        Text(
            calendar.name,
            color = if (hidden) Neo.TextFaint else Neo.Text,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 12.dp).weight(1f),
        )
        if (isDefault) {
            Text("Par défaut", color = Neo.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(start = 8.dp))
        }
        Box(
            Modifier.size(Neo.TouchTarget).clickable(onClick = onToggle),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (hidden) NeoIcons.EyeOff else NeoIcons.Eye,
                if (hidden) "Afficher ${calendar.name}" else "Masquer ${calendar.name}",
                tint = if (hidden) Neo.TextFaint else Neo.TextSecondary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
