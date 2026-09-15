/**
 * The editor's selected-state accent, in one place.
 *
 * It is `foreground` on `background` — near-black on white in the light theme,
 * near-white on near-black in the dark one — rather than the blue `primary`.
 * Blue is the app's action colour (Export, links); using it for "this tab is
 * showing" or "this key just fired" made every small toggle compete with the
 * one control that actually starts work.
 *
 * Both halves come from theme tokens, so the accent inverts with the theme
 * instead of needing a second set of colours defined for dark mode.
 *
 * The mode tabs (Trim / Crop / Subtitles), the sidebar tabs (Style / Cues),
 * the Cues toolbar toggles and the keyboard hint caps all read from here, so
 * changing the accent is one edit rather than four that drift apart.
 */

/** Wrapper around a set of pill tabs. */
export const PILL_GROUP = "flex items-center gap-1 rounded-xl border border-border/40 bg-muted/60 p-1";

/** A pill tab, in either state. */
export const PILL_BASE = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all";
export const PILL_ON = "bg-foreground text-background shadow-sm";
export const PILL_OFF = "text-muted-foreground hover:text-foreground";

/** The same accent for smaller controls — toolbar icon toggles, key caps. */
export const ACCENT_ON = "bg-foreground text-background border-foreground";
export const ACCENT_OFF = "text-muted-foreground hover:bg-muted hover:text-foreground";
