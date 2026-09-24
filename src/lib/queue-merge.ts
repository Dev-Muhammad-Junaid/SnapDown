import type { QueueItem } from "@/types/media";

/**
 * Reconciles the local queue with what the server reports.
 *
 * Two kinds of item live in this list. Most have a `jobId`, meaning a row
 * exists on the server and the server's copy is authoritative. A few do not:
 * a link is added to the queue optimistically and only acquires a job once its
 * metadata has been fetched and a download actually starts. Those are local
 * facts the server has never heard of, and nothing in the response can stand
 * in for them.
 *
 * Keeping every job-less item is therefore the rule, not a special case for
 * the states that happen to precede a job. An earlier version kept only
 * "parsing" and "pending", on the reasoning that those are the states before a
 * job exists — which silently deleted the one case where no job ever would:
 * a link whose metadata fetch failed. The item was marked "error", matched
 * neither branch, and vanished on the next poll, so a download that failed
 * early disappeared without a trace while one that failed later — after a job
 * existed — showed its error correctly.
 */
export function mergeQueue(previous: QueueItem[], serverJobs: QueueItem[]): QueueItem[] {
    const localOnly = previous.filter((p) => !p.jobId);
    if (serverJobs.length === 0) return localOnly;

    const previousById = new Map(
        previous.filter((p) => p.jobId).map((p) => [p.jobId as string, p]),
    );

    const merged = serverJobs.map((job) => {
        const existing = previousById.get(job.jobId as string);
        if (!existing) return job;
        return {
            ...existing,
            ...job,
            id: existing.id,
            thumbnail: existing.thumbnail || job.thumbnail,
            title: job.title || existing.title,
            sourcePlatform: existing.sourcePlatform || job.sourcePlatform,
            duration: existing.duration || job.duration,
            formats: existing.formats,
            selectedFormat: existing.selectedFormat,
            mediaType: existing.mediaType || job.mediaType,
            imageUrl: existing.imageUrl || job.imageUrl,
            matchedProfileName: existing.matchedProfileName || job.matchedProfileName,
            matchedFormatLabel: existing.matchedFormatLabel || job.matchedFormatLabel,
            downloadPath: job.downloadPath || existing.downloadPath,
            progress: (job.status === "downloading" || job.status === "processing" || job.status === "paused")
                ? Math.max(existing.progress || 0, job.progress || 0)
                : (job.progress ?? existing.progress),
            errorText: (job.status === "error" || job.status === "cancelled")
                ? (job.errorText || existing.errorText)
                : undefined,
        } satisfies QueueItem;
    });

    return [...localOnly, ...merged];
}
