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
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.zIndex
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenu
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenuItem
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

/** Ce que le tiroir demande sur un calendrier (menu de sa ligne, pastille, ordre) et sur les Réglages. */
class DrawerActions(
    val onSettings: () -> Unit,
    val onAddCalendar: () -> Unit,
    val onSetDefault: (CalendarModel) -> Unit,
    val onColor: (CalendarModel) -> Unit,
    val onRename: (CalendarModel) -> Unit,
    val onReminder: (CalendarModel) -> Unit,
    val onDelete: (CalendarModel) -> Unit,
    val onReorder: (List<String>) -> Unit,
)

/** Le contenu du tiroir : version, réglages, nombre de jours, mini-calendrier, calendriers, tâches. */
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
    onOpenCalendar: (CalendarModel) -> Unit,
    todoCount: Int,
    completeCount: Int,
    onOpenTasks: (complete: Boolean) -> Unit,
    actions: DrawerActions,
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
            Box(Modifier.size(Neo.TouchTarget).clickable(onClick = actions.onSettings), contentAlignment = Alignment.Center) {
                Icon(NeoIcons.Settings, "Réglages", tint = Neo.TextSecondary, modifier = Modifier.size(20.dp))
            }
        }
        DaySwitcher(dayCount, onDayCount)
        MiniCalendar(anchor, firstDay, onSelectDate, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), cellHeight = 34.dp)
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Calendriers", color = Neo.TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Box(Modifier.size(Neo.TouchTarget).clickable(onClick = actions.onAddCalendar), contentAlignment = Alignment.Center) {
                Icon(NeoIcons.Plus, "Ajouter un calendrier", tint = Neo.TextSecondary, modifier = Modifier.size(20.dp))
            }
        }
        CalendarList(calendars, hiddenIds, defaultCalendarPath, onToggleCalendar, onOpenCalendar, actions)
        Text(
            "Tâches",
            color = Neo.TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp),
        )
        TaskGroupRow("À faire", todoCount, done = false) { onOpenTasks(false) }
        TaskGroupRow("Terminé", completeCount, done = true) { onOpenTasks(true) }
    }
}

@Composable
private fun TaskGroupRow(label: String, count: Int, done: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(Neo.TouchTarget).clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TaskCheck(done, Neo.Accent, size = 18.dp)
        Text(label, color = Neo.Text, fontSize = 14.sp, modifier = Modifier.padding(start = 12.dp).weight(1f))
        Text(count.toString(), color = Neo.TextSecondary, fontSize = 13.sp)
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

/**
 * Les calendriers. Un appui long sur une ligne la prend : on la glisse vers le haut ou le bas, l'ordre
 * est écrit au lâcher (`order`). Pendant le glissé la liste suit le doigt ; elle ne revient à celle du
 * fichier que quand la relecture apporte un nouvel ordre.
 */
@Composable
private fun CalendarList(
    calendars: List<CalendarModel>,
    hiddenIds: Set<String>,
    defaultCalendarPath: String?,
    onToggle: (String) -> Unit,
    onOpen: (CalendarModel) -> Unit,
    actions: DrawerActions,
) {
    var working by remember(calendars) { mutableStateOf(calendars) }
    var draggedId by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableFloatStateOf(0f) }
    val rowPx = with(androidx.compose.ui.platform.LocalDensity.current) { Neo.TouchTarget.toPx() }
    for (calendar in working) {
        androidx.compose.runtime.key(calendar.id) {
            val dragging = draggedId == calendar.id
            CalendarRow(
                calendar,
                hidden = calendar.id in hiddenIds,
                isDefault = calendar.relativePath == defaultCalendarPath,
                onToggle = { onToggle(calendar.id) },
                onOpen = { onOpen(calendar) },
                actions = actions,
                modifier = Modifier
                    .zIndex(if (dragging) 1f else 0f)
                    .graphicsLayer { translationY = if (dragging) offset else 0f }
                    .then(if (dragging) Modifier.background(Neo.Hover) else Modifier)
                    .pointerInput(calendar.id) {
                        detectDragGesturesAfterLongPress(
                            onDragStart = { draggedId = calendar.id; offset = 0f },
                            onDrag = { change, amount ->
                                change.consume()
                                offset += amount.y
                                val from = working.indexOfFirst { it.id == calendar.id }
                                val to = (from + (offset / rowPx).roundToInt()).coerceIn(0, working.lastIndex)
                                if (to != from) {
                                    working = working.toMutableList().also { list -> list.add(to, list.removeAt(from)) }
                                    offset -= (to - from) * rowPx
                                }
                            },
                            onDragEnd = {
                                draggedId = null
                                offset = 0f
                                if (working.map { it.id } != calendars.map { it.id }) actions.onReorder(working.map { it.relativePath })
                            },
                            onDragCancel = { draggedId = null; offset = 0f; working = calendars },
                        )
                    },
            )
        }
    }
}

@Composable
private fun CalendarRow(
    calendar: CalendarModel,
    hidden: Boolean,
    isDefault: Boolean,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    actions: DrawerActions,
    modifier: Modifier = Modifier,
) {
    val color = parseCalendarColor(calendar.color)
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().height(Neo.TouchTarget).clickable(onClick = onOpen).padding(start = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // La pastille est pleine quand le calendrier se voit, un anneau quand il est masqué ; un appui en fait le calendrier par défaut.
        Box(
            Modifier.size(40.dp).clickable(enabled = calendar.editable) { actions.onSetDefault(calendar) },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier
                    .size(14.dp)
                    .clip(CircleShape)
                    .then(if (hidden) Modifier.border(2.dp, color, CircleShape) else Modifier.background(color)),
            )
        }
        Text(
            calendar.name,
            color = if (hidden) Neo.TextFaint else Neo.Text,
            fontSize = 14.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 4.dp).weight(1f),
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
        Box {
            Box(Modifier.size(Neo.TouchTarget).clickable { menu = true }, contentAlignment = Alignment.Center) {
                Icon(NeoIcons.EllipsisVertical, "Menu de ${calendar.name}", tint = Neo.TextSecondary, modifier = Modifier.size(20.dp))
            }
            NeoMenu(menu, { menu = false }) {
                NeoMenuItem("Couleur") { menu = false; actions.onColor(calendar) }
                NeoMenuItem("Renommer") { menu = false; actions.onRename(calendar) }
                NeoMenuItem("Rappel") { menu = false; actions.onReminder(calendar) }
                if (!isDefault) NeoMenuItem("Calendrier par défaut") { menu = false; actions.onSetDefault(calendar) }
                NeoMenuItem("Supprimer") { menu = false; actions.onDelete(calendar) }
            }
        }
    }
}
