import { describe, it, expect } from "vitest";
import { mergeCueWithNext, type Subtitle } from "@/components/video-editor/subtitle-types";
import { parseSrtTime, formatSrtTime } from "@/lib/time";

const cue = (id: number, start: number, end: number, text = `line ${id}`, confidence = 1): Subtitle => ({
    id,
    start: formatSrtTime(start),
    end: formatSrtTime(end),
    text,
    confidence,
});

const span = (s: Subtitle) => [parseSrtTime(s.start), parseSrtTime(s.end)] as const;

describe("mergeCueWithNext", () => {
    const three = () => [
        cue(1, 0, 2, "Got a"),
        cue(2, 2.5, 3, "dead wish"),
        cue(3, 9, 11, "later"),
    ];

    it("spans from the first cue's start to the second cue's end", () => {
        // The silence between them is swallowed deliberately: merging exists
        // for fragments that flash past, and the combined cue needs the whole
        // span to be readable.
        const out = mergeCueWithNext(three(), 1)!;
        expect(span(out.subtitles[0])).toEqual([0, 3]);
    });

    it("joins the text with a single space", () => {
        const out = mergeCueWithNext(three(), 1)!;
        expect(out.subtitles[0].text).toBe("Got a dead wish");
    });

    it("does not leave a double space when a cue is empty", () => {
        const out = mergeCueWithNext([cue(1, 0, 2, "alone"), cue(2, 2, 4, "")], 1)!;
        expect(out.subtitles[0].text).toBe("alone");
    });

    it("trims stray whitespace from either side", () => {
        const out = mergeCueWithNext([cue(1, 0, 2, "  Got a "), cue(2, 2, 4, " dead wish  ")], 1)!;
        expect(out.subtitles[0].text).toBe("Got a dead wish");
    });

    it("keeps the lower confidence of the two", () => {
        // Joining a shaky line to a confident one must not clear the flag that
        // puts it in the review queue.
        const subs = [cue(1, 0, 2, "sure", 1), cue(2, 2, 4, "unsure", 0.4)];
        expect(mergeCueWithNext(subs, 1)!.subtitles[0].confidence).toBe(0.4);
        const flipped = [cue(1, 0, 2, "unsure", 0.4), cue(2, 2, 4, "sure", 1)];
        expect(mergeCueWithNext(flipped, 1)!.subtitles[0].confidence).toBe(0.4);
    });

    it("leaves every later cue exactly where it was", () => {
        const out = mergeCueWithNext(three(), 1)!;
        expect(span(out.subtitles[1])).toEqual([9, 11]);
        expect(out.subtitles[1].text).toBe("later");
    });

    it("drops one cue and renumbers the rest", () => {
        const out = mergeCueWithNext(three(), 1)!;
        expect(out.subtitles).toHaveLength(2);
        expect(out.subtitles.map((s) => s.id)).toEqual([1, 2]);
    });

    it("leaves the merged cue active", () => {
        const out = mergeCueWithNext(three(), 2)!;
        expect(out.activeId).toBe(2);
        expect(out.subtitles.find((s) => s.id === out.activeId)!.text).toBe("dead wish later");
    });

    it("refuses on the last cue, which has nothing to merge into", () => {
        expect(mergeCueWithNext(three(), 3)).toBeNull();
    });

    it("returns null for an id that isn't there", () => {
        expect(mergeCueWithNext(three(), 99)).toBeNull();
    });

    it("does not mutate the array it was given", () => {
        const input = three();
        mergeCueWithNext(input, 1);
        expect(input).toHaveLength(3);
        expect(input.map((s) => s.text)).toEqual(["Got a", "dead wish", "later"]);
    });
});
