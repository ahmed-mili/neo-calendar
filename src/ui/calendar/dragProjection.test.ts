import {
    ALLDAY_BAND_SLOP_PX,
    FALLBACK_DROP_HOUR,
    GridGeometry,
    columnDateUnderPointer,
    computeDropHour,
    isInAllDayBand,
    isInsideViewport,
    isOverPanel,
    projectPanelDrop,
    projectGridDrag,
    dayShiftBetween,
} from "./dragProjection";

// HOUR_HEIGHT vaut 60 px : une heure = 60 px, un cran de 15 min = 15 px.
const geo = (over: Partial<GridGeometry> = {}): GridGeometry => ({
    daysRowTop: 100,
    allDayBand: { top: 40, bottom: 80 },
    columns: [
        { left: 0, right: 100, date: new Date(2026, 6, 20) },
        { left: 100, right: 200, date: new Date(2026, 6, 21) },
    ],
    viewport: { left: 0, right: 200, top: 0, bottom: 400 },
    panel: null,
    ...over,
});

// Geometrie proche de la production, panneau NON epingle (il flotte au-dessus
// de la grille) : colonnes de 130 px comme en vue Semaine, les 3 jours de
// buffer scrolles hors champ a gauche du bord visible (304), et le panneau
// (320 px) recouvrant le rail des heures et le debut des colonnes visibles.
const live = (over: Partial<GridGeometry> = {}): GridGeometry => ({
    daysRowTop: 200,
    allDayBand: { top: 150, bottom: 190 },
    columns: [
        { left: -86, right: 44, date: new Date(2026, 6, 17) },
        { left: 44, right: 174, date: new Date(2026, 6, 18) },
        { left: 174, right: 304, date: new Date(2026, 6, 19) },
        { left: 304, right: 434, date: new Date(2026, 6, 20) },
        { left: 434, right: 564, date: new Date(2026, 6, 21) },
        { left: 564, right: 694, date: new Date(2026, 6, 22) },
    ],
    viewport: { left: 304, right: 1000, top: 120, bottom: 800 },
    panel: { left: 240, right: 560, top: 100, bottom: 800 },
    ...over,
});

const HALF_HOUR_MS = 30 * 60 * 1000;

describe("columnDateUnderPointer", () => {
    it("renvoie la date de la colonne contenant le pointeur", () => {
        expect(columnDateUnderPointer(geo(), 150)).toEqual(
            new Date(2026, 6, 21)
        );
    });

    it("prend la colonne de gauche exactement sur sa frontiere droite", () => {
        // Bornes [left, right) : 100 appartient a la deuxieme colonne.
        expect(columnDateUnderPointer(geo(), 100)).toEqual(
            new Date(2026, 6, 21)
        );
        expect(columnDateUnderPointer(geo(), 99)).toEqual(
            new Date(2026, 6, 20)
        );
    });

    it("renvoie null hors de toute colonne", () => {
        expect(columnDateUnderPointer(geo(), 500)).toBeNull();
    });

    it("renvoie null quand le pointeur est inconnu", () => {
        expect(columnDateUnderPointer(geo(), null)).toBeNull();
    });

    it("refuse une colonne de buffer sortie du viewport", () => {
        // x = 200 tombe dans le rect du 18 juillet, mais ce rect est scrolle
        // hors champ (viewport.left = 304) : la colonne est clippee, invisible.
        expect(columnDateUnderPointer(live(), 200)).toBeNull();
    });

    it("accepte une colonne visible de la meme geometrie", () => {
        expect(columnDateUnderPointer(live(), 600)).toEqual(
            new Date(2026, 6, 22)
        );
    });
});

describe("isInsideViewport", () => {
    it("accepte un pointeur dans la zone visible", () => {
        expect(isInsideViewport(live(), 600, 300)).toBe(true);
    });

    it("refuse un pointeur a gauche du bord visible", () => {
        expect(isInsideViewport(live(), 200, 300)).toBe(false);
    });

    it("refuse un pointeur sous la grille", () => {
        // Barre de statut d'Obsidian : dans le X d'une colonne, sous le bas de
        // la grille.
        expect(isInsideViewport(live(), 600, 900)).toBe(false);
    });

    it("refuse sans viewport mesure", () => {
        expect(isInsideViewport(live({ viewport: null }), 600, 300)).toBe(
            false
        );
    });

    it("refuse un pointeur inconnu", () => {
        expect(isInsideViewport(live(), null, 300)).toBe(false);
        expect(isInsideViewport(live(), 600, null)).toBe(false);
    });
});

