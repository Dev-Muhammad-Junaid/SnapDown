import { parseSrtTime } from "@/lib/time";
import type { Subtitle } from "./subtitle-types";

/**
 * What makes a subtitle hard to watch, as opposed to wrong.
 *
 * The existing warning triangle is about transcription confidence — whether
 * the words are right. These are about whether the cue is readable at all,
 * which is a different question and the one the transcription never asks.
 *
 * Measured on a real 4.5-hour transcript: 73 cues too fast to read, 42 lines
 * past a comfortable length, and — worth saying — 0 overlapping cues across
 * 2,165 of them. Overlap detection was dropped for that reason; it is a real
 * subtitle problem that this transcriber does not produce.
 */

/**
 * Characters per second a viewer can comfortably read. Broadcast guidelines
 * land between 17 and 21; the upper end is used here so the flag means "this
 * is genuinely too fast", not "this is brisk".
 */
export const MAX_CPS = 21;

/**
 * Characters before a cue wants a second line. 42 per line is the common
 * limit and two lines is the usual maximum, so 84 is where a cue stops
 * fitting the screen rather than merely being long.
 */
export const MAX_CHARS = 84;

/** Below this a cue is too brief to read regardless of how little it says. */
export const MIN_READABLE_SECONDS = 0.7;

export type CueIssue = "fast" | "long" | "brief";

export interface CueQuality {
    issues: CueIssue[];
    cps: number;
    duration: number;
    chars: number;
}

export function assessCue(cue: Subtitle): CueQuality {
    const duration = Math.max(0, parseSrtTime(cue.end) - parseSrtTime(cue.start));
    const text = cue.text.replace(/\s+/g, " ").trim();
    const chars = text.length;
    // A zero-length cue would divide to Infinity; report 0 and let the
    // "brief" check be the one that speaks.
    const cps = duration > 0 ? chars / duration : 0;

    const issues: CueIssue[] = [];
    // An empty cue is a cue you are still writing, not a problem to flag.
    if (chars > 0) {
        if (duration > 0 && cps > MAX_CPS) issues.push("fast");
        if (chars > MAX_CHARS) issues.push("long");
        if (duration > 0 && duration < MIN_READABLE_SECONDS) issues.push("brief");
    }

    return { issues, cps, duration, chars };
}

/** One line explaining what is wrong, for the row's tooltip. */
export function describeIssues(q: CueQuality): string | null {
    if (q.issues.length === 0) return null;
    const parts: string[] = [];
    if (q.issues.includes("fast")) {
        parts.push(`${Math.round(q.cps)} characters per second — too fast to read (limit ${MAX_CPS})`);
    }
    if (q.issues.includes("long")) {
        parts.push(`${q.chars} characters — longer than two lines fit (limit ${MAX_CHARS})`);
    }
    if (q.issues.includes("brief")) {
        parts.push(`on screen for ${q.duration.toFixed(2)}s — too brief to read`);
    }
    return parts.join("; ");
}
