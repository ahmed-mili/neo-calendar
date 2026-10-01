package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.description.AddLinkResult
import com.ahmed.neocalendar.core.description.DescriptionFormatCommand
import com.ahmed.neocalendar.core.description.addLinkMarkdown
import com.ahmed.neocalendar.core.description.applyDescriptionFormat
import com.ahmed.neocalendar.nativeapp.ui.Icon
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons
import com.ahmed.neocalendar.nativeapp.ui.NeoModal
import com.ahmed.neocalendar.nativeapp.ui.Text
import com.ahmed.neocalendar.nativeapp.ui.consumeTaps
import com.ahmed.neocalendar.nativeapp.ui.cssShadow
import com.ahmed.neocalendar.nativeapp.ui.pressFill
import com.ahmed.neocalendar.nativeapp.ui.tr
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts

/**
 * L'éditeur de description : le texte reste du Markdown, la barre au-dessus du clavier n'y écrit que ce que `applyDescriptionFormat`
 * écrit dans l'ancienne (`androidDescriptionEditor.ts`). Ici vit ce que la barre partage avec le champ : le texte et sa sélection,
 * l'historique d'annulation (la WebView avait celui du navigateur), et l'état de la barre (repliée ou ouverte).
 */
@Stable
class DescriptionEditor {
    var value by mutableStateOf(TextFieldValue(""))
        private set
    var focused by mutableStateOf(false)
    var expanded by mutableStateOf(false)

    /** Vrai tant qu'une boîte (le lien, le sélecteur de fichiers) tient la place du champ : perdre le focus n'est pas quitter l'édition. */
    var holdFocus by mutableStateOf(false)
    var canUndo by mutableStateOf(false)
        private set
    var canRedo by mutableStateOf(false)
        private set

    /** Pose le texte écrit par la fiche ; la sélection est gardée (bornée au nouveau texte). */
    internal var onChange: (String) -> Unit = {}

    private val undoStack = ArrayDeque<TextFieldValue>()
    private val redoStack = ArrayDeque<TextFieldValue>()
    private var lastPush = 0L

    /** Le texte change ailleurs (une case cochée à la lecture, un lien ajouté) : on le suit sans l'historiser. */
    fun sync(text: String) {
        if (value.text == text) return
        val start = value.selection.start.coerceAtMost(text.length)
        val end = value.selection.end.coerceAtMost(text.length)
        value = TextFieldValue(text, TextRange(start, end))
    }

    fun moveCursorToEnd() {
        value = value.copy(selection = TextRange(value.text.length))
    }

    private fun push() {
        undoStack.addLast(value)
        if (undoStack.size > 200) undoStack.removeFirst()
        redoStack.clear()
        refreshHistory()
    }

    private fun refreshHistory() {
        canUndo = undoStack.isNotEmpty()
        canRedo = redoStack.isNotEmpty()
    }

    /** Une frappe, une suppression, un collage : les frappes qui se suivent à moins de 700 ms ne font qu'un pas d'annulation. */
    fun typed(next: TextFieldValue) {
        if (next.text != value.text) {
            val now = System.currentTimeMillis()
            if (now - lastPush > 700 || undoStack.isEmpty()) push()
            lastPush = now
            value = next
            onChange(next.text)
        } else {
            value = next
        }
    }

    fun apply(command: DescriptionFormatCommand) {
        val result = applyDescriptionFormat(value.text, value.selection.min, value.selection.max, command)
        push()
        lastPush = 0L
        value = TextFieldValue(result.text, TextRange(result.selectionStart, result.selectionEnd))
        onChange(result.text)
    }

    /** `insertMarkdown` : remplace la sélection (le curseur y était quand la boîte s'est ouverte), le curseur se pose après. */
    fun insert(markdown: String, at: TextRange = value.selection) {
        val text = value.text
        val start = at.min.coerceIn(0, text.length)
        val end = at.max.coerceIn(start, text.length)
        push()
        lastPush = 0L
        val next = text.substring(0, start) + markdown + text.substring(end)
        value = TextFieldValue(next, TextRange(start + markdown.length))
        onChange(next)
    }

    /** Une pièce jointe se range en dernière ligne (`appendMarkdownToEventBody`). */
    fun replaceAll(text: String) {
        if (text == value.text) return
        push()
        lastPush = 0L
        value = TextFieldValue(text, TextRange(text.length))
        onChange(text)
    }

    fun undo() {
        val previous = undoStack.removeLastOrNull() ?: return
        redoStack.addLast(value)
        value = previous
        onChange(previous.text)
        refreshHistory()
    }

    fun redo() {
        val next = redoStack.removeLastOrNull() ?: return
        undoStack.addLast(value)
        value = next
        onChange(next.text)
        refreshHistory()
    }
}

