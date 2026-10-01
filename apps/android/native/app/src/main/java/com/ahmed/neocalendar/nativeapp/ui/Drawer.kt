package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.systemGestureExclusion
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.ahmed.neocalendar.core.grid.CalendarModel
import com.ahmed.neocalendar.core.grid.MAX_DAY_COUNT
import com.ahmed.neocalendar.core.grid.MIN_DAY_COUNT
import com.ahmed.neocalendar.nativeapp.NativeUpdates
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** `transform .3s cubic-bezier(.05,.7,.1,1)` : la courbe de l'ouverture du tiroir de l'ancienne. */
private val DrawerEasing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

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
            animate(progress, target, velocity, tween(300, easing = DrawerEasing)) { value, _ -> progress = value }
        }
    }
}

private val EdgeWidth = 32.dp

/**
 * Le tiroir : `min(360 dp, 88 %)` de large (`CalendarPanel.css:49`), fond `Mantle`, bord droit seul. Il suit le doigt
 * depuis le bord gauche, se ferme par un glissé vers la gauche ou un appui sur le voile (noir 40 %, `--nc-drawer-dim`).
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
        val panelWidth = minOf(360.dp, maxWidth * 0.88f)
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
                    .background(Color.Black.copy(alpha = 0.4f))
                    .clickable(indication = null, interactionSource = null) { state.close(scope) }
                    .then(drag),
            )
            Box(
                Modifier
                    .width(panelWidth)
                    .fillMaxHeight()
                    .graphicsLayer { translationX = -(1f - state.progress) * panelPx }
                    .background(Neo.Mantle)
                    .drawBehind { drawRect(Neo.Border, topLeft = Offset(size.width - 1.dp.toPx(), 0f), size = Size(1.dp.toPx(), size.height)) }
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
    /** Le calendrier et l'emplacement de sa pastille, où le sélecteur de couleur s'ancre. */
    val onColor: (CalendarModel, Rect) -> Unit,
    val onRename: (CalendarModel) -> Unit,
    val onReminder: (CalendarModel) -> Unit,
    val onIcsLinks: (CalendarModel) -> Unit,
    val onDelete: (CalendarModel) -> Unit,
    val onReorder: (List<String>) -> Unit,
    /** « N'afficher que ce calendrier », ou le retour aux calendriers précédents quand il l'est déjà. */
    val onShowOnly: (CalendarModel) -> Unit,
)

/** Le contenu du tiroir : version et réglages, nombre de jours, calendriers, tâches. Pas de mini-calendrier (le mois s'ouvre par la barre). */
@Composable
fun DrawerContent(
    version: String,
    updates: NativeUpdates,
    dayCount: Int,
    onDayCount: (Int) -> Unit,
    calendars: List<CalendarModel>,
    hiddenIds: Set<String>,
    soloId: String?,
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
            .imePadding(),
    ) {
        // En-tête de 64 dp, filet bas, contenu à droite : la pastille de version puis l'engrenage, aucun titre.
        Row(
            Modifier
                .fillMaxWidth()
                .height(65.dp)
                .drawBehind { drawRect(Neo.Border, topLeft = Offset(0f, size.height - 1.dp.toPx()), size = Size(size.width, 1.dp.toPx())) }
                .padding(start = 8.dp, end = 8.dp, bottom = 1.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // La mise à jour prête (ou en route) tient à gauche de la version, là où l'ancienne pose sa pastille bleue.
            UpdatePill(updates)
            Spacer(Modifier.width(8.dp))
            Text(
                "v$version",
                color = Neo.TextSecondary,
                fontSize = 11.sp,
                lineHeight = 11.sp,
                maxLines = 1,
                modifier = Modifier
                    .padding(end = 4.dp)
                    .border(1.dp, Neo.Border, RoundedCornerShape(percent = 50))
                    .padding(horizontal = 9.dp, vertical = 5.dp),
            )
            Box(
                Modifier.size(Neo.TouchTarget).pressFill(RoundedCornerShape(10.dp), Neo.Hover, onClick = actions.onSettings),
                contentAlignment = Alignment.Center,
            ) {
                Icon(NeoIcons.DrawerGear, "Paramètres", tint = Neo.TextSecondary, modifier = Modifier.size(22.dp))
            }
        }
        DaySwitcher(dayCount, onDayCount)
        CalendarsSection(calendars, hiddenIds, soloId, defaultCalendarPath, onToggleCalendar, onOpenCalendar, actions)
        TasksSection(todoCount, completeCount, onOpenTasks)
        Spacer(Modifier.height(16.dp))
    }
}

