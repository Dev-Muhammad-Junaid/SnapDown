/**
 * Which footer hint a keystroke belongs to.
 *
 * Deliberately mirrors the guards in the handlers that do the actual work —
 * this editor's own, and the video editor modal's. A key being typed into a
 * field does nothing, so it must not light up either: telling the user a
 * keystroke landed when it was swallowed by a text box is worse feedback than
 * none at all.
 */
export type HintId = "nav" | "play" | "back" | "fwd" | "undo";

/** How long a hint stays lit. Long enough to notice, short enough that
 *  holding a key down doesn't turn into a strobe. */
export const FLASH_MS = 260;

export function hintForEvent(e: KeyboardEvent): HintId | null {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return null;

    if (e.metaKey || e.ctrlKey) {
        // Undo and redo share one cap on the row.
        return e.key === "z" || e.key === "Z" || e.key === "y" ? "undo" : null;
    }
    if (e.altKey) return null;

    switch (e.key) {
        case "ArrowUp":
        case "ArrowDown": return "nav";
        case " ": return "play";
        case "j": case "J": return "back";
        case "l": case "L": return "fwd";
        default: return null;
    }
}