describe("isOverPanel", () => {
    it("accepte un pointeur sur le panneau", () => {
        expect(isOverPanel(live(), 400, 300)).toBe(true);
    });

    it("refuse un pointeur a droite du panneau", () => {
        expect(isOverPanel(live(), 600, 300)).toBe(false);
    });

    it("refuse quand le panneau n'est pas monte", () => {
        expect(isOverPanel(live({ panel: null }), 400, 300)).toBe(false);
    });
});

describe("computeDropHour", () => {
    it("convertit une position en heure decimale", () => {
        // 100 px sous le haut de la grille = 1 h 40, snappe a 1 h 45.
        expect(computeDropHour(geo(), 200)).toBe(1.75);
    });

    it("snappe au quart d'heure le plus proche", () => {
        expect(computeDropHour(geo(), 107)).toBe(0.0); // 7 px  -> 7 min  -> 0
        expect(computeDropHour(geo(), 109)).toBe(0.25); // 9 px  -> 9 min  -> 15
    });

    it("borne a la journee", () => {
        expect(computeDropHour(geo(), 0)).toBe(0);
        expect(computeDropHour(geo(), 100000)).toBe(23.75);
    });

    it("retombe sur l'heure par defaut sans geometrie", () => {
        expect(computeDropHour(geo({ daysRowTop: null }), 200)).toBe(
            FALLBACK_DROP_HOUR
        );
        expect(computeDropHour(geo(), null)).toBe(FALLBACK_DROP_HOUR);
    });
});

describe("isInAllDayBand", () => {
    it("accepte un pointeur dans la bande", () => {
        expect(isInAllDayBand(geo(), 60)).toBe(true);
    });

    it("accepte la tolerance au-dessus du bord haut", () => {
        expect(isInAllDayBand(geo(), 40 - ALLDAY_BAND_SLOP_PX)).toBe(true);
        expect(isInAllDayBand(geo(), 40 - ALLDAY_BAND_SLOP_PX - 1)).toBe(false);
    });

    it("refuse sous la bande", () => {
        expect(isInAllDayBand(geo(), 81)).toBe(false);
    });

    it("refuse sans bande mesuree", () => {
        expect(isInAllDayBand(geo({ allDayBand: null }), 60)).toBe(false);
    });
});

describe("projectPanelDrop", () => {
    it("projette un creneau timed sur la colonne et l'heure sous le pointeur", () => {
        // y = 290, daysRowTop = 200 -> 90 px -> 1 h 30.
        const slot = projectPanelDrop(live(), 600, 290, HALF_HOUR_MS);
        expect(slot).not.toBeNull();
        expect(slot!.allDay).toBe(false);
        expect(slot!.start).toEqual(new Date(2026, 6, 22, 1, 30));
        expect(slot!.end.getTime() - slot!.start.getTime()).toBe(HALF_HOUR_MS);
    });

    it("projette un evenement all-day dans la bande", () => {
        const slot = projectPanelDrop(live(), 600, 170, HALF_HOUR_MS);
        expect(slot).not.toBeNull();
        expect(slot!.allDay).toBe(true);
        expect(slot!.start).toEqual(new Date(2026, 6, 22));
        expect(slot!.end).toEqual(new Date(2026, 6, 23));
    });

    it("refuse un lacher sur une colonne de buffer hors champ", () => {
        // Panneau epingle : la grille est poussee a droite, le lacher tombe sur
        // un jour de buffer invisible, un a trois jours avant la plage affichee.
        expect(projectPanelDrop(live(), 200, 290, HALF_HOUR_MS)).toBeNull();
    });

    it("refuse un lacher au-dessus du panneau qui recouvre la grille", () => {
        // x = 400 est dans le viewport ET dans le rect du 20 juillet, mais le
        // panneau non epingle est pose par-dessus : relacher la carte sur la
        // liste est une annulation, pas une planification.
        expect(projectPanelDrop(live(), 400, 290, HALF_HOUR_MS)).toBeNull();
    });

    it("refuse un lacher sous la grille", () => {
        expect(projectPanelDrop(live(), 600, 900, HALF_HOUR_MS)).toBeNull();
    });

    it("refuse un lacher entre la bande et la premiere heure", () => {
        expect(projectPanelDrop(live(), 600, 195, HALF_HOUR_MS)).toBeNull();
    });

    it("refuse un lacher quand la grille n'est pas mesurable", () => {
        expect(
            projectPanelDrop(live({ viewport: null }), 600, 290, HALF_HOUR_MS)
        ).toBeNull();
        expect(
            projectPanelDrop(live({ daysRowTop: null }), 600, 290, HALF_HOUR_MS)
        ).toBeNull();
    });
});

// ── projectGridDrag : le drag interne a la grille ──────────────────