/** La barre : 48 dp, filet haut, ombre `0 -8px 24px`, boutons de 44 (rayon 9) ; repliée elle porte « Mise en forme » et le trombone. */
@Composable
fun DescriptionToolbar(editor: DescriptionEditor, attachDisabled: Boolean, onAttach: () -> Unit, onLink: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .cssShadow((-8).dp, 24.dp, Color.Black.copy(alpha = 0.18f))
            .background(Neo.Surface)
            .consumeTaps(),
    ) {
        if (!editor.expanded) {
            Row(Modifier.fillMaxWidth().fillMaxHeight().padding(horizontal = 8.dp, vertical = 2.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                ToolButton(AccessoryIcons.Format, "Mise en forme") { editor.expanded = true }
                ToolButton(AccessoryIcons.Attachment, "Pièce jointe", enabled = !attachDisabled, onClick = onAttach)
            }
        } else {
            Row(Modifier.fillMaxWidth().fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
                // Le retour : 44 de large, un filet à droite.
                Box(Modifier.width(44.dp).fillMaxHeight(), contentAlignment = Alignment.Center) {
                    ToolButton(AccessoryIcons.Back, "Fermer la mise en forme", radius = 0.dp) { editor.expanded = false }
                }
                Row(
                    Modifier.weight(1f).fillMaxHeight().horizontalScroll(rememberScrollState()).padding(horizontal = 4.dp, vertical = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ToolButton(AccessoryIcons.Bold, "Gras") { editor.apply(DescriptionFormatCommand.Bold) }
                    ToolButton(AccessoryIcons.Italic, "Italique") { editor.apply(DescriptionFormatCommand.Italic) }
                    ToolButton(AccessoryIcons.Underline, "Souligné") { editor.apply(DescriptionFormatCommand.Underline) }
                    ToolButton(AccessoryIcons.Bullets, "Liste à puces") { editor.apply(DescriptionFormatCommand.BulletList) }
                    ToolButton(AccessoryIcons.Ordered, "Liste numérotée") { editor.apply(DescriptionFormatCommand.OrderedList) }
                    ToolButton(AccessoryIcons.Checklist, "Élément à vérifier") { editor.apply(DescriptionFormatCommand.Checklist) }
                    ToolButton(AccessoryIcons.Link, "Ajouter un lien", onClick = onLink)
                    ToolButton(AccessoryIcons.Attachment, "Pièce jointe", enabled = !attachDisabled, onClick = onAttach)
                    ToolButton(AccessoryIcons.Clear, "Effacer la mise en forme") { editor.apply(DescriptionFormatCommand.Clear) }
                }
                // L'historique reste à droite, hors du défilement : 40 de large, un filet à gauche.
                Row(
                    Modifier.fillMaxHeight().background(Neo.Surface).padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ToolButton(AccessoryIcons.Undo, "Annuler l'action", width = 40.dp, enabled = editor.canUndo) { editor.undo() }
                    ToolButton(AccessoryIcons.Redo, "Rétablir", width = 40.dp, enabled = editor.canRedo) { editor.redo() }
                }
            }
        }
    }
}

/** Un bouton de la barre : 44 x 44, rayon 9, glyphe de 21 en `TextSecondary` ; l'appui prend le fond `Hover`, désactivé il pâlit à 28 %. Il ne prend pas le focus : le clavier reste. */
@Composable
private fun ToolButton(icon: ImageVector, label: String, width: androidx.compose.ui.unit.Dp = 44.dp, radius: androidx.compose.ui.unit.Dp = 9.dp, enabled: Boolean = true, onClick: () -> Unit) {
    val shape = RoundedCornerShape(radius)
    Box(
        Modifier.width(width).height(44.dp).alpha(if (enabled) 1f else 0.28f)
            .let { if (enabled) it.pressFill(shape, Neo.Hover, onClick = onClick) else it },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, tr(label), tint = Neo.TextSecondary, modifier = Modifier.size(21.dp)) }
}

