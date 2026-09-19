import { describe, it, expect } from "vitest";
import { splitCueAt, MIN_CUE_SECONDS, type Subtitle } from "@/components/video-editor/subtitle-types";
import { parseSrtTime, formatSrtTime } from "@/lib/time";

const cue = (id: number, start: number, end: number, text = `line ${id}`, confidence = 1): Subtitle => ({
    id, start: formatSrtTime(start), end: formatSrtTime(end), text, confidence,
});

const span = (s: Subtitle) => [parseSrtTime(s.start), parseSrtTime(s.end)] as const;

describe("splitCueAt", () => {
    const one = () => [cue(1, 0, 10, "one two three four five six seven eight")];

    it("cuts the timing at the point given", () => {
        const out = splitCueAt(one(), 1, 4)!;
        expect(span(out.subtitles[0])).toEqual([0, 4]);
        expect(span(out.subtitles[1])).toEqual([4, 10]);
    });

    it("leaves no gap or overlap at the join", () => {
        const out = splitCueAt(one(), 1, 4)!;
        expect(out.subtitles[0].end).toBe(out.subtitles[1].start);
    });

    it("divides the words at roughly the same fraction as the time", () => {
        // Cut at the midpoint of an eight-word cue: four words each side.
        const out = splitCueAt(one(), 1, 5)!;
        expect(out.subtitles[0].text).toBe("one two three four");
        expect(out.subtitles[1].text).toBe("five six seven eight");
    });

    it("follows the cut point rather than always halving", () => {
        const out = splitCueAt(one(), 1, 2.5)!;
        expect(out.subtitles[0].text).toBe("one two");
        expect(out.subtitles[1].text).toBe("three four five six seven eight");
    });

    it("never leaves a half empty, however lopsided the cut", () => {
        for (const at of [0.2, 0.5, 9.5, 9.8]) {
            const out = splitCueAt(one(), 1, at)!;
            expect(out.subtitles[0].text.trim(), `cut at ${at}`).not.toBe("");
            expect(out.subtitles[1].text.trim(), `cut at ${at}`).not.toBe("");
        }
    });

    it("keeps a single word whole rather than cutting into it", () => {
        const out = splitCueAt([cue(1, 0, 10, "indivisible")], 1, 5)!;
        expect(out.subtitles[0].text).toBe("indivisible");
        expect(out.subtitles[1].text).toBe("");
    });

    it("carries the original confidence to both halves", () => {
        // Splitting says nothing about whether the transcription was right.
        const out = splitCueAt([cue(1, 0, 10, "a b c d", 0.4)], 1, 5)!;
        expect(out.subtitles.map((s) => s.confidence)).toEqual([0.4, 0.4]);
    });

    it("leaves every later cue exactly where it was", () => {
        const subs = [cue(1, 0, 10, "a b c d"), cue(2, 12, 14, "after")];
        const out = splitCueAt(subs, 1, 5)!;
        expect(span(out.subtitles[2])).toEqual([12, 14]);
        expect(out.subtitles[2].text).toBe("after");
    });

    it("renumbers ids 1..n", () => {
        const subs = [cue(1, 0, 10, "a b c d"), cue(2, 12, 14, "after")];
        expect(splitCueAt(subs, 1, 5)!.subtitles.map((s) => s.id)).toEqual([1, 2, 3]);
    });

    it("leaves the second half active, where the playhead already is", () => {
        const out = splitCueAt(one(), 1, 5)!;
        expect(out.activeId).toBe(2);
        expect(out.subtitles.find((s) => s.id === out.activeId)!.text).toBe("five six seven eight");
    });

    it("refuses a point outside the cue", () => {
        expect(splitCueAt(one(), 1, -1)).toBeNull();
        expect(splitCueAt(one(), 1, 11)).toBeNull();
    });

    it("refuses a point too close to either edge to leave a usable cue", () => {
        expect(splitCueAt(one(), 1, 0)).toBeNull();
        expect(splitCueAt(one(), 1, 10)).toBeNull();
        expect(splitCueAt(one(), 1, MIN_CUE_SECONDS / 2)).toBeNull();
        expect(splitCueAt(one(), 1, 10 - MIN_CUE_SECONDS / 2)).toBeNull();
    });

    it("returns null for an id that isn't there", () => {
        expect(splitCueAt(one(), 99, 5)).toBeNull();
    });

    it("does not mutate the array it was given", () => {
        const input = one();
        splitCueAt(input, 1, 5);
        expect(input).toHaveLength(1);
        expect(input[0].text).toBe("one two three four five six seven eight");
    });
});
