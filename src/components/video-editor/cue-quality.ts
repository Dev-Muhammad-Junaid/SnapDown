import { parseSrtTime } from "@/lib/time";
import type { Subtitle } from "./subtitle-types";

/**
 * What makes a subtitle hard to watch, as opposed to wrong.
 *
 * The existing warning triangle is about transcription confidence — whether
 * the words are right. These are about whether the cue is readable at all,
 * which is a different question and the one the transcription never asks.
 *
 * Only reading speed is checked. Line length and very brief cues were both
 * tried and removed: a long line is usually a long line on purpose, and a
 * brief one is usually a brief word, so neither earned the attention its flag
 * cost. Overlap was never added — across 2,165 cues in two real transcripts
 * this transcriber produced exactly zero overlapping pairs.
 *
 * Too fast is the one that survives, because it is the one a viewer actually
 * cannot do anything about: 73 cues in a 4.5-hour transcript go past quicker
 * than they can be read.
 */

/**
 * Characters per second a viewer can comfortably read. Broadcast guidelines
 * land between 17 and 21; the upper end is used here so the flag means "this
 * is genuinely too fast", not "this is brisk".
 */
export const MAX_CPS = 21;

export type CueIssue = "fast";

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
    if (chars > 0 && duration > 0 && cps > MAX_CPS) issues.push("fast");

    return { issues, cps, duration, chars };
}

/**
 * Two or three words naming the problem, for the row itself.
 *
 * The figure alone ("24") says nothing without knowing what is being counted,
 * and a colour alone says only that something is wrong. The label is what
 * makes the flag legible without hovering it.
 */
export function summariseIssues(q: CueQuality): string | null {
    return q.issues.includes("fast") ? "Too fast" : null;
}

/** One line explaining what is wrong, for the row's tooltip. */
export function describeIssues(q: CueQuality): string | null {
    if (q.issues.length === 0) return null;
    return `${Math.round(q.cps)} characters per second — too fast to read (limit ${MAX_CPS})`;
}
