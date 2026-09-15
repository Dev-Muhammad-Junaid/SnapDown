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
        expect(hintForEvent(ev({ key: "j" }))).toBe("back");
        expect(hintForEvent(ev({ key: "L" }))).toBe("fwd");
        expect(hintForEvent(ev({ key: "z", metaKey: true }))).toBe("undo");
        expect(hintForEvent(ev({ key: "z", ctrlKey: true }))).toBe("undo");
    });

    it("stays dark while typing", () => {
        for (const tag of ["INPUT", "TEXTAREA", "SELECT", "CE"]) {
            expect(hintForEvent(ev({ key: "j" }, tag)), tag).toBeNull();
            expect(hintForEvent(ev({ key: " " }, tag)), tag).toBeNull();
            expect(hintForEvent(ev({ key: "ArrowUp" }, tag)), tag).toBeNull();
            expect(hintForEvent(ev({ key: "z", metaKey: true }, tag)), tag).toBeNull();
        }
    });

    it("ignores keys that aren't on the hint row", () => {
        for (const key of ["k", "i", "o", "Home", "End", "ArrowLeft", "a", "Escape"]) {
            expect(hintForEvent(ev({ key })), key).toBeNull();
        }
    });

    it("does not light a seek hint when a modifier is held", () => {
        // ⌘J is not J — the modal's own handler bails on modifiers too.
        expect(hintForEvent(ev({ key: "j", metaKey: true }))).toBeNull();
        expect(hintForEvent(ev({ key: "l", altKey: true }))).toBeNull();
        expect(hintForEvent(ev({ key: " ", ctrlKey: true }))).toBeNull();
    });

    it("treats redo as the undo cap, since they share it", () => {
        expect(hintForEvent(ev({ key: "y", metaKey: true }))).toBe("undo");
        expect(hintForEvent(ev({ key: "Z", metaKey: true, shiftKey: true } as never))).toBe("undo");
    });
});
