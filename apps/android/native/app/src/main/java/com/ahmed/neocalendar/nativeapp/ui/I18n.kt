package com.ahmed.neocalendar.nativeapp.ui

import android.content.Context
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import com.ahmed.neocalendar.core.i18n.FrenchToEnglish
import com.ahmed.neocalendar.nativeapp.AppLanguage

/**
 * Le français de l'application vers l'anglais, d'après le dictionnaire de l'ancienne (`src/ui/i18n.ts`, la clé anglaise
 * EST le texte anglais) : `assets/i18n-fr-en.tsv`, une ligne `français<TAB>anglais`. Les textes propres au natif sont en bas
 * du fichier. Une entrée avec `{}` ou `{n}` est un modèle (« {n} événements » donne « 3 events »). En français (le défaut)
 * rien n'est traduit ni même cherché : c'est le texte écrit dans le code qui s'affiche.
 *
 * Écart assumé : la traduction se fait à l'affichage, sur le texte entier ; un texte composé d'un nom propre (un titre
 * d'évènement, un nom de calendrier) ne change que s'il est exactement une entrée du dictionnaire.
 */
object Translator {
    private var dictionary = FrenchToEnglish("")
    private val cache = HashMap<String, String>()

    fun load(context: Context) {
        dictionary = try {
            FrenchToEnglish(context.assets.open("i18n-fr-en.tsv").bufferedReader(Charsets.UTF_8).use { it.readText() })
        } catch (_: Exception) {
            // Sans dictionnaire l'anglais retombe sur le français : rien ne casse.
            FrenchToEnglish("")
        }
        cache.clear()
    }

    /** Le texte en anglais si la langue est English et que le dictionnaire le connaît ; sinon le texte tel quel. */
    fun tr(text: String): String {
        if (!AppLanguage.isEnglish || text.isEmpty()) return text
        return cache.getOrPut(text) { dictionary.translate(text) }
    }
}

/** `tr` pour les textes qui ne passent pas par `Text` (notifications, descriptions d'accessibilité). */
fun tr(text: String): String = Translator.tr(text)

/**
 * Le `Text` de Material 3, dont le texte passe par `Translator`. Tout l'écran natif l'emploie (les fichiers n'importent plus
 * celui de Material), c'est ce seul point qui fait que la langue choisie aux Réglages se voit partout.
 */
@Composable
fun Text(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textDecoration: TextDecoration? = null,
    textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1,
    onTextLayout: ((TextLayoutResult) -> Unit)? = null,
    style: TextStyle = LocalTextStyle.current,
) {
    androidx.compose.material3.Text(
        text = Translator.tr(text), modifier = modifier, color = color, fontSize = fontSize, fontStyle = fontStyle,
        fontWeight = fontWeight, fontFamily = fontFamily, letterSpacing = letterSpacing, textDecoration = textDecoration,
        textAlign = textAlign, lineHeight = lineHeight, overflow = overflow, softWrap = softWrap, maxLines = maxLines,
        minLines = minLines, onTextLayout = onTextLayout, style = style,
    )
}

/** Un texte mis en forme (spans) : tel quel, la traduction ne sait pas le découper. */
@Composable
fun Text(
    text: AnnotatedString,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontStyle: FontStyle? = null,
    fontWeight: FontWeight? = null,
    fontFamily: FontFamily? = null,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    textDecoration: TextDecoration? = null,
    textAlign: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    overflow: TextOverflow = TextOverflow.Clip,
    softWrap: Boolean = true,
    maxLines: Int = Int.MAX_VALUE,
    minLines: Int = 1,
    onTextLayout: (TextLayoutResult) -> Unit = {},
    style: TextStyle = LocalTextStyle.current,
) {
    androidx.compose.material3.Text(
        text = text, modifier = modifier, color = color, fontSize = fontSize, fontStyle = fontStyle,
        fontWeight = fontWeight, fontFamily = fontFamily, letterSpacing = letterSpacing, textDecoration = textDecoration,
        textAlign = textAlign, lineHeight = lineHeight, overflow = overflow, softWrap = softWrap, maxLines = maxLines,
        minLines = minLines, onTextLayout = onTextLayout, style = style,
    )
}

/** Le `Icon` de Material 3 (`ImageVector`), dont la description d'accessibilité passe par `Translator`. */
@Composable
fun Icon(
    imageVector: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = androidx.compose.material3.LocalContentColor.current,
) {
    androidx.compose.material3.Icon(
        imageVector = imageVector, contentDescription = contentDescription?.let { Translator.tr(it) }, modifier = modifier, tint = tint,
    )
}
