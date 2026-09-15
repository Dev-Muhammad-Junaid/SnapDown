// Single source of truth for time parsing/formatting across the app.
// Pure and dependency-free, so it's safe to import on both client and server.

/**
 * Parse a flexible time value to seconds. Accepts a number (returned as-is),
 * "HH:MM:SS", "MM:SS", or a plain numeric string ("12.5").
 */
export function parseTimeToSeconds(time: string | number): number {
    if (typeof time === "number") return time;
    const s = String(time ?? "");
    if (s.includes(":")) {
        const parts = s.split(":").map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return parseFloat(s) || 0;
}

/** Parse an SRT time string "HH:MM:SS,mmm" to seconds. */
export function parseSrtTime(timeStr: string): number {
    if (!timeStr) return 0;
    const [h, m, s_ms] = timeStr.split(":");
    if (!s_ms) return 0;
    const [s, ms] = s_ms.split(",");
    return (
        parseInt(h) * 3600 +
        parseInt(m) * 60 +
        parseInt(s) +
        parseInt(ms || "0") / 1000
    );
}

/** Format seconds to an SRT time string "HH:MM:SS,mmm". */
export function formatSrtTime(seconds: number): string {
    const totalMs = Math.round(Math.max(0, seconds) * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hours = Math.floor(totalMins / 60);
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Convert an SRT time string "HH:MM:SS,mmm" to ASS "H:MM:SS.cc" (centiseconds). */
export function srtTimeToAss(srtTime: string): string {
    const [hms = "", msStr = "0"] = srtTime.trim().split(",");
    const [hh = "0", mm = "00", ss = "00"] = hms.split(":");
    // Use Math.floor (not Math.round) so 999ms → 99cs, not 100cs (overflow)
    const cs = Math.min(99, Math.floor(parseInt(msStr) / 10));
    return `${parseInt(hh)}:${mm}:${ss}.${String(cs).padStart(2, "0")}`;
}

/** Format seconds to a compact clock "M:SS" (e.g. playback display). */
export function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Display-friendly "M:SS" from an SRT time string. */
export function displayTime(srtTime: string): string {
    return formatClock(parseSrtTime(srtTime));
}

/** Shift an SRT time string by `deltaMs` milliseconds (clamped at 0). */
export function shiftTime(timeStr: string, deltaMs: number): string {
    return formatSrtTime(Math.max(0, parseSrtTime(timeStr) + deltaMs / 1000));
}

/**
 * Format seconds for a subtitle cue time field: "M:SS.mmm", or "H:MM:SS.mmm"
 * once the video runs past an hour.
 *
 * Distinct from formatClock on purpose. A cue's timing is meaningful down to
 * the millisecond — that is what keeps a subtitle on the words it belongs to —
 * so the field a user types into has to be able to show the whole value.
 * Showing "1:23" for 00:01:23,450 meant editing the field rounded the cue to
 * the nearest second without saying so, and an hour-long video displayed its
 * cues as "75:04".
 */
export function formatCueTime(seconds: number): string {
    const totalMs = Math.round(Math.max(0, seconds) * 1000);
    const ms = totalMs % 1000;
    const totalSecs = Math.floor(totalMs / 1000);
    const secs = totalSecs % 60;
    const mins = Math.floor(totalSecs / 60) % 60;
    const hours = Math.floor(totalSecs / 3600);
    const msPart = String(ms).padStart(3, "0");
    return hours > 0
        ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${msPart}`
        : `${mins}:${String(secs).padStart(2, "0")}.${msPart}`;
}

/** Display-friendly cue time from an SRT time string. */
export function displayCueTime(srtTime: string): string {
    return formatCueTime(parseSrtTime(srtTime));
}

/**
 * Parse what someone typed into a cue time field, in seconds.
 *
 * Returns null — rather than 0 — for anything it can't read, so a typo can be
 * rejected and the previous value kept. Silently turning unparseable input
 * into 0 is how a cue ends up at the start of the video.
 *
 * Accepts "12", "1:23", "1:23.450", "1:23,450" (SRT's comma), and
 * "1:15:04.900". Minutes and seconds may be given unpadded.
 */
export function parseCueTime(input: string): number | null {
    const raw = input.trim().replace(",", ".");
    if (!raw) return null;
    if (!/^\d+(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(raw)) return null;

    const [whole, frac = ""] = raw.split(".");
    const parts = whole.split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    // Only the leading field may run past 59. "9:99" is a typo, not 10m39s —
    // accepting it silently moved the cue somewhere nobody asked for.
    if (parts.slice(1).some((n) => n > 59)) return null;

    let seconds: number;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else seconds = parts[0];

    // "1:23.4" is four hundred milliseconds, not four.
    const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
    return seconds + ms / 1000;
}
