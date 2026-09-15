import { describe, it, expect } from "vitest";
import { insertCueAfter, MIN_CUE_SECONDS, type Subtitle } from "@/components/video-editor/subtitle-types";
import { parseSrtTime, formatSrtTime } from "@/lib/time";

const cue = (id: number, start: number, end: number, text = `line ${id}`): Subtitle => ({
    id,
    start: formatSrtTime(start),
    end: formatSrtTime(end),
    text,
    confidence: 1,
});

const span = (s: Subtitle) => [parseSrtTime(s.start), parseSrtTime(s.end)] as const;

/** No cue may start before the one before it ends. */
const noOverlaps = (subs: Subtitle[]) =>
    subs.every((s, i) => i === 0 || parseSrtTime(s.start) >= parseSrtTime(subs[i - 1].end) - 1e-9);

describe("insertCueAfter", () => {
    it("puts the new cue in the silence after the one clicked", () => {
        // 5s gap between the two cues.
        const subs = [cue(1, 0, 2), cue(2, 7, 9)];
        const out = insertCueAfter(subs, 1)!;
        expect(out.newIndex).toBe(1);
        expect(span(out.subtitles[1])).toEqual([2, 4]); // capped at 2s, not the whole gap
        expect(noOverlaps(out.subtitles)).toBe(true);
    });

    it("fits into a gap smaller than the default length", () => {
        const subs = [cue(1, 0, 2), cue(2, 3, 5)]; // only 1s of room
        const out = insertCueAfter(subs, 1)!;
        expect(span(out.subtitles[1])).toEqual([2, 3]);
        expect(noOverlaps(out.subtitles)).toBe(true);
    });

    it("borrows the tail of the cue above when there is no gap at all", () => {
        const subs = [cue(1, 0, 6), cue(2, 6, 8)];
        const out = insertCueAfter(subs, 1)!;
        // The cue above gives up its last 2s rather than pushing cue 2 along.
        expect(span(out.subtitles[0])).toEqual([0, 4]);
        expect(span(out.subtitles[1])).toEqual([4, 6]);
        expect(span(out.subtitles[2])).toEqual([6, 8]);
        expect(noOverlaps(out.subtitles)).toBe(true);
    });

    it("never shrinks the cue above below the minimum", () => {
        const subs = [cue(1, 0, 0.1), cue(2, 0.1, 2)];
        const out = insertCueAfter(subs, 1)!;
        const [s0, e0] = span(out.subtitles[0]);
        expect(e0 - s0).toBeGreaterThanOrEqual(MIN_CUE_SECONDS - 1e-9);
        expect(noOverlaps(out.subtitles)).toBe(true);
    });

    it("appends after the last cue", () => {
        const subs = [cue(1, 0, 2)];
        const out = insertCueAfter(subs, 1)!;
        expect(out.subtitles).toHaveLength(2);
        expect(span(out.subtitles[1])).toEqual([2, 4]);
    });

    it("leaves every later cue exactly where it was", () => {
        const subs = [cue(1, 0, 2), cue(2, 7, 9), cue(3, 12, 14)];
        const out = insertCueAfter(subs, 1)!;
        // Inserting a line must not retime the rest of the track.
        expect(span(out.subtitles[2])).toEqual([7, 9]);
        expect(span(out.subtitles[3])).toEqual([12, 14]);
    });

    it("renumbers ids 1..n so the SRT sequence stays valid", () => {
        const subs = [cue(1, 0, 2), cue(2, 7, 9), cue(3, 12, 14)];
        const out = insertCueAfter(subs, 1)!;
        expect(out.subtitles.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    });

    it("creates the cue empty and full-confidence, so it stays out of the review queue", () => {
        const out = insertCueAfter([cue(1, 0, 2)], 1)!;
        expect(out.subtitles[1].text).toBe("");
        expect(out.subtitles[1].confidence).toBe(1);
    });

    it("keeps the text of the cues around it", () => {
        const subs = [cue(1, 0, 2, "first"), cue(2, 7, 9, "second")];
        const out = insertCueAfter(subs, 1)!;
        expect(out.subtitles.map((s) => s.text)).toEqual(["first", "", "second"]);
    });

    it("returns null for an id that isn't there", () => {
        expect(insertCueAfter([cue(1, 0, 2)], 99)).toBeNull();
    });
});