describe("projectGridDrag", () => {
    const allDayOn = (d: Date) => ({
        start: d,
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
        allDay: true,
    });
    const timed = (start: Date, hours: number) => ({
        start,
        end: new Date(start.getTime() + hours * 3600000),
        allDay: false,
    });

    // Colonnes de geo() : [0,100[ = 20 juillet, [100,200[ = 21 juillet.
    // Bande all-day : y de 40 a 80. Grille : daysRowTop = 100.

    it("deplace un evenement timed du nombre de crans parcourus", () => {
        const ev = timed(new Date(2026, 6, 20, 10, 0), 1);
        const out = projectGridDrag(geo(), ev, { x: 0, y: 30 }, 50, 130);
        expect(out.allDay).toBe(false);
        expect(out.start).toEqual(new Date(2026, 6, 20, 10, 30));
        expect(out.end).toEqual(new Date(2026, 6, 20, 11, 30));
    });

    it("pose un all-day sur la colonne survolee", () => {
        const ev = allDayOn(new Date(2026, 6, 20));
        const out = projectGridDrag(geo(), ev, { x: 100, y: 0 }, 150, 60);
        expect(out.allDay).toBe(true);
        expect(out.start).toEqual(new Date(2026, 6, 21));
    });

    // Regression : chaque membre d'une multi-selection etait projete avec le
    // MEME pointerX que l'evenement saisi. Pour un all-day, le jour cible se lit
    // sur la colonne sous le pointeur — donc toute la selection atterrissait
    // empilee sur un seul jour au lieu de garder ses ecarts.
    it("respecte le decalage impose au lieu de la colonne survolee", () => {
        const ev = allDayOn(new Date(2026, 6, 18));
        const out = projectGridDrag(geo(), ev, { x: 100, y: 0 }, 150, 60, {
            dayShift: 1,
        });
        expect(out.allDay).toBe(true);
        // 18 + 1 jour, et surtout PAS le 21 juillet de la colonne survolee.
        expect(out.start).toEqual(new Date(2026, 6, 19));
        expect(out.end).toEqual(new Date(2026, 6, 20));
    });

    it("respecte le decalage impose pour une source de bande lachee sur la grille", () => {
        const ev = allDayOn(new Date(2026, 6, 18));
        // pointerY = 130 -> 30 px sous daysRowTop -> 00:30.
        const out = projectGridDrag(geo(), ev, { x: 100, y: 0 }, 150, 130, {
            dayShift: 1,
        });
        expect(out.allDay).toBe(false);
        expect(out.start).toEqual(new Date(2026, 6, 19, 0, 30));
        expect(out.end).toEqual(new Date(2026, 6, 19, 1, 0));
    });

    it("convertit un timed lache sur la bande en all-day du jour vise", () => {
        const ev = timed(new Date(2026, 6, 20, 10, 0), 2);
        const out = projectGridDrag(geo(), ev, { x: 100, y: -50 }, 150, 60);
        expect(out.allDay).toBe(true);
        expect(out.start).toEqual(new Date(2026, 6, 21));
        expect(out.end).toEqual(new Date(2026, 6, 22));
    });

    it("garde un all-day dans la bande quand on y revient", () => {
        const ev = allDayOn(new Date(2026, 6, 20));
        const out = projectGridDrag(geo(), ev, { x: 0, y: 0 }, 50, 60);
        expect(out.allDay).toBe(true);
        expect(out.start).toEqual(new Date(2026, 6, 20));
    });

    it("decale une barre multi-jours timed sans changer sa duree", () => {
        // 40 h depuis 10 h le 20 : l'evenement couvre le 21 en entier, seule
        // condition pour qu'il s'affiche en barre dans la bande all-day.
        const ev = timed(new Date(2026, 6, 20, 10, 0), 40);
        const out = projectGridDrag(geo(), ev, { x: 100, y: 0 }, 150, 60);
        expect(out.allDay).toBe(false);
        expect(out.start).toEqual(new Date(2026, 6, 21, 10, 0));
        expect(out.end.getTime() - out.start.getTime()).toBe(
            ev.end.getTime() - ev.start.getTime()
        );
    });
});

describe("dayShiftBetween", () => {
    it("compte les jours calendaires, pas les tranches de 24 h", () => {
        expect(
            dayShiftBetween(
                new Date(2026, 6, 20, 23, 0),
                new Date(2026, 6, 21, 1, 0)
            )
        ).toBe(1);
        expect(
            dayShiftBetween(
                new Date(2026, 6, 20, 1, 0),
                new Date(2026, 6, 20, 23, 0)
            )
        ).toBe(0);
        expect(
            dayShiftBetween(new Date(2026, 6, 25), new Date(2026, 6, 20))
        ).toBe(-5);
    });

    // Le passage a l'heure d'hiver rallonge un jour a 25 h : une division par
    // 86400000 y perdrait un jour.
    it("reste juste a travers un changement d'heure", () => {
        expect(
            dayShiftBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))
        ).toBe(2);
    });
});
