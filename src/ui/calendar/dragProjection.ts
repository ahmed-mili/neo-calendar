import {
    currentHourHeight,
    startOfDay,
    isMultiDayTimed,
} from "./CalendarUtils";

/** Pas de snap vertical, en minutes. Partage par le drag interne et le drag
    venu du panneau, pour que les deux tombent sur les memes creneaux. */
export const SNAP_MINUTES = 15;

/** Tolerance au-dessus de la bande all-day : le bord haut compte encore comme
    "dans la bande", sinon la derniere ligne de pixels est inatteignable. */
export const ALLDAY_BAND_SLOP_PX = 12;

/** Heure retenue quand la grille n'est pas mesurable (grille non montee). */
export const FALLBACK_DROP_HOUR = 9;

export interface ColumnRect {
    left: number;
    right: number;
    /** Minuit du jour de la colonne. */
    date: Date;
}

/** Rectangle en coordonnees viewport, reduit aux quatre bords : les fonctions
    pures n'ont jamais besoin du reste d'un DOMRect. */
export interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** Creneau d'atterrissage d'un lacher. Meme forme pour le drag venu du panneau
    et pour le drag interne de la grille. */
export interface DropSlot {
    start: Date;
    end: Date;
    allDay: boolean;
}

/** Geometrie de la grille lue a un instant donne, en coordonnees viewport.
    Toutes les fonctions de projection travaillent sur cet objet et jamais sur
    le DOM : c'est ce qui les rend testables sans navigateur. */
export interface GridGeometry {
    /** Haut de `.nc-days-row`, origine verticale des colonnes horaires. */
    daysRowTop: number | null;
    /** Bande all-day, si elle est montee. */
    allDayBand: { top: number; bottom: number } | null;
    columns: ColumnRect[];
    /** Zone reellement visible de la grille (`.nc-main-scroller`). Les rects des
        colonnes sont geometriques et debordent de cette zone : les jours de
        buffer vivent a gauche du bord visible, sous le rail des heures et sous
        le panneau. */
    viewport: Rect | null;
    /** Le panneau d'evenements quand il est monte. Il recouvre la grille (non
        epingle) ou la pousse a droite (epingle) ; dans les deux cas il n'est
        pas une cible de depot pour le drag venu du panneau. */
    panel: Rect | null;
}

const EMPTY: GridGeometry = {
    daysRowTop: null,
    allDayBand: null,
    columns: [],
    viewport: null,
    panel: null,
};

const toRect = (r: DOMRect): Rect => ({
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
});

/** Lit la geometrie courante de la grille. Seule fonction du module qui touche
    au DOM ; a rappeler a chaque mouvement, la grille scrolle. */
export function readGridGeometry(gridEl: HTMLElement | null): GridGeometry {
    if (!gridEl) return EMPTY;
    const daysEl = gridEl.querySelector(".nc-days-row") as HTMLElement | null;
    const bandEl = gridEl.querySelector(".nc-allday-row") as HTMLElement | null;
    const scrollerEl = gridEl.querySelector(
        ".nc-main-scroller"
    ) as HTMLElement | null;
    // Le panneau est un frere de la grille, hors du DndContext : introuvable
    // depuis gridEl, donc lu sur le document. Absent du DOM = panneau ferme.
    const panelEl = document.querySelector(".nc-cep") as HTMLElement | null;
    const panelRect = panelEl?.getBoundingClientRect();
    const bandRect = bandEl?.getBoundingClientRect();
    const columns: ColumnRect[] = [];
    for (const col of Array.from(gridEl.querySelectorAll(".nc-timegrid-day"))) {
        const iso = (col as HTMLElement).dataset.date;
        if (!iso) continue;
        const rect = col.getBoundingClientRect();
        columns.push({
            left: rect.left,
            right: rect.right,
            date: startOfDay(new Date(iso)),
        });
    }
    return {
        daysRowTop: daysEl ? daysEl.getBoundingClientRect().top : null,
        allDayBand: bandRect
            ? { top: bandRect.top, bottom: bandRect.bottom }
            : null,
        columns,
        viewport: scrollerEl
            ? toRect(scrollerEl.getBoundingClientRect())
            : null,
        // Un panneau ferme n'est pas une cible. Sur le bureau il quitte le DOM,
        // mais sur le telephone il reste monte, glisse hors de l'ecran par la
        // gauche : son bord droit tombe alors sur x = 0, et un doigt pousse
        // contre le bord de l'ecran suffisait a deplanifier l'evenement qu'il
        // tenait. Seul un panneau dont une partie est visible compte.
        panel:
            panelRect && panelRect.right > 0 && panelRect.width > 0
                ? toRect(panelRect)
                : null,
    };
}