/** Le filet haut de 1 dp qui sépare deux sections. */
private fun Modifier.topRule(): Modifier = drawBehind { drawRect(Neo.Border, size = Size(size.width, 1.dp.toPx())) }

// ── Tâches ────────────────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun TasksSection(todoCount: Int, completeCount: Int, onOpen: (Boolean) -> Unit) {
    Column(Modifier.fillMaxWidth().topRule().padding(start = 10.dp, end = 10.dp, top = 16.dp, bottom = 24.dp)) {
        SectionTitleRow(Modifier.padding(bottom = 2.dp)) { SectionTitle("Tâches") }
        Column(Modifier.padding(start = 8.dp, end = 8.dp, top = 2.dp, bottom = 8.dp)) {
            TaskGroupRow("À faire", todoCount, done = false) { onOpen(false) }
            TaskGroupRow("Terminé", completeCount, done = true) { onOpen(true) }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, color = Neo.TextFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
}

@Composable
private fun SectionTitleRow(modifier: Modifier = Modifier, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        modifier.fillMaxWidth().height(34.dp).padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun TaskGroupRow(label: String, count: Int, done: Boolean, onClick: () -> Unit) {
    // L'appui teinte la ligne de son état (orange / vert à 18 %), comme le survol de l'ancienne.
    val tint = (if (done) Neo.TaskDone else Neo.TaskTodo).copy(alpha = 0.18f)
    Row(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .pressFill(RoundedCornerShape(4.dp), tint, onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TaskStatusGlyph(done, if (done) Neo.TaskDone else Neo.TaskTodo)
        Text(label, color = Neo.Text, fontSize = 14.sp, maxLines = 1, modifier = Modifier.padding(start = 8.dp).weight(1f))
        Text(count.toString(), color = Neo.TextSecondary, fontSize = 14.sp)
    }
}

/** `nc-status-icon` : l'anneau pointillé d'une tâche à faire, le disque coché d'une tâche finie, 12 dp (TaskCheckbox.tsx). */
@Composable
private fun TaskStatusGlyph(done: Boolean, ink: Color) {
    Canvas(Modifier.size(12.dp)) {
        if (done) {
            drawCircle(ink)
            val tick = Path().apply {
                moveTo(size.width * 4f / 14f, size.height * 7f / 14f)
                lineTo(size.width * 6f / 14f, size.height * 9f / 14f)
                lineTo(size.width * 10f / 14f, size.height * 5f / 14f)
            }
            drawPath(tick, Neo.Surface, style = Stroke(1.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        } else {
            val w = 1.dp.toPx()
            drawCircle(
                ink.copy(alpha = 0.85f),
                radius = (size.minDimension - w) / 2f,
                style = Stroke(w, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.4f * density * 0.86f, 2.2f * density * 0.86f))),
            )
        }
    }
}

// ── Nombre de jours ───────────────────────────────────────────────────────────────────────────────────────

@Composable
private fun DaySwitcher(dayCount: Int, onDayCount: (Int) -> Unit) {
    var more by rememberSaveable { mutableStateOf(dayCount > 3) }
    // Le champ part de 10, quel que soit le nombre de jours affiché (`useState(10)` de l'ancienne).
    var custom by remember { mutableStateOf("10") }
    // Le bloc a son propre filet bas (blanc 7,5 %) au-dessus de celui de la section suivante : 10 dp de padding + 1 dp de filet.
    Column(
        Modifier
            .fillMaxWidth()
            .drawBehind { drawRect(Neo.BarPress, topLeft = Offset(0f, size.height - 1.dp.toPx()), size = Size(size.width, 1.dp.toPx())) }
            .padding(start = 8.dp, end = 8.dp, top = 7.dp, bottom = 11.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            for (n in 1..3) DayOption(n, active = dayCount == n) { onDayCount(n) }
        }
        // « Plus de durées » : 50 dp, 13 sp, discret, un chevron qui se retourne.
        Row(
            Modifier
                .padding(top = 2.dp)
                .fillMaxWidth()
                .height(50.dp)
                .pressFill(RoundedCornerShape(9.dp), Neo.Hover) { more = !more }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Plus de durées", color = Neo.TextFaint, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Icon(NeoIcons.ChevronDown, null, tint = Neo.TextFaint, modifier = Modifier.size(16.dp))
        }
        if (more) {
            Column(Modifier.padding(start = 7.dp, end = 7.dp, top = 4.dp, bottom = 2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    for (n in 4..9) {
                        val active = dayCount == n
                        val shape = RoundedCornerShape(8.dp)
                        Box(
                            Modifier
                                .weight(1f)
                                .height(36.dp)
                                .clip(shape)
                                .background(if (active) Neo.Accent else Neo.FaintFill)
                                .border(1.dp, if (active) Color.Transparent else Neo.FaintBorder, shape)
                                .clickable { onDayCount(n) },
                            contentAlignment = Alignment.Center,
                        ) { Text(n.toString(), color = if (active) Neo.OnAccent else Neo.Text, fontSize = 16.sp) }
                    }
                }
                Row(Modifier.padding(top = 7.dp), horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                    val apply = { custom.toIntOrNull()?.let { if (it in MIN_DAY_COUNT..MAX_DAY_COUNT) onDayCount(it) }; Unit }
                    val shape = RoundedCornerShape(9.dp)
                    BasicTextField(
                        custom,
                        { custom = it.filter(Char::isDigit).take(2) },
                        singleLine = true,
                        textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp),
                        cursorBrush = SolidColor(Neo.Accent),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { apply() }),
                        decorationBox = { inner -> Box(Modifier.fillMaxSize().padding(horizontal = 10.dp), contentAlignment = Alignment.CenterStart) { inner() } },
                        modifier = Modifier
                            .weight(1f)
                            .height(42.dp)
                            .background(Neo.InputFill, shape)
                            .border(1.dp, Neo.InputBorder, shape),
                    )
                    Box(
                        Modifier
                            .height(42.dp)
                            .clip(shape)
                            .background(Neo.Accent)
                            .clickable { apply() }
                            .padding(horizontal = 13.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Appliquer", color = Neo.OnAccent, fontSize = 16.sp) }
                }
            }
        }
    }
}

@Composable
private fun DayOption(count: Int, active: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .height(50.dp)
            .let { if (active) it.clip(RoundedCornerShape(8.dp)).background(Neo.Hover) else it }
            .pressFill(RoundedCornerShape(8.dp), Neo.Hover, onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DayColumnsIcon(count)
        Text(
            if (count == 1) "1 jour" else "$count jours",
            color = Neo.Text,
            fontSize = 14.sp,
            // 520 n'existe pas en Roboto statique : le navigateur retient le plus lourd suivant, le gras.
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

/** 18 x 16, bord 1 px, rayon 3, padding 2 : `n` colonnes séparées par un filet (`nc-android-day-option-icon`). */
@Composable
private fun DayColumnsIcon(count: Int) {
    val shape = RoundedCornerShape(3.dp)
    Row(
        Modifier.size(width = 18.dp, height = 16.dp).alpha(0.82f).border(1.dp, Neo.TextSecondary, shape).padding(2.dp),
    ) {
        repeat(count) { index ->
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .drawBehind { if (index > 0) drawRect(Neo.TextSecondary, size = Size(1.dp.toPx(), size.height)) },
            )
        }
    }
}

// ── Calendriers ───────────────────────────────────────────────────────────────────────────────────────────

/** Une rangée de calendrier : 58 dp et 2 dp d'écart (`min-height 50` + padding 8, `gap: 2px`). */
private val RowHeight = 58.dp
private val RowGap = 2.dp

@Composable
private fun CalendarsSection(
    calendars: List<CalendarModel>,
    hiddenIds: Set<String>,
    soloId: String?,
    defaultCalendarPath: String?,
    onToggle: (String) -> Unit,
    onOpen: (CalendarModel) -> Unit,
    actions: DrawerActions,
) {
    var collapsed by rememberSaveable { mutableStateOf(false) }
    var headerMenu by remember { mutableStateOf(false) }
    val hiddenCalendars = calendars.filter { it.id in hiddenIds }
    Column(Modifier.fillMaxWidth().topRule().padding(start = 10.dp, end = 10.dp, top = 16.dp, bottom = 24.dp)) {
        SectionTitleRow(Modifier.padding(bottom = 2.dp).pressFill(RoundedCornerShape(9.dp), Neo.Hover) { collapsed = !collapsed }) {
            SectionTitle("Calendriers")
            Icon(
                NeoIcons.ChevronDown,
                if (collapsed) "Développer les calendriers" else "Réduire les calendriers",
                tint = Neo.TextFaint,
                modifier = Modifier.padding(start = 4.dp).size(14.dp).graphicsLayer { rotationZ = if (collapsed) -90f else 0f },
            )
            Box(Modifier.weight(1f))
            Box {
                Box(
                    Modifier.size(20.dp).pressFill(RoundedCornerShape(4.dp), Neo.Hover) { headerMenu = true },
                    contentAlignment = Alignment.Center,
                ) { Icon(NeoIcons.Ellipsis, "Plus d'options", tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
                NeoPopupMenu(headerMenu, { headerMenu = false }) {
                    if (hiddenCalendars.isEmpty()) {
                        MenuRow("Aucun calendrier masqué", enabled = false, muted = true) { }
                    }
                    for (calendar in hiddenCalendars) {
                        MenuRow("Afficher : ${calendar.name}", swatch = parseCalendarColor(calendar.color)) {
                            headerMenu = false
                            onToggle(calendar.id)
                        }
                    }
                }
            }
            Spacer(Modifier.width(2.dp))
            Box(
                Modifier.size(20.dp).pressFill(RoundedCornerShape(4.dp), Neo.Hover, onClick = actions.onAddCalendar),
                contentAlignment = Alignment.Center,
            ) { Icon(NeoIcons.Plus, "Ajouter un calendrier", tint = Neo.TextSecondary, modifier = Modifier.size(14.dp)) }
        }
        if (!collapsed) CalendarList(calendars, hiddenIds, soloId, defaultCalendarPath, onToggle, onOpen, actions)
    }
}

/**
 * Les calendriers visibles (un calendrier masqué quitte la liste, `visibleSources`, et se retrouve dans le menu « ... » du titre).
 * Un appui long sur une ligne la prend : on la glisse vers le haut ou le bas, l'ordre est écrit au lâcher.
 * Pendant le glissé la liste suit le doigt ; elle ne revient à celle du fichier que quand la relecture apporte un nouvel ordre.
 */
@Composable
private fun CalendarList(
    calendars: List<CalendarModel>,
    hiddenIds: Set<String>,
    soloId: String?,
    defaultCalendarPath: String?,
    onToggle: (String) -> Unit,
    onOpen: (CalendarModel) -> Unit,
    actions: DrawerActions,
) {
    val visible = remember(calendars, hiddenIds) { calendars.filter { it.id !in hiddenIds } }
    var working by remember(visible) { mutableStateOf(visible) }
    var draggedId by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableFloatStateOf(0f) }
    val rowPx = with(androidx.compose.ui.platform.LocalDensity.current) { (RowHeight + RowGap).toPx() }
    Column(verticalArrangement = Arrangement.spacedBy(RowGap)) {
        for (calendar in working) {
            androidx.compose.runtime.key(calendar.id) {
                val dragging = draggedId == calendar.id
                CalendarRow(
                    calendar,
                    isDefault = calendar.relativePath == defaultCalendarPath,
                    isSolo = calendar.id == soloId,
                    onToggle = { onToggle(calendar.id) },
                    onOpen = { onOpen(calendar) },
                    actions = actions,
                    modifier = Modifier
                        .zIndex(if (dragging) 1f else 0f)
                        .graphicsLayer { translationY = if (dragging) offset else 0f }
                        .pointerInput(calendar.id, visible) {
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
                                    if (working.map { it.id } != visible.map { it.id }) {
                                        // Les calendriers masqués gardent leur place dans le fichier : seuls les emplacements des visibles changent.
                                        val queue = ArrayDeque(working.map { it.relativePath })
                                        actions.onReorder(calendars.map { if (it.id in hiddenIds) it.relativePath else queue.removeFirst() })
                                    }
                                },
                                onDragCancel = { draggedId = null; offset = 0f; working = visible },
                            )
                        },
                )
            }
        }
    }
}

@Composable
private fun CalendarRow(
    calendar: CalendarModel,
    isDefault: Boolean,
    isSolo: Boolean,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
    actions: DrawerActions,
    modifier: Modifier = Modifier,
) {
    val color = parseCalendarColor(calendar.color)
    var menu by remember { mutableStateOf(false) }
    var swatchBounds by remember { mutableStateOf(Rect.Zero) }
    Row(
        modifier
            .fillMaxWidth()
            .height(RowHeight)
            .pressFill(RoundedCornerShape(10.dp), Neo.Hover, on = menu, onClick = onOpen)
            // Padding 8/10 de l'ancienne, la pastille (42 dp) mord de 8 dp à gauche, 6 à droite et 8 en haut / bas.
            .padding(start = 2.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Un appui sur la pastille en fait le calendrier par défaut ; elle s'enfonce (échelle 0,82 en 130 ms) tant que le doigt la tient.
        val source = remember { MutableInteractionSource() }
        val pressed by source.collectIsPressedAsState()
        val scale by animateFloatAsState(if (pressed) 0.82f else 1f, tween(130, easing = CubicBezierEasing(0.2f, 0.85f, 0.25f, 1f)), label = "swatch")
        Box(
            Modifier
                .size(42.dp)
                .onGloballyPositioned { swatchBounds = it.boundsInWindow() }
                .clickable(interactionSource = source, indication = null, enabled = calendar.editable) { actions.onSetDefault(calendar) },
            contentAlignment = Alignment.Center,
        ) {
            if (calendar.editable) {
                Box(
                    Modifier
                        .scale(scale)
                        .size(15.dp)
                        .background(color, RoundedCornerShape(4.dp)),
                )
            } else {
                // Un calendrier automatique porte son icône à la place de la pastille : le glyphe coloré, sans fond.
                Icon(NeoIcons.Flag, null, tint = color, modifier = Modifier.scale(scale).size(15.dp))
            }
            // Le calendrier par défaut : un anneau de 2 dp de sa couleur, à 3 dp de la pastille.
            if (isDefault) Box(Modifier.scale(scale).size(25.dp).border(2.dp, color, RoundedCornerShape(9.dp)))
        }
        // Le nom, « Par défaut » et les actions : deux marges `auto` (`CalendarTouch.css:30`) se partagent la place libre à parts égales,
        // le libellé tient donc au milieu de l'espace entre le nom et les actions.
        SpreadRow(
            Modifier.weight(1f).fillMaxHeight(),
            name = {
                Text(
                    calendar.name,
                    color = Neo.Text,
                    fontSize = 14.sp,
                    // 540 : même repli que ci-dessus, la WebView l'affiche en gras.
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 2.dp),
                )
            },
            label = if (isDefault) {
                { Text("Par défaut", color = Neo.TextFaint, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(end = 6.dp)) }
            } else {
                null
            },
            actions = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                Box {
                    Box(
                        Modifier.size(22.dp).pressFill(RoundedCornerShape(3.dp), Neo.Hover) { menu = true },
                        contentAlignment = Alignment.Center,
                    ) { Icon(NeoIcons.Ellipsis, "Menu de ${calendar.name}", tint = Neo.TextFaint, modifier = Modifier.size(16.dp)) }
                    NeoPopupMenu(menu, { menu = false }) {
                        MenuRow("Couleur", swatch = color) { menu = false; actions.onColor(calendar, swatchBounds) }
                        // Le calendrier de chemin vide est le dossier de notes lui-même : ni renommé ni retiré.
                        val isFolder = calendar.relativePath.isNotEmpty()
                        // Renommer, le rappel et les liens ICS sont ceux d'un dossier de notes : un calendrier automatique n'a que la couleur.
                        if (isFolder && calendar.editable) MenuRow("Renommer", icon = NeoIcons.Pencil) { menu = false; actions.onRename(calendar) }
                        if (calendar.editable) {
                            MenuRow("Rappel", icon = NeoIcons.Bell) { menu = false; actions.onReminder(calendar) }
                            MenuRow("Liens ICS", icon = NeoIcons.Link) { menu = false; actions.onIcsLinks(calendar) }
                        }
                        MenuRow(
                            if (isSolo) "Réafficher les calendriers masqués" else "N'afficher que ce calendrier",
                            icon = if (isSolo) NeoIcons.DrawerEye else NeoIcons.DrawerEyeOff,
                        ) { menu = false; actions.onShowOnly(calendar) }
                        if (isFolder) MenuRow("Retirer de la liste", icon = NeoIcons.ListX, danger = true) { menu = false; actions.onDelete(calendar) }
                    }
                }
                Spacer(Modifier.width(2.dp))
                Box(
                    Modifier.size(22.dp).pressFill(RoundedCornerShape(3.dp), Neo.Hover, onClick = onToggle),
                    contentAlignment = Alignment.Center,
                ) { Icon(NeoIcons.DrawerEye, "Masquer ${calendar.name}", tint = Neo.TextFaint, modifier = Modifier.size(16.dp)) }
                }
            },
        )
    }
}

/**
 * Le nom, le libellé « Par défaut » éventuel et les actions : le nom prend sa largeur (tronquée au besoin), les actions s'alignent à
 * droite, le libellé se pose au milieu de l'espace libre qui reste entre les deux.
 */
@Composable
private fun SpreadRow(
    modifier: Modifier,
    name: @Composable () -> Unit,
    label: (@Composable () -> Unit)?,
    actions: @Composable () -> Unit,
) {
    androidx.compose.ui.layout.Layout(
        content = {
            Box { name() }
            if (label != null) Box { label() }
            Box { actions() }
        },
        modifier = modifier,
    ) { measurables, constraints ->
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val actionsPlaceable = measurables.last().measure(loose)
        val labelPlaceable = if (label != null) measurables[1].measure(loose) else null
        val nameMax = (constraints.maxWidth - actionsPlaceable.width - (labelPlaceable?.width ?: 0)).coerceAtLeast(0)
        val namePlaceable = measurables[0].measure(loose.copy(maxWidth = nameMax))
        val width = constraints.maxWidth
        val height = if (constraints.hasBoundedHeight) constraints.maxHeight else maxOf(namePlaceable.height, actionsPlaceable.height, labelPlaceable?.height ?: 0)
        layout(width, height) {
            namePlaceable.placeRelative(0, (height - namePlaceable.height) / 2)
            actionsPlaceable.placeRelative(width - actionsPlaceable.width, (height - actionsPlaceable.height) / 2)
            labelPlaceable?.let {
                val free = width - namePlaceable.width - it.width - actionsPlaceable.width
                it.placeRelative(namePlaceable.width + free / 2, (height - it.height) / 2)
            }
        }
    }
}
