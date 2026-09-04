# Autocomplétion de la saisie et translittération arabe

Design validé le 2026-09-04.

## Ce qu'on veut

Deux gestes, une seule touche.

1. **Compléter** ce qu'Ahmed est en train de taper à partir de ce qu'il a déjà
   écrit : « Cours de ma » propose « Cours de mathématiques ».
2. **Écrire l'arabe en arabe** : « doua » devient `دعاء`.

Les deux se prennent avec Tab, les deux se coupent dans les réglages, et
aucun des deux n'existe sur téléphone — Android a son propre clavier, qui
complète déjà et qui écrit l'arabe quand on le lui demande.

## Ce qu'on ne fait pas

- Rien sur Android. `isAndroidRuntime()` coupe court.
- Rien dans la description ni dans les tâches : Tab et l'espace y écrivent et
  y formatent déjà.
- Aucun journal de frappe. Le calendrier sait déjà ce qui a été écrit ; un
  fichier de plus serait un fichier de plus à purger, à exclure de Syncthing
  et à expliquer.
- Aucune translittération par règles phonétiques. « doua » écrit lettre à
  lettre donne `دوا` : ni la hamza ni le ʿayn ne s'entendent dans le latin, et
  une orthographe fausse proposée avec aplomb est pire que rien.

## Les pièces

### 1. Le moteur — `src/ui/calendar/inputSuggest.ts`

Une fonction pure, sans DOM ni état :

```ts
export interface SuggestionSources {
    corpus: readonly CorpusEntry[];
    dictionary: ReadonlyMap<string, string>;
}

export interface Suggestion {
    /** Ce qui remplace le texte, une fois Tab pressé. */
    value: string;
    /** Ce qui s'écrit en gris, après ce qui est déjà tapé. */
    ghost: string;
    kind: "completion" | "arabic";
}

export function suggestionFor(
    text: string,
    caret: number,
    sources: SuggestionSources
): Suggestion | null;
```

Deux règles, dans cet ordre :

**L'arabe d'abord.** Le mot sous le curseur est cherché dans le dictionnaire,
comparé sans casse ni diacritiques (`normaliseLatin`, qui replie
`NFD` et retire les marques). S'il est trouvé, la suggestion remplace ce mot
seul : `value` est le texte entier avec `دعاء` à la place de `doua`, `ghost`
vaut `دعاء`. Un mot exactement reconnu est une intention plus précise qu'un
préfixe : c'est pourquoi il passe devant.

**La complétion ensuite.** Le texte du début du champ jusqu'au curseur sert de
préfixe sur le corpus. La première entrée qui commence par ce préfixe (sans
casse, sans accents) et qui n'y est pas égale donne la suggestion : `value`
est l'entrée entière, `ghost` en est le reste.