/** Le pointeur est-il dans la zone visible de la grille ? Tout ce qui est
    dehors est soit clippe (jours de buffer, partie scrollee hors champ), soit
    couvert par un autre element (rail des heures, panneau, barre de statut
    d'Obsidian) : aucun cadre de depot n'y est visible, donc rien ne doit y etre
    ecrit. Sans viewport mesure on refuse : mieux vaut aucune ecriture qu'une
    ecriture a l'aveugle. */
export function isInsideViewport(
    geo: GridGeometry,
    pointerX: number | null,
    pointerY: number | null
): boolean {
    const v = geo.viewport;
    if (!v || pointerX === null || pointerY === null) return false;
    return (
        pointerX >= v.left &&
        pointerX <= v.right &&
        pointerY >= v.top &&
        pointerY <= v.bottom
    );
}

/** Le pointeur est-il au-dessus du panneau d'evenements ? Une seule definition
    pour les deux sens du drag : la grille s'en sert pour deplanifier, le
    panneau pour refuser de planifier sur lui-meme. */
export function isOverPanel(
    geo: GridGeometry,
    pointerX: number | null,
    pointerY: number | null
): boolean {
    const p = geo.panel;
    if (!p || pointerX === null || pointerY === null) return false;
    return (
        pointerX >= p.left &&
        pointerX <= p.right &&
        pointerY >= p.top &&
        pointerY <= p.bottom
    );
}

/** Le jour de la colonne sous le pointeur. Par les rects des colonnes, donc
    insensible au ghost qui flotte au-dessus. Une colonne dont le X est sorti du
    viewport est clippee a l'ecran : elle n'est pas une cible, meme si son rect
    contient encore le pointeur. */
export function columnDateUnderPointer(
    geo: GridGeometry,
    pointerX: number | null
): Date | null {
    if (pointerX === null) return null;
    const v = geo.viewport;
    if (v && (pointerX < v.left || pointerX > v.right)) return null;
    for (const col of geo.columns) {
        if (pointerX >= col.left && pointerX < col.right) {
            return new Date(col.date);
        }
    }
    return null;
}

/** Ou se trouve un pointeur, mesure en JOURS et non en pixels : la date de la
    colonne qu'il survole, et la fraction de cette colonne deja parcourue.

    C'est la seule lecture qui survive au defilement. Un delta en pixels dit de
    combien le doigt a bouge, pas de combien de jours : des que la grille se
    deplace sous lui — le glissement au bord, et le defilement infini qui
    re-base les dates derriere — les pixels et les jours ne parlent plus de la
    meme chose. Les colonnes, elles, portent leur date. */
export interface DayPosition {
    date: Date;
    /** 0 au bord gauche de la colonne, 1 au bord droit. */
    fraction: number;
}

export function dayPositionUnderPointer(
    geo: GridGeometry,
    pointerX: number | null
): DayPosition | null {
    if (pointerX === null) return null;
    const v = geo.viewport;
    if (v && (pointerX < v.left || pointerX > v.right)) return null;
    for (const col of geo.columns) {
        if (pointerX >= col.left && pointerX < col.right) {
            const width = col.right - col.left;
            return {
                date: new Date(col.date),
                fraction: width > 0 ? (pointerX - col.left) / width : 0,
            };
        }
    }
    return null;
}

/** De combien de jours on a bouge entre deux positions ainsi mesurees, ou
    `null` si l'une des deux manque — le pointeur est hors des colonnes, ou la
    grille n'etait pas mesurable au depart.

    La fraction est ce qui garde le point de saisie : attraper un evenement
    contre le bord droit de sa colonne ne doit pas le faire changer de jour au
    premier pixel. C'est le meme demi-jour de tolerance qu'un arrondi sur les
    pixels, exprime en jours. */
export function dayShiftFromAnchor(
    anchor: DayPosition | null | undefined,
    current: DayPosition | null | undefined
): number | null {
    if (!anchor || !current) return null;
    return Math.round(
        dayShiftBetween(anchor.date, current.date) +
            (current.fraction - anchor.fraction)
    );
}

