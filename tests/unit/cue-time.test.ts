import { describe, it, expect } from "vitest";
import {
    parseSrtTime,
    formatSrtTime,
    formatCueTime,
    displayCueTime,
    parseCueTime,
} from "@/lib/time";

/**
 * The Cues editor used to show a cue time as "M:SS" and write it back from
 * whole seconds, so editing any cue silently discarded its milliseconds — a
 * subtitle at 00:01:23,450 became 00:01:23,000 and drifted off the speech.
 * The same formatter rendered a cue an hour in as "75:04".
 *
 * These cover the round trip the editor actually performs.
 */
describe("cue time round trip", () => {
    it("survives an edit with its milliseconds intact", () => {
        const original = "00:01:23,450";
        const shown = displayCueTime(original);
        const parsed = parseCueTime(shown);
        expect(parsed).not.toBeNull();
        expect(formatSrtTime(parsed!)).toBe(original);
    });

    it("keeps hours as hours instead of counting past 60 minutes", () => {
        expect(displayCueTime("01:15:04,900")).toBe("1:15:04.900");
        expect(formatSrtTime(parseCueTime("1:15:04.900")!)).toBe("01:15:04,900");
    });

    it("formats under an hour without an empty hours field", () => {
        expect(formatCueTime(83.45)).toBe("1:23.450");
        expect(formatCueTime(0)).toBe("0:00.000");
    });

    it("round-trips every cue in a transcript unchanged", () => {
        const times = ["00:00:00,000", "00:00:04,120", "00:09:59,999", "02:03:04,005"];
        for (const t of times) {
            expect(formatSrtTime(parseCueTime(displayCueTime(t))!)).toBe(t);
        }
    });
});

describe("parseCueTime", () => {
    it("accepts the shapes a person actually types", () => {
        expect(parseCueTime("12")).toBe(12);
        expect(parseCueTime("1:23")).toBe(83);
        expect(parseCueTime("1:23.45")).toBeCloseTo(83.45, 5);
        expect(parseCueTime("1:23,450")).toBeCloseTo(83.45, 5);   // SRT's comma
        expect(parseCueTime(" 1:15:04.900 ")).toBeCloseTo(4504.9, 5);
    });

    it("reads a single fractional digit as tenths, not milliseconds", () => {
        expect(parseCueTime("0:01.5")).toBeCloseTo(1.5, 5);
        expect(parseCueTime("0:01.05")).toBeCloseTo(1.05, 5);
    });

    it("rejects unreadable input rather than calling it zero", () => {
        // Returning 0 here is what would yank a subtitle to the start of the
        // video on a typo.
        for (const bad of ["", "   ", "abc", "1:2:3:4", "1:234", "-5", "1:23.4567", "1:23x"]) {
            expect(parseCueTime(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBeNull();
        }
    });

    it("rejects a field that runs past 59 instead of silently carrying it", () => {
        // "9:99" reads as a typo for 9:59 far more often than as 10m39s, and
        // accepting it moved the cue somewhere the user never asked for.
        expect(parseCueTime("9:99")).toBeNull();
        expect(parseCueTime("1:75:00")).toBeNull();
        expect(parseCueTime("9:59")).toBeCloseTo(599, 5);
        // The leading field is allowed to be large — "90" is ninety seconds.
        expect(parseCueTime("90")).toBe(90);
        expect(parseCueTime("75:30")).toBeCloseTo(4530, 5);
    });
});

describe("cue validity", () => {
    const MIN_CUE_SECONDS = 0.05;

    // Mirrors commitTime in subtitle-editor.tsx.
    const clampStart = (parsed: number, end: number) =>
        Math.max(0, Math.min(parsed, end - MIN_CUE_SECONDS));
    const clampEnd = (parsed: number, start: number) =>
        Math.max(parsed, start + MIN_CUE_SECONDS);

    it("never lets a start pass its own end", () => {
        const end = parseSrtTime("00:00:05,000");
        expect(clampStart(parseSrtTime("00:00:09,000"), end)).toBeCloseTo(4.95, 5);
    });

    it("never lets an end fall before its own start", () => {
        const start = parseSrtTime("00:00:05,000");
        expect(clampEnd(parseSrtTime("00:00:01,000"), start)).toBeCloseTo(5.05, 5);
    });

    it("clamps a negative start to zero", () => {
        expect(clampStart(-10, 5)).toBe(0);
    });
});
