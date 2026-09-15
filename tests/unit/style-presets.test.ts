import { describe, it, expect } from "vitest";
import { STYLE_PRESETS } from "@/components/video-editor/subtitle-types";
import { PRESET_BASE_ANIMATION, createDefaultStyleConfig } from "@/lib/ass-builder";

/** The animation ids the Style panel offers, mirroring its ANIMATIONS list. */
const OFFERED = new Set([
    "none", "fade", "pop", "slide-up", "karaoke",
    "tiktok-box", "reveal",
]);

describe("style presets", () => {
    it("has a base animation entry for every preset", () => {
        for (const p of STYLE_PRESETS) {
            expect(PRESET_BASE_ANIMATION[p.id], `preset "${p.id}"`).toBeDefined();
        }
    });

    it("offers a chip for every animation a preset can pin", () => {
        // Two presets pin an animation of their own. Without a chip for it the
        // Animation row showed nothing selected under those presets, and any
        // click in the row silently discarded the preset's whole behaviour.
        for (const [preset, animation] of Object.entries(PRESET_BASE_ANIMATION)) {
            expect(OFFERED.has(animation), `preset "${preset}" pins "${animation}"`).toBe(true);
        }
    });

    it("gives each preset the animation its defaults claim", () => {
        for (const p of STYLE_PRESETS) {
            expect(createDefaultStyleConfig(p.id).animation).toBe(PRESET_BASE_ANIMATION[p.id]);
        }
    });

    it("has no two presets that render identically", () => {
        // A preset that matches another is a choice with no consequence.
        const seen = new Map<string, string>();
        for (const p of STYLE_PRESETS) {
            const { preset: _ignored, ...look } = createDefaultStyleConfig(p.id);
            const key = JSON.stringify(look);
            const clash = seen.get(key);
            expect(clash, `"${p.id}" is identical to "${clash}"`).toBeUndefined();
            seen.set(key, p.id);
        }
    });

    it("gives every preset a name and a description", () => {
        for (const p of STYLE_PRESETS) {
            expect(p.name?.trim(), p.id).toBeTruthy();
            expect(p.desc?.trim(), p.id).toBeTruthy();
        }
    });
});