/** L'heure sous le pointeur, en heures decimales, snappee et bornee au jour. */
export function computeDropHour(
    geo: GridGeometry,
    pointerY: number | null
): number {
    if (geo.daysRowTop === null || pointerY === null) return FALLBACK_DROP_HOUR;
    const hours = (pointerY - geo.daysRowTop) / currentHourHeight();
    const snapped = Math.round((hours * 60) / SNAP_MINUTES) * SNAP_MINUTES;
    const lastSlot = 23 * 60 + (60 - SNAP_MINUTES);
    return Math.max(0, Math.min(lastSlot, snapped)) / 60;
}

/** Le pointeur est-il sur la bande all-day ? */
export function isInAllDayBand(
    geo: GridGeometry,
    pointerY: number | null
): boolean {
    if (pointerY === null || !geo.allDayBand) return false;
    return (
        pointerY <= geo.allDayBand.bottom &&
        pointerY >= geo.allDayBand.top - ALLDAY_BAND_SLOP_PX
    );
}

/** Deplacer un all-day d'un jour a l'autre convertit l'evenement en bloc timed
    de cette duree quand on le lache dans la grille : il ne doit jamais y rester
    a la hauteur d'une journee entiere. */
export const ALLDAY_DRAG_DURATION_MS = 30 * 60 * 1000;

/** Nombre de jours CALENDAIRES entre deux instants. Une division par 86 400 000
    se tromperait aux changements d'heure, ou un jour dure 23 ou 25 heures. */
