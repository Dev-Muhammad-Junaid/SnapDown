import { describe, it, expect } from "vitest";
import { deleteCue, type Subtitle } from "@/components/video-editor/subtitle-types";
import { parseSrtTime, formatSrtTime } from "@/lib/time";

const cue = (id: number, start: number, end: number, text = `line ${id}`): Subtitle => ({
    id,
    start: formatSrtTime(start),
    end: formatSrtTime(end),
    text,
    confidence: 1,
});

const span = (s: Subtitle) => [parseSrtTime(s.start), parseSrtTime(s.end)] as const;

describe("deleteCue", () => {
    const three = () => [cue(1, 0, 2, "first"), cue(2, 5, 7, "second"), cue(3, 9, 11, "third")];

    it("removes only the cue asked for", () => {
        const out = deleteCue(three(), 2)!;
        expect(out.subtitles.map((s) => s.text)).toEqual(["first", "third"]);
    });

    it("leaves the surviving cues at exactly their own times", () => {
        // The gap the deleted line leaves is silence, and silence is correct —
        // stretching a neighbour over it would put words on screen while
        // nobody is speaking.
        const out = deleteCue(three(), 2)!;
        expect(span(out.subtitles[0])).toEqual([0, 2]);
        expect(span(out.subtitles[1])).toEqual([9, 11]);
    });

    it("renumbers ids 1..n so the SRT sequence stays valid", () => {
        const out = deleteCue(three(), 1)!;
        expect(out.subtitles.map((s) => s.id)).toEqual([1, 2]);
        expect(out.subtitles.map((s) => s.text)).toEqual(["second", "third"]);
    });

    it("makes the cue that took its place active", () => {
        const out = deleteCue(three(), 2)!;
        // "third" slid into position 2 and is renumbered to id 2.
        expect(out.activeId).toBe(2);
        expect(out.subtitles.find((s) => s.id === out.activeId)!.text).toBe("third");
    });

    it("falls back to the cue above when the last one goes", () => {
        const out = deleteCue(three(), 3)!;
        expect(out.activeId).toBe(2);
        expect(out.subtitles.find((s) => s.id === out.activeId)!.text).toBe("second");
    });

    it("reports no active cue when the list empties", () => {
        const out = deleteCue([cue(1, 0, 2)], 1)!;
        expect(out.subtitles).toEqual([]);
        expect(out.activeId).toBeNull();
    });

    it("returns null for an id that isn't there", () => {
        expect(deleteCue(three(), 99)).toBeNull();
    });

    it("does not mutate the array it was given", () => {
        const input = three();
        deleteCue(input, 2);
        expect(input.map((s) => s.id)).toEqual([1, 2, 3]);
        expect(input).toHaveLength(3);
    });
});
