import {
    needsLongPress,
    abandonsLongPress,
    LONG_PRESS_TOLERANCE,
    LONG_PRESS_MS,
    DRAG_THRESHOLD,
} from "./useSidebarReorder";

describe("needsLongPress", () => {
    it("un doigt doit maintenir avant de deplacer", () => {
        // Sans ca, faire defiler la liste avec le doigt pose sur un calendrier
        // le soulevait : 5 px de defilement suffisaient.
        expect(needsLongPress("touch")).toBe(true);
    });

    it("une souris n'a pas a maintenir", () => {
        // Une souris ne bouge que si on la pousse : quelques pixels bouton
        // enfonce sont deja une intention.
        expect(needsLongPress("mouse")).toBe(false);
    });

    it("un stylet n'a pas a maintenir", () => {
        expect(needsLongPress("pen")).toBe(false);
    });

    it("se decide sur le pointeur, pas sur la plateforme", () => {
        // Un portable tactile doit se comporter comme un telephone au doigt et
        // comme un bureau au pave tactile.
        expect(needsLongPress("")).toBe(false);
    });
});

describe("abandonsLongPress", () => {
    it("un doigt immobile continue de maintenir", () => {
        expect(abandonsLongPress(0, 0)).toBe(false);
    });

    it("tolere le tremblement d'un doigt pose", () => {
        expect(abandonsLongPress(2, 3)).toBe(false);
    });

    it("abandonne des que le doigt defile pour de bon", () => {
        expect(abandonsLongPress(0, 40)).toBe(true);
    });

    it("compte la distance, pas seulement la verticale", () => {
        // Un mouvement diagonal reste un mouvement : 9 et 9 font 12,7.
        expect(abandonsLongPress(9, 9)).toBe(true);
    });

    it("laisse passer juste en dessous de la tolerance", () => {
        expect(abandonsLongPress(0, LONG_PRESS_TOLERANCE - 0.1)).toBe(false);
    });

    it("abandonne juste au-dessus de la tolerance", () => {
        expect(abandonsLongPress(0, LONG_PRESS_TOLERANCE + 0.1)).toBe(true);
    });
});

describe("les reglages du geste", () => {
    it("laisse au doigt le temps de dire ce qu'il veut", () => {
        // La convention Android tourne autour d'une demi-seconde : plus court
        // se declenche pendant un defilement, plus long parait casse.
        expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(300);
        expect(LONG_PRESS_MS).toBeLessThanOrEqual(700);
    });

    it("garde un seuil souris plus petit que la tolerance du doigt", () => {
        // Si la souris demandait autant de mouvement qu'un doigt en tolere, le
        // glisser au pointeur paraitrait pateux.
        expect(DRAG_THRESHOLD).toBeLessThan(LONG_PRESS_TOLERANCE);
    });
});