export function dayShiftBetween(from: Date, to: Date): number {
    const a = startOfDay(from);
    const b = startOfDay(to);
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Forme minimale dont la projection a besoin. DisplayEvent en est un
    sur-ensemble : la couche pure n'a pas a connaitre le reste. */
export interface DraggedEvent {
    start: Date;
    end: Date;
    allDay: boolean;
}

export interface GridDragOptions {
    /** La position, en jours, ou le geste a commence. Sans elle le decalage se
        deduit du delta en pixels, ce qui ne vaut que tant que la grille ne
        bouge pas sous le doigt. */
    anchor?: DayPosition | null;
    /** Decalage en jours a appliquer au lieu de lire la colonne sous le
        pointeur. Les membres d'une multi-selection n'ont PAS ete saisis : ils
        partagent le pointeur de l'evenement attrape, et lire la colonne sous ce
        pointeur les ferait tous atterrir sur un seul et meme jour, empiles.
        L'appelant projette donc d'abord l'evenement saisi, en deduit son
        decalage reel, puis l'impose ici aux autres. */
    dayShift?: number;
}

/**
 * Ou atterrit un evenement deplace DANS la grille. Projection unique, partagee
 * par l'apercu en direct et par l'ecriture au lacher, pour que ce qu'on voit
 * soit ce qu'on obtient. Trois regimes :
 *
 *   • source de la bande (all-day ou timed multi-jours) lachee dans la grille
 *     -> un bloc timed de 30 min, qui remplace la barre pleine largeur ;
 *   • timed lache sur la bande -> un all-day du jour vise ;
 *   • sinon -> un deplacement timed ordinaire, duree conservee.
 */
/** Le decalage horizontal du geste, en jours. */
function horizontalDayOffset(geo: GridGeometry, deltaX: number): number {
    // Sans colonne mesurable il n'y a pas de jour ou viser : mieux vaut ne pas
    // bouger horizontalement que deviner une largeur.
    const first = geo.columns[0];
    const columnWidth = first ? first.right - first.left : 0;
    return columnWidth ? Math.round(deltaX / columnWidth) : 0;
}

/**
 * De combien de JOURS l'evenement saisi se deplace. C'est la seule grandeur que
 * les autres membres d'une multi-selection ont le droit de partager : elle exclut
 * l'effet d'un snap qui franchit minuit, lequel est propre a chaque evenement.
 *
 * Une barre de la bande all-day peut etre attrapee n'importe ou sur sa largeur,
 * donc son jour d'arrivee se lit sur la colonne sous le pointeur et non sur le
 * delta. Cette lecture n'a de sens que pour l'evenement reellement attrape.
 */
export function gridDragDayShift(
    geo: GridGeometry,
    ev: DraggedEvent,
    delta: { x: number; y: number },
    pointerX: number | null,
    anchor?: DayPosition | null
): number {
    if (ev.allDay || isMultiDayTimed(ev)) {
        const column = columnDateUnderPointer(geo, pointerX);
        if (column) return dayShiftBetween(startOfDay(ev.start), column);
        return horizontalDayOffset(geo, delta.x);
    }
    // Les colonnes d'abord : elles portent leur date, donc elles disent la
    // verite meme quand la grille a tourne des pages sous le doigt. Le delta en
    // pixels reste la reponse quand le pointeur n'est sur aucune colonne — hors
    // du viewport, sur le rail des heures — ou quand rien n'etait mesurable au
    // depart du geste.
    const measured = dayShiftFromAnchor(
        anchor,
        dayPositionUnderPointer(geo, pointerX)
    );
    return measured ?? horizontalDayOffset(geo, delta.x);
}

export function projectGridDrag(
    geo: GridGeometry,
    ev: DraggedEvent,
    delta: { x: number; y: number },
    pointerX: number | null,
    pointerY: number | null,
    opts: GridDragOptions = {}
): DropSlot {
    // Un seul decalage de jours pour tout le reste de la fonction. Impose par
    // l'appelant pour les membres d'une multi-selection, sinon deduit du geste.
    const shift =
        opts.dayShift ??
        gridDragDayShift(geo, ev, delta, pointerX, opts.anchor);
    const dayFrom = (d: Date): Date => {
        const day = startOfDay(d);
        day.setDate(day.getDate() + shift);
        return day;
    };

    const inBand = isInAllDayBand(geo, pointerY);
    const bandSourced = ev.allDay || isMultiDayTimed(ev);

    if (bandSourced) {
        // Le pointeur est encore sur la bande : on y reste. Sortir vers la
        // grille puis se raviser et revenir ne doit pas convertir l'evenement.
        if (inBand) {
            if (ev.allDay) {
                const day = dayFrom(ev.start);
                const end = new Date(day);
                end.setDate(end.getDate() + 1);
                return { start: day, end, allDay: true };
            }
            // Barre multi-jours timed : on la translate en bloc, heures et
            // etendue conservees.
            const start = new Date(ev.start);
            start.setDate(start.getDate() + shift);
            const end = new Date(ev.end);
            end.setDate(end.getDate() + shift);
            return { start, end, allDay: false };
        }
        // Lache dans la grille : la barre se replie en un bloc de 30 min.
        const start = dayFrom(ev.start);
        start.setMinutes(Math.round(computeDropHour(geo, pointerY) * 60));
        return {
            start,
            end: new Date(start.getTime() + ALLDAY_DRAG_DURATION_MS),
            allDay: false,
        };
    }

    if (inBand) {
        // Timed -> all-day. Le jour vient du decalage du geste, jamais de
        // startOfDay(newStart) : l'heure projetee peut franchir minuit et faire
        // atterrir l'evenement un jour trop tot.
        const day = dayFrom(ev.start);
        const end = new Date(day);
        end.setDate(end.getDate() + 1);
        return { start: day, end, allDay: true };
    }

    // Deplacement timed ordinaire, duree conservee.
    const duration = ev.end.getTime() - ev.start.getTime();
    const snappedMinutes =
        Math.round(((delta.y / currentHourHeight()) * 60) / SNAP_MINUTES) *
        SNAP_MINUTES;
    const start = new Date(ev.start);
    start.setDate(start.getDate() + shift);
    start.setTime(start.getTime() + snappedMinutes * 60000);
    return {
        start,
        end: new Date(start.getTime() + duration),
        allDay: false,
    };
}

/** Ou tomberait un lacher venu du panneau, ou `null` si nulle part de valide.
    Toute la decision d'ecriture du drag panneau -> grille est ici, dans la
    couche pure : le hook ne fait que lire la geometrie et transmettre. */
export function projectPanelDrop(
    geo: GridGeometry,
    pointerX: number | null,
    pointerY: number | null,
    durationMs: number
): DropSlot | null {
    // Hors de la zone visible (jour de buffer, rail des heures, sous la
    // grille) ou au-dessus du panneau : annulation, aucune ecriture.
    if (!isInsideViewport(geo, pointerX, pointerY)) return null;
    if (isOverPanel(geo, pointerX, pointerY)) return null;
    const day = columnDateUnderPointer(geo, pointerX);
    if (!day) return null;
    if (isInAllDayBand(geo, pointerY)) {
        const end = new Date(day);
        end.setDate(end.getDate() + 1);
        return { start: day, end, allDay: true };
    }
    // Sous la bande mais au-dessus de la premiere heure : pas une cible.
    if (geo.daysRowTop === null || pointerY === null) return null;
    if (pointerY < geo.daysRowTop) return null;
    const start = new Date(day);
    start.setMinutes(Math.round(computeDropHour(geo, pointerY) * 60));
    return {
        start,
        end: new Date(start.getTime() + durationMs),
        allDay: false,
    };
}
