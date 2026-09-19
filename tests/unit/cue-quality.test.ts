import { describe, it, expect } from "vitest";
import { assessCue, describeIssues, summariseIssues, MAX_CPS } from "@/components/video-editor/cue-quality";
import { formatSrtTime } from "@/lib/time";
import type { Subtitle } from "@/components/video-editor/subtitle-types";

const cue = (start: number, end: number, text: string): Subtitle => ({
    id: 1, start: formatSrtTime(start), end: formatSrtTime(end), text, confidence: 1,
});

/** Text of a given length, in real words so the counters see what they'd see. */
const words = (chars: number) => "ab ".repeat(Math.ceil(chars / 3)).slice(0, chars).trim();

describe("assessCue", () => {
    it("passes a comfortable cue", () => {
        // ~12 chars/sec, well inside every limit.
        expect(assessCue(cue(0, 4, "Summer said, bitch")).issues).toEqual([]);
    });

    it("flags a cue too fast to read", () => {
        // A real case from the transcript: 50 chars in 1.06s.
        const q = assessCue(cue(0, 1.06, "it's considered academic tasks from way to reach out."));
        expect(q.issues).toContain("fast");
        expect(q.cps).toBeGreaterThan(MAX_CPS);
    });

    it("does not flag a cue sitting just under the limit", () => {
        const q = assessCue(cue(0, 10, words(MAX_CPS * 10 - 5)));
        expect(q.issues).not.toContain("fast");
    });

    it("says nothing about a long line that is on screen long enough", () => {
        // Line length was tried as a check and removed: a long line read at a
        // comfortable speed is a long line on purpose.
        expect(assessCue(cue(0, 60, words(200))).issues).toEqual([]);
    });

    it("says nothing about a brief cue with little in it", () => {
        // A 0.32s single word is a brief word, not a problem. 34 of them
        // appear in the long transcript and none is worth interrupting for.
        expect(assessCue(cue(0, 0.32, "ok")).issues).toEqual([]);
    });

    it("says nothing about an empty cue", () => {
        // A blank cue is one you are still writing, not a problem.
        expect(assessCue(cue(0, 2, "")).issues).toEqual([]);
        expect(assessCue(cue(0, 2, "   ")).issues).toEqual([]);
    });

    it("does not divide by zero on a zero-length cue", () => {
        const q = assessCue(cue(5, 5, "something"));
        expect(Number.isFinite(q.cps)).toBe(true);
    });

    it("counts collapsed whitespace, not raw characters", () => {
        expect(assessCue(cue(0, 4, "a     b")).chars).toBe(3);
    });

    it("names the problem in two words, for the row itself", () => {
        expect(summariseIssues(assessCue(cue(0, 1, words(60))))).toBe("Too fast");
        expect(summariseIssues(assessCue(cue(0, 10, "comfortable")))).toBeNull();
    });
});

describe("describeIssues", () => {
    it("is silent when there is nothing wrong", () => {
        expect(describeIssues(assessCue(cue(0, 4, "fine")))).toBeNull();
    });

    it("names the measurement, not just the verdict", () => {
        const text = describeIssues(assessCue(cue(0, 1, "a much longer line than one second allows")))!;
        expect(text).toMatch(/characters per second/);
        expect(text).toMatch(/\d+/);
    });
});