Rien n'est proposé quand : le curseur n'est pas en fin de texte (compléter au
milieu d'une phrase écraserait ce qui suit), le préfixe fait moins de deux
caractères, ou le champ est vide.

Le moteur ne sait rien des réglages : c'est le hook qui lui passe un corpus
vide quand la complétion est coupée, un dictionnaire vide quand la conversion
l'est, et rien du tout sur Android. Une source vide ne propose rien — il n'y a
donc qu'un seul chemin à tester.

### 2. Le corpus — `src/ui/calendar/inputCorpus.ts`

`EventStore` tient déjà tous les évènements. Un sélecteur mémoïsé en tire deux
listes — les titres, les lieux — chacune avec :

```ts
interface CorpusEntry {
    value: string;
    /** Combien de fois cette exacte chaîne a été écrite. */
    count: number;
    /** Le plus récent des évènements qui la portent, en ms. */
    latest: number;
}
```

Classées par `count` décroissant, puis par `latest` décroissant. Ce qui
revient toutes les semaines passe devant ce qui n'a servi qu'une fois, et à
égalité c'est le plus frais qui gagne. Les entrées vides ou d'un seul
caractère sont écartées.

Le corpus est recalculé quand les évènements changent, pas à chaque frappe.

### 3. Le dictionnaire — `src/ui/calendar/arabicWords.ts`

Une table `latin → arabe` livrée avec l'application, chaque mot arabe étant
associé à ses graphies latines courantes (`doua`, `dua`, `du3a` → `دعاء`).
Une cinquantaine d'entrées : les prières et leurs heures, le vocabulaire du
Ramadan, les formules. Elles sont écrites en toutes lettres dans le fichier,
jamais dérivées d'une règle.

Les paires ajoutées par Ahmed dans les réglages priment sur celles-là : une
clé qu'il redéfinit remplace la mienne.

### 4. Le fantôme — `src/ui/calendar/useInputSuggestion.ts`

Un hook qui rend l'état d'affichage et les gestionnaires à poser sur un
`<input>`. Il ne rend rien lui-même.

Le champ passe dans un conteneur `position: relative`, et reçoit une doublure
en `position: absolute; pointer-events: none;` qui porte exactement la même
typographie. Elle écrit le texte déjà tapé en `color: transparent`, puis la
suggestion en `--nc-text-faint` : l'alignement est juste parce que c'est la
même chaîne qui pousse le fantôme devant elle. `white-space: pre` garde les
espaces.

Ce qui coupe le fantôme :

- Le texte déborde du champ (`input.scrollLeft > 0`, ou la doublure mesure
  plus large que le champ) : un fantôme à moitié coupé ne veut rien dire.
- La suggestion est vide.
- Le réglage est coupé, ou on est sur Android.

**Tab n'est capté que s'il y a un fantôme affiché.** Sans fantôme, il navigue
d'un champ à l'autre comme aujourd'hui — le comportement d'un formulaire ne
change pas pour ceux qui n'utilisent pas la fonction. Échap écarte la
suggestion pour la frappe en cours sans fermer le panneau (l'événement est
consommé, `usePopupDismiss` ne le voit pas).

Pour l'arabe, la doublure montre `doua دعاء` : le latin tel qu'il est écrit,
l'arabe en gris juste à côté, et Tab échange les deux. L'arabe étant écrit
dans un nœud statique et non dans le champ, le mélange de directions ne
déplace pas le curseur de saisie.

### 5. Là où ça s'applique

`TitleRow` et `LocationRow` (`src/ui/calendar/EventPanelRows.tsx`). Les deux
gardent leur signature actuelle ; le hook s'y branche et ne fait rien quand
il est éteint.

### 6. Les réglages

Deux interrupteurs, au repos allumés :

| Clé | Libellé | Repos |
|---|---|---|
| `inputCompletion` | Compléter au fil de la frappe | `true` |
| `arabicTransliteration` | Convertir l'arabe à la touche Tab | `true` |
| `arabicWords` | (le tableau de paires personnelles) | `{}` |

Ils vivent dans `DesktopWorkspacePreferences` (côté partagé, donc suivis d'une
machine à l'autre) et dans `NeoCalendarSettings`, avec le même repos des deux
côtés — comme `defaultEventsAsTasks` le fait déjà.

Sous le second interrupteur, un petit tableau ajoute des paires
`latin → arabe`, chacune supprimable. Il ne s'affiche que si la conversion est
allumée.

## Tests

Le module pur porte l'essentiel :

- l'arabe passe devant la complétion quand les deux répondent ;
- « doua », « Doua » et « douâ » trouvent tous `دعاء` ;
- un préfixe d'un caractère ne propose rien ;
- un curseur au milieu du texte ne propose rien ;
- le corpus classe par fréquence, puis par récence ;
- une entrée égale au texte déjà tapé ne propose rien ;
- une paire personnelle remplace celle qui est livrée.

Puis sur `TitleRow` :

- Tab avec un fantôme accepte et laisse le curseur au bout ;
- Tab sans fantôme ne fait rien de particulier (l'évènement n'est pas
  `preventDefault`) ;
- Échap écarte le fantôme sans fermer le panneau ;
- rien n'est proposé quand `isAndroidRuntime()` est vrai ;
- rien n'est proposé quand le réglage est coupé.

Et un test de style qui garde la doublure alignée sur le champ : même
`font-size`, même `font-weight`, même `padding`, `pointer-events: none`.

## Ce qui reste à vérifier à l'œil

Le rendu du gris sur les deux thèmes, et le fantôme arabe dans un champ
latin : c'est le seul endroit où deux directions d'écriture se croisent, et
aucun test ne juge de ça.
