# Android : défilement à élan et sélecteur de mois — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un lancer horizontal garde l'élan du doigt, emporte plusieurs jours selon sa force (7 au plus) et s'arrête pile sur un jour sans recul ; le sélecteur de mois devient une pièce en verre qui pousse la grille et surligne les jours affichés.

**Architecture:** Les décisions (jour cible, courbe de glisse) sont des fonctions pures dans `core/grid`, testées en JUnit. `GridState`/`gridDrag` (app) les appliquent : projection de la distance par la décroissance spline déjà fournie (`decay.calculateTargetValue`), animation à décélération constante qui part de la vitesse du doigt, élan résiduel conservé d'un geste au suivant. Le sélecteur passe de la couche superposée à la `Column` qui porte déjà `neoGlass()`.

**Tech Stack:** Kotlin, Jetpack Compose (foundation gestures, animation core), JUnit 4 (module `core`, JVM pur).

**Spec:** `docs/superpowers/specs/2026-10-28-android-defilement-et-selecteur-de-mois-design.md`

## Global Constraints

- Android natif seulement (`apps/android/native`) ; le bureau n'est pas touché.
- Réglage `freeScroll` : comportement strictement inchangé, nom inchangé.
- Plafond : 7 jours par lancer, comptés depuis la position au lâcher.
- Seuils en jours et jours/seconde (jamais en px) : `SNAP_DISTANCE_DAYS = 0.25`, `SNAP_VELOCITY_DAYS_PER_SECOND = 1.2` existants, réutilisés.
- Rien de neuf avant le premier écran ; le sélecteur n'est pas composé tant qu'il est fermé.
- Commentaires du code en français, dans le ton des voisins ; messages de commit en anglais, impératif, ≤ 60 caractères, suivis de la seule ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (jamais de ligne `Claude-Session`).
- Tests `core` : `cd apps/android/native; .\gradlew.bat --no-daemon :core:test` (JAVA_HOME = JDK 17 déjà posé ; si Gradle refuse la JVM, `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"`).
- Compilation app : `.\gradlew.bat --no-daemon :app:compileReleaseKotlin` (après avoir copié `C:\dev\neo-calendar\apps\android\native\local.properties` dans le worktree s'il manque).

## Review Focus

1. Lancer pendant un **calage lent** (animation sans élan) : l'élan résiduel ne doit pas être cumulé (seule une glisse à élan transmet sa vitesse) — test dans la tâche 1 (`carriedVelocity` à 0) et vérif tâche 4.
2. **Geste vertical** commencé sur une grille qui glissait horizontalement : la grille ne doit pas rester entre deux jours — tâche 2, étape dédiée.
3. **Appui sur un évènement pendant une glisse** : doit freiner sans ouvrir l'évènement (contrat existant de `isGliding`, `GridTouch.kt:344`, `AllDayBand.kt:177`) — l'animation de calage après un appui doit garder `isGliding` vrai ; vérif tâche 4.
4. **Vue à N jours chevauchant deux semaines** (samedi → lundi) et `dayCount` grand (jusqu'à 60) : la bande du sélecteur se coupe en segments par rangée et se limite aux 6 rangées affichées — tests tâche 3.
5. **Lancer très faible mais au-dessus du seuil** (1,2 à 2 jours/s, cible à moins d'un jour) : la durée ne doit pas exploser — test `glideDurationMs` tâche 1.

---

### Task 1: Fonctions pures du lancer (core)

**Files:**
- Modify: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/grid/GridGestures.kt`
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/grid/GridTest.kt`

**Interfaces:**
- Produces :
  - `const val FLING_MAX_DAYS = 7`
  - `fun flingTargetDay(startDay: Long, position: Double, projected: Double, velocityDaysPerSecond: Double): Long`
  - `fun glideDurationMs(distanceDays: Double, velocityDaysPerSecond: Double): Int`
  - `fun glideProgress(s: Double, m0: Double): Double` et `fun glideSlope(s: Double, m0: Double): Double` (dérivée par rapport à `s`)
- `snapTargetDay` reste, inchangée (utilisée pour le cas sans élan).

Règles de `flingTargetDay` (positions en jours, `startDay` = jour le plus proche au DOWN, `position` = position au lâcher, `projected` = position + distance de la décroissance spline) :
- `|v| < SNAP_VELOCITY_DAYS_PER_SECOND` (sans élan) : si `|position − startDay| < 1` → `snapTargetDay(startDay, position − startDay, 0.0)` (comportement actuel), sinon `nearestDay(position)`.
- avec élan, `v > 0` : `t = max(nearestDay(projected), ceil(position))`, puis `min(t, floor(position + FLING_MAX_DAYS))`. Symétrique pour `v < 0` (`min(nearestDay(projected), floor(position))`, puis `max(t, ceil(position − FLING_MAX_DAYS))`).
- Conséquence : jamais derrière la position du lâcher dans le sens du geste (aucun recul), au moins le jour suivant.

Courbe de glisse (Hermite cubique, pente de départ `m0`, pente d'arrivée 0) :
`glideProgress(s, m0) = (s³ − 2s² + s)·m0 + (−2s³ + 3s²)` ; avec `m0 = v·T/d`. `glideDurationMs(d, v)` : `T = 2·d/|v|` (décélération constante, `m0 = 2`), borné à `[150, 900]` ms ; si la borne basse donnerait `m0 > 3` (dépassement), prendre `T = 3·d/|v|` à la place. `d ≤ 0` ou `v = 0` → 260.

- [ ] **Step 1: Write the failing tests** (dans `GridTest.kt`)

```kotlin
@Test fun flingWithoutMomentumKeepsOneDayRule() {
    assertEquals(11L, flingTargetDay(10, 10.3, 10.3, 0.5))
    assertEquals(10L, flingTargetDay(10, 10.1, 10.1, 0.0))
    // Un long glisser lent se cale sur le jour le plus proche : pas de recul de 0,6 jour.
    assertEquals(12L, flingTargetDay(10, 11.6, 11.6, 0.0))
}
@Test fun flingFollowsProjectionAndNeverRecoils() {
    assertEquals(13L, flingTargetDay(10, 11.6, 13.2, 8.0))
    // Projection en deçà de la position : au moins le jour suivant dans le sens du geste.
    assertEquals(12L, flingTargetDay(10, 11.6, 11.7, 3.0))
    assertEquals(8L, flingTargetDay(10, 9.6, 8.4, -6.0))
    assertEquals(9L, flingTargetDay(10, 9.6, 9.5, -2.0))
    assertEquals(11L, flingTargetDay(10, 10.05, 10.1, 2.0))
}
@Test fun flingIsCappedAtSevenDaysFromRelease() {
    assertEquals(18L, flingTargetDay(10, 11.6, 40.0, 30.0))
    assertEquals(3L, flingTargetDay(10, 9.4, -30.0, -30.0))
}
@Test fun glideCurveStartsAtFingerSpeedAndStopsFlat() {
    assertEquals(0.0, glideProgress(0.0, 2.0), 1e-9)
    assertEquals(1.0, glideProgress(1.0, 2.0), 1e-9)
    assertEquals(2.0, glideSlope(0.0, 2.0), 1e-9)
    assertEquals(0.0, glideSlope(1.0, 2.0), 1e-9)
    // Monotone pour m0 entre 0 et 3 : jamais de dépassement.
    for (m0 in listOf(0.0, 1.0, 2.0, 3.0)) for (i in 0..100) assertTrue(glideSlope(i / 100.0, m0) >= -1e-9)
}
@Test fun glideDurationStaysBounded() {
    assertEquals(500, glideDurationMs(3.0, 12.0))      // 2·3/12 s
    assertEquals(900, glideDurationMs(1.0, 1.3))       // borne haute
    assertTrue(glideDurationMs(0.2, 30.0) <= 150)      // borne basse, m0 ≤ 3
    assertEquals(260, glideDurationMs(0.0, 5.0))
}
```

- [ ] **Step 2: Run** `.\gradlew.bat --no-daemon :core:test --tests "*GridTest*"` — Expected: FAIL (références non résolues).
- [ ] **Step 3: Implement** les quatre fonctions et la constante dans `GridGestures.kt`, avec un commentaire français court par fonction (le pourquoi : pas de recul, plafond d'Ahmed du 2026-10-28, pente de départ = vitesse du doigt). Mettre à jour le KDoc de `snapTargetDay` : elle ne sert plus qu'au geste sans élan.
- [ ] **Step 4: Run** `.\gradlew.bat --no-daemon :core:test` — Expected: PASS (toute la suite core).
- [ ] **Step 5: Commit** `git commit -m "Compute fling target day and glide curve in core"`

---

### Task 2: Lancer à élan dans GridState et gridDrag

**Files:**
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/GridState.kt` (settleToDay, animateOffsetTo, gridDrag l.123-251)

**Interfaces:**
- Consumes : `flingTargetDay`, `glideDurationMs`, `glideProgress`, `glideSlope`, `nearestDay` (tâche 1).
- Produces (même fichier, utilisés par rien d'autre) :
  - `fun GridState.takeCarriedVelocity(): Float` — vitesse (jours/s) de la glisse à élan en cours, 0 sinon ; appelée au DOWN avant `cancelAnimations()`.
  - `fun settleToDay(scope, startIdx: Long, startOffset: Float, velocityPxPerSec: Float, decay: DecayAnimationSpec<Float>, carriedDaysPerSec: Float)` remplace l'ancienne signature.
  - `fun settleToNearest(scope)`.

Comportement à coder :
1. **Glisse à élan** : `glideTo(scope, target: Float, velocityDays: Float)` lance `animate(0f, 1f, tween(glideDurationMs, easing = LinearEasing))` et pose `offsetDays = start + (target − start)·glideProgress(s, m0)` ; tient à jour un champ privé `glideVelocityDays` = `(target − start)/T · glideSlope(s, m0)` (signe compris) pendant l'animation, remis à 0 à la fin normale ou à l'annulation par un calage sans élan. `isGliding` reste vrai pendant toute l'animation (même `horizontalJob`).
2. **Au lâcher, hors `freeScroll`** : `v = −velocityPxPerSec / columnWidthPx` ; si `carried` est non nul et du même signe que `v` et `|v| ≥ SNAP_VELOCITY_DAYS_PER_SECOND`, `v += carried` ; sinon l'élan résiduel est abandonné. `projected = decay.calculateTargetValue(offsetDays·col, v·col)/col` (en px puis ramené en jours ; attention aux signes : `offsetDays` croît vers le futur quand le doigt va vers la gauche). Cible = `flingTargetDay(startIdx, offsetDays, projected, v)`. Si `|v| ≥ seuil` → `glideTo` ; sinon l'ancien `tween(260, FastOutSlowInEasing)` (aucun élan à prolonger).
3. **Au DOWN** : `val carried = state.takeCarriedVelocity()` puis `state.cancelAnimations()` (la grille s'arrête net sous le doigt, sans saut).
4. **Doigt levé sans mouvement** (`slop == null`) ou geste `ignored` : si `!freeScroll` et la grille n'est pas sur un jour entier (`abs(offsetDays − round(offsetDays)) > 0.001`), `settleToNearest(scope)`.
5. **Geste vertical** (`!horizontal`) : même règle que 4 au début du défilement vertical, pour qu'une glisse horizontale interrompue ne reste pas entre deux jours (Review Focus 2).
6. `freeScroll` : `flingFree` inchangé, aucun calage ajouté.
7. `goTo` et `animateOffsetTo` restent utilisables par les autres appelants ; adapter `settleToDay` et l'appel dans `gridDrag` à la nouvelle signature (le `decay` est déjà un paramètre de `gridDrag`).

- [ ] **Step 1:** Implémenter 1 à 7. Garder `dragX` tel quel (le suivi du doigt sans résistance est voulu).
- [ ] **Step 2: Compile** `.\gradlew.bat --no-daemon :app:compileReleaseKotlin` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 3: Run** `.\gradlew.bat --no-daemon :core:test` — Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "Carry finger momentum across days in the grid"`

---

### Task 3: Bande des jours affichés (core) et MiniCalendar

**Files:**
- Create: `apps/android/native/core/src/main/kotlin/com/ahmed/neocalendar/core/grid/MonthHighlight.kt`
- Test: `apps/android/native/core/src/test/kotlin/com/ahmed/neocalendar/core/grid/MonthHighlightTest.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/MiniCalendar.kt`

**Interfaces:**
- Produces :
  - `data class HighlightSegment(val row: Int, val fromCol: Int, val toCol: Int)` (bornes incluses, colonnes 0..6)
  - `fun highlightSegments(gridStart: LocalDate, rows: Int, first: LocalDate, count: Int): List<HighlightSegment>`
  - `MiniCalendar(anchor, firstDay, onSelect, modifier, showHeader, cellHeight, highlightFirst: LocalDate, highlightCount: Int)` — remplace la bande « semaine d'aujourd'hui ».

- [ ] **Step 1: Write the failing tests** (`MonthHighlightTest.kt`), grille de novembre 2026 commençant le lundi 2026-10-26 :

```kotlin
private val start = LocalDate.of(2026, 10, 26)
@Test fun threeDaysInOneRow() = assertEquals(listOf(HighlightSegment(0, 2, 4)), highlightSegments(start, 6, LocalDate.of(2026, 10, 28), 3))
@Test fun splitsAcrossWeeks() = assertEquals(
    listOf(HighlightSegment(0, 5, 6), HighlightSegment(1, 0, 0)),
    highlightSegments(start, 6, LocalDate.of(2026, 10, 31), 3))
@Test fun clipsToVisibleRows() {
    val segs = highlightSegments(start, 6, LocalDate.of(2026, 10, 20), 60)
    assertEquals(HighlightSegment(0, 0, 6), segs.first())
    assertEquals(5, segs.last().row)
    assertEquals(6, segs.size)
}
@Test fun outsideTheGridGivesNothing() = assertTrue(highlightSegments(start, 6, LocalDate.of(2027, 1, 10), 3).isEmpty())
```

- [ ] **Step 2: Run** `.\gradlew.bat --no-daemon :core:test --tests "*MonthHighlightTest*"` — Expected: FAIL.
- [ ] **Step 3: Implement** `highlightSegments` (commentaire français : la bande suit les jours de la grille, pas la semaine d'aujourd'hui).
- [ ] **Step 4: Run** `:core:test` — Expected: PASS.
- [ ] **Step 5: MiniCalendar** : retirer le fond de rangée `isCurrentWeek` ; dessiner un fond `Neo.HighlightWeek`, coins 9 dp, derrière chaque segment (de la colonne `fromCol` à `toCol` de sa rangée). Chaque segment anime ses bords gauche et droit en 120 ms (`animateFloatAsState`), et un segment qui apparaît ou disparaît fait un fondu de 120 ms. La pastille d'aujourd'hui reste par-dessus. Mettre à jour le KDoc (« La semaine en cours est une bande continue… »). Le `month` local garde sa clé `remember(YearMonth.from(anchor))` (il suit déjà la grille quand elle change de mois).
- [ ] **Step 6: Compile** `:app:compileReleaseKotlin` — Expected: BUILD SUCCESSFUL (l'appel de `MonthSheet` est mis à jour à la tâche 4 ; d'ici là, des valeurs par défaut `highlightFirst = anchor, highlightCount = 1` évitent de casser la compilation, à retirer en tâche 4).
- [ ] **Step 7: Commit** `git commit -m "Highlight the grid's visible days in the month picker"`

---

### Task 4: Sélecteur en verre, dans le flux

**Files:**
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/MonthSheet.kt`
- Modify: `apps/android/native/app/src/main/java/com/ahmed/neocalendar/nativeapp/ui/NativeScreen.kt:505-600`

**Interfaces:**
- Consumes : `MiniCalendar(..., highlightFirst, highlightCount)` (tâche 3) ; `nearest`, `anchor`, `dayCount`, `monthOpen` déjà présents dans `NativeScreen`.
- Produces : `MonthSheet(visible: Boolean, anchor: LocalDate, firstDay: Int, highlightCount: Int, onSelect: (LocalDate) -> Unit)` — plus de `onDismiss` ni de voile.

- [ ] **Step 1: MonthSheet** : supprimer le voile cliquable, `cssShadow`, `background(Neo.Surface)` et le trait du bas. Une seule `AnimatedVisibility(visible, enter = expandVertically(tween(170)) + fadeIn(tween(170)), exit = shrinkVertically(tween(120)) + fadeOut(tween(120)))` autour du `MiniCalendar` (mêmes paddings 12/12/2/13 dp). `highlightFirst = anchor`, `highlightCount = highlightCount`. KDoc : posé dans le flux, sur le verre de l'écran ; seuls le titre du mois, le retour et un jour le ferment.
- [ ] **Step 2: NativeScreen** : retirer l'appel superposé (`Box(Modifier.padding(top = Neo.TopBarHeight)) { MonthSheet(...) }`, l.584-596) et appeler `MonthSheet(visible = monthOpen, anchor = anchor, firstDay = data.firstDay, highlightCount = dayCount, onSelect = { grid.goTo(scope, it); monthOpen = false })` dans la `Column`, entre le `Box` de la `TopBar` et le `Box(Modifier.weight(1f))` de la grille. Retirer les valeurs par défaut temporaires de la tâche 3.
- [ ] **Step 3: Compile** `:app:compileReleaseKotlin` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 4: Commit** `git commit -m "Open the month picker in place on the glass"`

---

### Task 5: Vérification sur le téléphone

Pas de code produit, sauf correctif si une mesure échoue (repasser alors par la tâche concernée).

- [ ] **Step 1: Build** depuis la racine du worktree : `powershell -File BUILD_ANDROID.ps1` (release signée, jamais debug). Installer : `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s SGPZQ84XNFDQBE8L install -r <apk release>`. Mesurer le lancement à froid avant (1.92.1 installée) puis après, selon `docs/superpowers/specs/2026-10-02-android-lancement-rapide-design.md` ; régression = blocage.
- [ ] **Step 2: Mesures** avec le protocole de la spec (gestes `input motionevent` dans un seul `adb shell`, vidéo `screenrecord`, position par images, `dumpsys gfxinfo`), en vue 3 jours, zone vide de la grille. Remplir le tableau « Cible chiffrée » de la spec avec les valeurs obtenues. Vérifier aussi : appui sur un évènement pendant une glisse ne l'ouvre pas ; geste vertical après un lancer laisse la grille sur un jour entier ; `freeScroll` inchangé si on l'active puis le désactive (remettre la valeur d'origine).
- [ ] **Step 3: Sélecteur** : captures ouvert / fermé et vidéo d'ouverture ; vérifier le verre (pas de dalle opaque), les noms de jours de la grille visibles sous le sélecteur, la bande sur les jours affichés et son déplacement pendant un défilement, le changement de mois par glisser dans le sélecteur. Images dans le scratchpad de la session, jamais dans le dépôt.
- [ ] **Step 4:** Rapport chiffré ; aucune suppression ni création d'évènement sur le téléphone ; laisser l'app sur aujourd'hui.
