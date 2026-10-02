import { contrastRatio } from "./contrast";
import { accentTextOn, derivePanelTokens, deriveLightExtras, readableSemantic } from "./panelTokens";

describe("dérivation des couleurs de panneau", () => {
    const tokens = derivePanelTokens({
        surface: "#000000",
        ink: "#ffffff",
        accent: "#ff0000",
    });

    it("reprend les formules de color-mix d'App.tsx", () => {
        expect(tokens.bgPrimary).toBe("#000000");
        expect(tokens.bgSecondary).toBe("#1f1f1f");
        expect(tokens.formField).toBe("#292929");
        expect(tokens.hover).toBe("#383838");
        expect(tokens.muted).toBe("#b8b8b8");
        expect(tokens.faint).toBe("#858585");
        expect(tokens.text).toBe("#ffffff");
        expect(tokens.border).toBe("rgba(255, 255, 255, 0.22)");
        expect(tokens.borderHover).toBe("#ff4d4d");
    });

    it("le clair garde son texte lisible sur sa surface et sur son accent", () => {
        const light = deriveLightExtras(
            { surface: "#ffffff", ink: "#000000", accent: "#ffcc00" },
            { danger: "#aa0000", success: "#006600" }
        );
        expect(light.accentText).toBe("#000000");
        expect(light.danger).toBe("#aa0000");
        expect(light.glass).toBe("rgba(255, 255, 255, 0.88)");
        expect(light.crust).toBe("#ebebeb");
    });

    it("rapproche les textes atténués de l'encre quand la palette ne les tient pas", () => {
        // Latte : avec les proportions d'origine, le texte secondaire ne fait que 3,63 sur le fond.
        const latte = derivePanelTokens({ surface: "#eff1f5", ink: "#4c4f69", accent: "#1e66f5" });
        for (const bg of [latte.bgPrimary, latte.bgSecondary, latte.formField, latte.hover]) {
            expect(contrastRatio(latte.muted, bg)).toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(latte.faint, bg)).toBeGreaterThanOrEqual(3);
        }
    });

    it("garde le texte sur accent de la surface quand elle se lit, sinon noir ou blanc", () => {
        expect(accentTextOn("#89b4fa", "#1e1e2e")).toBe("#1e1e2e");
        expect(accentTextOn("#4d78cc", "#282c34")).toBe("#000000");
    });

    it("ne touche pas un rouge qui se lit déjà et rapproche de l'encre celui qui ne se lit pas", () => {
        const colors = { surface: "#ffffff", ink: "#000000", accent: "#ff0000" };
        expect(readableSemantic({ danger: "#aa0000", success: "#006600" }, colors)).toEqual({
            danger: "#aa0000",
            success: "#006600",
        });
        const weak = readableSemantic({ danger: "#ff7383", success: "#6cbf43" }, colors);
        expect(weak.danger).not.toBe("#ff7383");
        expect(contrastRatio(weak.danger, "#ffffff")).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(weak.success, "#ffffff")).toBeGreaterThanOrEqual(3);
    });
});
