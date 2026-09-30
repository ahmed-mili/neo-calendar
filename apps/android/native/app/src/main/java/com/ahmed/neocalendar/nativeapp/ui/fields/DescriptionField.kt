package com.ahmed.neocalendar.nativeapp.ui.fields

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.description.ChecklistLine
import com.ahmed.neocalendar.core.description.readChecklist
import com.ahmed.neocalendar.core.description.readInlineLinks
import com.ahmed.neocalendar.core.description.toggleLine
import com.ahmed.neocalendar.nativeapp.ExternalOpen
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoIcons

/** Une ligne de texte, ses liens `[nom](adresse)` dessinés comme des liens sur lesquels on appuie. */
@Composable
private fun LinkedText(text: String, color: androidx.compose.ui.graphics.Color, onOpen: (String) -> Unit, modifier: Modifier = Modifier) {
    val links = readInlineLinks(text)
    val styled: AnnotatedString = if (links.isEmpty()) AnnotatedString(text) else buildAnnotatedString {
        var cursor = 0
        for (link in links) {
            append(text.substring(cursor, link.start))
            withLink(
                LinkAnnotation.Clickable(
                    tag = link.target,
                    styles = TextLinkStyles(SpanStyle(color = Neo.Accent, textDecoration = TextDecoration.Underline)),
                ) { onOpen(link.target) }
            ) { append(link.label) }
            cursor = link.end
        }
        append(text.substring(cursor))
    }
    Text(styled, color = color, fontSize = 15.sp, modifier = modifier)
}

/**
 * La description : du Markdown. Au repos elle se lit (cases à cocher dessinées
 * comme des cases, sur lesquelles on appuie ; liens sur lesquels on appuie) ; un
 * appui ailleurs l'ouvre en texte, le Markdown intact. Pas de barre de mise en forme.
 */
@Composable
fun DescriptionField(
    description: String,
    editable: Boolean,
    onChange: (String) -> Unit,
    onOpenTarget: (String) -> Unit,
) {
    var editing by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(editing) { if (editing) focus.requestFocus() }

    Column {
        FieldRow(NeoIcons.TextAlignStart, minHeight = 52) {
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                if (editing && editable) {
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Neo.Hover)
                            .border(1.dp, Neo.Accent, RoundedCornerShape(10.dp)).padding(10.dp),
                    ) {
                        BasicTextField(
                            description,
                            onChange,
                            textStyle = TextStyle(color = Neo.Text, fontSize = 15.sp),
                            cursorBrush = SolidColor(Neo.Accent),
                            modifier = Modifier.fillMaxWidth().focusRequester(focus),
                        )
                    }
                    Row(Modifier.padding(top = 6.dp)) {
                        TextAction("Ajouter une case") {
                            onChange(if (description.isEmpty() || description.endsWith("\n")) "$description- [ ] " else "$description\n- [ ] ")
                        }
                        Box(Modifier.weight(1f))
                        TextAction("Terminé") { editing = false }
                    }
                } else if (description.isEmpty()) {
                    Text(
                        "Description",
                        color = Neo.TextFaint,
                        fontSize = 15.sp,
                        modifier = Modifier.fillMaxWidth().let { if (editable) it.clickable { editing = true } else it }.padding(vertical = 8.dp),
                    )
                } else {
                    val lines = readChecklist(description)
                    Column(Modifier.fillMaxWidth().let { if (editable) it.clickable { editing = true } else it }.padding(vertical = 4.dp)) {
                        lines.forEachIndexed { index, line ->
                            when (line) {
                                is ChecklistLine.Task -> Row(
                                    Modifier.fillMaxWidth().clickable(enabled = editable) { onChange(toggleLine(description, index)) }
                                        .padding(start = (line.indent.length * 6).dp, top = 3.dp, bottom = 3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        Modifier.size(20.dp).clip(RoundedCornerShape(6.dp))
                                            .background(if (line.done) Neo.Accent else androidx.compose.ui.graphics.Color.Transparent)
                                            .border(1.5.dp, if (line.done) Neo.Accent else Neo.TextFaint, RoundedCornerShape(6.dp)),
                                        contentAlignment = Alignment.Center,
                                    ) { if (line.done) Icon(NeoIcons.Check, null, tint = Neo.Background, modifier = Modifier.size(14.dp)) }
                                    LinkedText(
                                        line.title,
                                        if (line.done) Neo.TextFaint else Neo.Text,
                                        onOpenTarget,
                                        Modifier.padding(start = 10.dp),
                                    )
                                }
                                is ChecklistLine.Bullet -> Row(Modifier.padding(start = (line.indent.length * 6).dp, top = 2.dp, bottom = 2.dp)) {
                                    Text("•", color = Neo.TextSecondary, fontSize = 15.sp, modifier = Modifier.padding(end = 10.dp))
                                    LinkedText(line.text, Neo.Text, onOpenTarget)
                                }
                                is ChecklistLine.Text ->
                                    if (line.text.isEmpty()) Box(Modifier.height(8.dp))
                                    else LinkedText(line.text, Neo.Text, onOpenTarget, Modifier.padding(vertical = 2.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Les liens et pièces jointes écrits dans la description, listés et ouvrables. */
@Composable
fun LinksField(description: String, onOpenTarget: (String) -> Unit) {
    val links = readInlineLinks(description)
    if (links.isEmpty()) return
    Column {
        SectionLabel("Liens et pièces jointes")
        for (link in links) {
            val web = ExternalOpen.isWebTarget(link.target)
            FieldRow(if (web) NeoIcons.Link else NeoIcons.Paperclip, onClick = { onOpenTarget(link.target) }, minHeight = 44) {
                Column(Modifier.weight(1f)) {
                    Text(link.label.ifEmpty { link.target }, color = Neo.Text, fontSize = 15.sp, maxLines = 1)
                    if (link.label.isNotEmpty() && link.label != link.target) {
                        Text(link.target, color = Neo.TextFaint, fontSize = 12.sp, maxLines = 1)
                    }
                }
                Icon(NeoIcons.ExternalLink, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
            }
        }
    }
}
