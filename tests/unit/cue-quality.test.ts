import { describe, it, expect } from "vitest";
import { assessCue, describeIssues, MAX_CPS, MAX_CHARS } from "@/components/video-editor/cue-quality";
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

    it("flags a line longer than two lines fit", () => {
        expect(assessCue(cue(0, 60, words(MAX_CHARS + 10))).issues).toContain("long");
        expect(assessCue(cue(0, 60, words(MAX_CHARS))).issues).not.toContain("long");
    });

    it("flags a cue too brief to read", () => {
        // 0.32s single words appear 34 times in the long transcript.
        expect(assessCue(cue(0, 0.32, "کرنے")).issues).toContain("brief");
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

    it("can report more than one problem at once", () => {
        const q = assessCue(cue(0, 2, words(MAX_CHARS + 40)));
        expect(q.issues).toEqual(expect.arrayContaining(["fast", "long"]));
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