/** « Ajouter un Lien » : une carte de 312 dp au centre, sans voile, deux champs et « Confirmer » (`DescriptionAddLinkDialog.tsx`). */
@Composable
fun AddLinkDialog(existing: List<String>, onInsert: (String) -> Unit, onDismiss: () -> Unit) {
    var label by remember { mutableStateOf("") }
    var target by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    NeoModal(onDismiss, veil = false) {
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier
                .padding(8.dp)
                .width(312.dp)
                .shadow(18.dp, shape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.Border, shape)
                .consumeTaps()
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("Ajouter un Lien"), color = Neo.Text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Box(Modifier.size(width = 30.dp, height = 28.dp).pressFill(RoundedCornerShape(6.dp), Neo.Hover, onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Icon(NeoIcons.Close, tr("Fermer"), tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
                }
            }
            LinkInput(label, tr("Texte"), { label = it }, Modifier.focusRequester(focus))
            LinkInput(target, tr("Lien"), { target = it; error = null })
            error?.let { Text(tr(it), color = Neo.Danger, fontSize = 14.sp) }
            Row(Modifier.fillMaxWidth().padding(top = 3.dp), horizontalArrangement = Arrangement.End) {
                val confirmShape = RoundedCornerShape(8.dp)
                val ready = target.isNotBlank()
                val fire = {
                    when (val result = addLinkMarkdown(label, target, existing)) {
                        is AddLinkResult.Insert -> { onInsert(result.markdown); onDismiss() }
                        is AddLinkResult.Refused -> error = result.message
                    }
                }
                Box(
                    Modifier.height(34.dp).alpha(if (ready) 1f else 0.45f).clip(confirmShape).background(Neo.Accent)
                        .let { if (ready) it.pressFill(confirmShape, Neo.AccentStrong, onClick = fire) else it }
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(tr("Confirmer"), color = Neo.OnAccent, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Clip) }
            }
        }
    }
}

/** `.nc-description-link-dialog > input` : 38 de haut, rayon 8, bord 1, fond `Mantle` ; bord et filet d'accent au focus. */
@Composable
private fun LinkInput(value: String, placeholder: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier.fillMaxWidth().height(38.dp).background(Neo.Hover, shape)
            .border(if (focused) 2.dp else 1.dp, if (focused) Neo.Accent else Neo.Border, shape)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) Text(placeholder, color = Neo.TextFaint, fontSize = 16.sp)
        BasicTextField(
            value, onChange, singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp, fontFamily = NeoFonts.inter),
            cursorBrush = SolidColor(Neo.Accent),
            modifier = modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
        )
    }
}

/** Les glyphes de la barre : les tracés de `androidDescriptionEditor.ts`, 24 x 24, trait de 1,9 (les puces sont pleines). */
private object AccessoryIcons {
    private fun icon(name: String, width: Float, vararg strokes: String, fills: List<String> = emptyList()): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            for (path in strokes) addPath(addPathNodes(path), stroke = SolidColor(Color.Black), strokeLineWidth = width, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
            for (path in fills) addPath(addPathNodes(path), fill = SolidColor(Color.Black))
        }.build()

    val Format by lazy { icon("format", 1.9f, "M4 7V4h16v3M9 20h6M12 4v16") }
    val Back by lazy { icon("back", 2f, "m15 18-6-6 6-6") }
    val Bold by lazy { icon("bold", 1.9f, "M6 4h8a4 4 0 0 1 0 8H6m0 0h9a4 4 0 0 1 0 8H6V4") }
    val Italic by lazy { icon("italic", 1.9f, "M19 4h-9M14 20H5M15 4 9 20") }
    val Underline by lazy { icon("underline", 1.9f, "M6 4v6a6 6 0 0 0 12 0V4M4 20h16") }
    val Bullets by lazy {
        icon("bullets", 1.9f, "M9 6h11M9 12h11M9 18h11", fills = listOf("M5 6a1 1 0 1 0 -2 0a1 1 0 1 0 2 0z", "M5 12a1 1 0 1 0 -2 0a1 1 0 1 0 2 0z", "M5 18a1 1 0 1 0 -2 0a1 1 0 1 0 2 0z"))
    }
    val Ordered by lazy { icon("ordered", 1.7f, "M10 6h10M10 12h10M10 18h10M4 4h1v4M3.5 12h2l-2 3h2M3.5 18.5h1.25a1 1 0 0 1 0 2H3.5m1.25 0a1 1 0 0 1 0 2H3.5") }
    val Checklist by lazy { icon("checklist", 1.9f, "M10 6h10M10 12h10M10 18h10M3 6l1.2 1.2L6.5 5M3 12l1.2 1.2L6.5 11M3 18l1.2 1.2L6.5 17") }
    val Link by lazy { icon("link", 1.9f, "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1") }
    val Attachment by lazy { icon("attachment", 1.9f, "M21.4 11.6 12.6 20.4a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5") }
    val Clear by lazy { icon("clear", 1.9f, "M4 4l16 16M6 7V4h12v3M12 8v12M9 20h6") }
    val Undo by lazy { icon("undo", 1.9f, "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v1") }
    val Redo by lazy { icon("redo", 1.9f, "m15 14 5-5-5-5M20 9H10a6 6 0 0 0-6 6v1") }
}
