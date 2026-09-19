import { describe, it, expect } from "vitest";
import { hintForEvent } from "@/components/video-editor/shortcut-hints";

/**
 * The footer hints light up as their shortcut fires. The rule that matters is
 * the negative one: a keystroke that gets swallowed by a text field does
 * nothing, so it must not light anything either — telling the user a
 * keystroke landed when it didn't is worse than staying dark.
 */
const ev = (init: Partial<KeyboardEvent> & { key: string }, tagName = "BODY") =>
    ({
        ...init,
        metaKey: init.metaKey ?? false,
        ctrlKey: init.ctrlKey ?? false,
        altKey: init.altKey ?? false,
        target: { tagName, isContentEditable: tagName === "CE" },
    }) as unknown as KeyboardEvent;

describe("hintForEvent", () => {
    it("maps each advertised shortcut to its cap", () => {
        expect(hintForEvent(ev({ key: "ArrowUp" }))).toBe("nav");
        expect(hintForEvent(ev({ key: "ArrowDown" }))).toBe("nav");
        expect(hintForEvent(ev({ key: " " }))).toBe("play");
        expect(hintForEvent(ev({ key: "z", metaKey: true }))).toBe("undo");
        expect(hintForEvent(ev({ key: "z", ctrlKey: true }))).toBe("undo");
    });

    it("stays dark while typing", () => {
        for (const tag of ["INPUT", "TEXTAREA", "SELECT", "CE"]) {
            expect(hintForEvent(ev({ key: " " }, tag)), tag).toBeNull();
            expect(hintForEvent(ev({ key: "ArrowUp" }, tag)), tag).toBeNull();
            expect(hintForEvent(ev({ key: "z", metaKey: true }, tag)), tag).toBeNull();
        }
    });

    it("ignores keys that aren't on the hint row", () => {
        // J and L still seek ±5s globally; they simply have no cap here, so
        // nothing should light when they are pressed.
        for (const key of ["j", "J", "l", "L", "k", "i", "o", "Home", "End", "ArrowLeft", "a", "Escape"]) {
            expect(hintForEvent(ev({ key })), key).toBeNull();
        }
    });

    it("does not light a hint when a modifier is held", () => {
        // ⌘Space is not Space — the modal's own handler bails on modifiers too.
        expect(hintForEvent(ev({ key: " ", ctrlKey: true }))).toBeNull();
        expect(hintForEvent(ev({ key: "ArrowUp", altKey: true }))).toBeNull();
    });

    it("separates redo from undo, since they have their own caps", () => {
        expect(hintForEvent(ev({ key: "y", metaKey: true }))).toBe("redo");
        expect(hintForEvent(ev({ key: "z", metaKey: true, shiftKey: true } as never))).toBe("redo");
        // ⌘Z without shift stays undo.
        expect(hintForEvent(ev({ key: "z", metaKey: true }))).toBe("undo");
    });
});
