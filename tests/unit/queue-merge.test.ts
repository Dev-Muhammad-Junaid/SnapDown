import { describe, it, expect } from "vitest";
import { mergeQueue } from "@/lib/queue-merge";
import type { QueueItem } from "@/types/media";

/**
 * A link that failed before it ever became a job used to vanish from the queue
 * within one poll — no row, no error, no trace — while the same link failing a
 * moment later, once a job existed, reported its error correctly. Reported as
 * "sometimes it instantly hides from the queue, but after trying a few more
 * times it shows with error".
 */

const local = (over: Partial<QueueItem> = {}): QueueItem => ({
    id: "local-1",
    originalUrl: "https://youtube.com/watch?v=x",
    status: "parsing",
    ...over,
});

const server = (over: Partial<QueueItem> = {}): QueueItem => ({
    id: "job-1",
    jobId: "job-1",
    originalUrl: "https://youtube.com/watch?v=y",
    status: "downloading",
    ...over,
});

describe("mergeQueue", () => {
    it("keeps a link whose metadata fetch failed", () => {
        // The regression. No job exists and none ever will, so the server
        // response cannot carry this item — dropping it loses the only record
        // that the user asked for anything at all.
        const failed = local({ status: "error", errorText: "Video unavailable" });
        expect(mergeQueue([failed], [server()])).toContainEqual(failed);
    });

    it("keeps it even when the server has nothing at all to report", () => {
        const failed = local({ status: "error", errorText: "Video unavailable" });
        expect(mergeQueue([failed], [])).toEqual([failed]);
    });

    it("still keeps links that are mid-flight", () => {
        const parsing = local({ status: "parsing" });
        const pending = local({ id: "local-2", status: "pending" });
        const merged = mergeQueue([parsing, pending], []);
        expect(merged).toEqual([parsing, pending]);
    });

    it("drops a local copy once the item has a job of its own", () => {
        // Otherwise the same download would be listed twice, once from each side.
        const adopted = local({ id: "local-1", jobId: "job-1", status: "downloading" });
        const merged = mergeQueue([adopted], [server({ status: "completed" })]);
        expect(merged).toHaveLength(1);
        expect(merged[0].status).toBe("completed");
    });

    it("lets the server win on status while keeping what only the client knows", () => {
        const existing = server({ status: "downloading", thumbnail: "thumb.jpg", progress: 40 });
        const merged = mergeQueue([existing], [server({ status: "error", errorText: "boom" })]);
        expect(merged[0].status).toBe("error");
        expect(merged[0].errorText).toBe("boom");
        expect(merged[0].thumbnail).toBe("thumb.jpg");
    });

    it("never lets progress jump backwards mid-download", () => {
        const existing = server({ status: "downloading", progress: 80 });
        const merged = mergeQueue([existing], [server({ status: "downloading", progress: 20 })]);
        expect(merged[0].progress).toBe(80);
    });
});
