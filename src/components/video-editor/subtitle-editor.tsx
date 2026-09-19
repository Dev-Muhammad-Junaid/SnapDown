"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    Search,
    Copy,
    Check,
    ArrowLeftRight,
    Clock,
    ListTodo,
    AlertTriangle,
    X,
    Download,
    Upload,
    Undo2,
    Redo2,
    FileText,
    Info,
    Plus,
    Trash2,
    FoldVertical,
} from "lucide-react";
import {
    Subtitle,
    parseSrtTime,
    formatSrtTime,
    displayCueTime,
    parseCueTime,
    shiftTime,
    subtitlesToSrt,
    subtitlesToVtt,
    parseSrt,
    parseVtt,
    findActiveSubtitle,
    findNearestSubtitle,
    insertCueAfter,
    deleteCue,
    mergeCueWithNext,
    MIN_CUE_SECONDS,
} from "./subtitle-types";
import { motion, AnimatePresence } from "framer-motion";
import { hintForEvent, FLASH_MS, type HintId } from "./shortcut-hints";
import { ACCENT_ON, ACCENT_OFF } from "./accent";

/**
 * One editable cue time.
 *
 * Holds a draft string while focused so the user can type freely, and only
 * hands the value over on blur or Enter. Escape abandons the edit.
 */
function TimeField({
    value,
    onCommit,
    label,
}: {
    value: string;
    onCommit: (raw: string) => boolean;
    label: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    // Escape blurs the field, and blur commits — so the abandon has to be
    // recorded somewhere the blur handler can see immediately. A state update
    // is not: the blur handler still closes over the draft Escape just cleared,
    // and would save the very edit the user asked to throw away.
    const abandoned = useRef(false);
    const shown = draft ?? displayCueTime(value);

    const commit = () => {
        if (abandoned.current) { abandoned.current = false; setDraft(null); return; }
        if (draft === null) return;
        // A rejected edit falls back to the cue's real time by clearing the
        // draft, which is also what Escape does.
        onCommit(draft);
        setDraft(null);
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            value={shown}
            title={`${label} — M:SS.mmm`}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
                else if (e.key === "Escape") { abandoned.current = true; setDraft(null); e.currentTarget.blur(); }
            }}
            className="w-[4.75rem] bg-transparent text-center tabular-nums outline-none border-b border-transparent hover:border-border focus:border-primary rounded-none transition-colors"
        />
    );
}

function useShortcutFlash(): HintId | null {
    const [flash, setFlash] = useState<HintId | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const hint = hintForEvent(e);
            if (!hint) return;
            // A key held down repeats; keep it lit rather than restarting the
            // fade on every repeat.
            if (timer.current) clearTimeout(timer.current);
            setFlash(hint);
            timer.current = setTimeout(() => setFlash(null), FLASH_MS);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    return flash;
}

/**
 * One key cap in the footer.
 *
 * `lit` is the shortcut firing. `spent` means the shortcut exists but has
 * nothing left to do — undo with an empty history — which is worth showing
 * distinctly: dark would read as "not a shortcut", and lighting it would claim
 * something happened.
 */
function HintCap({
    cap,
    label,
    lit,
    spent = false,
}: { cap: string; label: string; lit: boolean; spent?: boolean }) {
    return (
        <span
            className={cn(
                "transition-opacity duration-200",
                spent && !lit ? "opacity-40" : "",
            )}
        >
            <kbd
                className={cn(
                    "rounded border px-1 py-0.5 font-mono text-[8px] transition-all duration-150",
                    lit
                        ? cn(ACCENT_ON, "scale-110 shadow-sm")
                        : spent
                            ? "border-dashed border-border/60 bg-transparent"
                            : "border-border/60 bg-muted",
                )}
            >
                {cap}
            </kbd>{" "}
            {label}
        </span>
    );
}

interface SubtitleEditorProps {
    subtitles: Subtitle[];
    onSubtitlesChange: (subtitles: Subtitle[]) => void;
    currentTime: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onSeek: (time: number) => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
}

export function SubtitleEditor({
    subtitles,
    onSubtitlesChange,
    currentTime,
    videoRef,
    onSeek,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
}: SubtitleEditorProps) {
    const flash = useShortcutFlash();
    const [searchQuery, setSearchQuery] = useState("");
    const [showReviewQueue, setShowReviewQueue] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const [showTimingOffset, setShowTimingOffset] = useState(false);
    const [timingOffsetMs, setTimingOffsetMs] = useState(0);
    const [copied, setCopied] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    /** Cue whose text box should take the caret on the next commit. */
    const pendingFocusRef = useRef<number | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Stats
    const totalWords = subtitles.reduce(
        (acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length,
        0
    );
    const totalDurationSec =
        subtitles.length > 0
            ? parseSrtTime(subtitles[subtitles.length - 1].end) -
              parseSrtTime(subtitles[0].start)
            : 0;
    const statsMins = Math.floor(totalDurationSec / 60);
    const statsSecs = Math.floor(totalDurationSec % 60);
    const needsReviewCount = subtitles.filter((s) => s.confidence < 0.8).length;

    /** Whether what's on screen is a subset of the transcript. */
    const isFiltered = searchQuery.trim() !== "" || showReviewQueue;

    // Filter subtitles
    const filteredSubtitles = subtitles.filter((s) => {
        if (showReviewQueue && s.confidence >= 0.8) return false;
        if (searchQuery && !s.text.toLowerCase().includes(searchQuery.toLowerCase()))
            return false;
        return true;
    });

    // Find match count
    const findMatchCount = findText
        ? subtitles.reduce((count, s) => {
              const regex = new RegExp(
                  findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "gi"
              );
              return count + (s.text.match(regex)?.length ?? 0);
          }, 0)
        : 0;

    // Track active subtitle from video playback
    useEffect(() => {
        const active = findActiveSubtitle(filteredSubtitles, currentTime);
        if (active) {
            if (active.id !== activeId) {
                setActiveId(active.id);
                document.getElementById(`sub-${active.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        } else {
            const nearest = findNearestSubtitle(filteredSubtitles, currentTime);
            if (nearest && nearest.id !== activeId) {
                setActiveId(nearest.id);
                document.getElementById(`sub-${nearest.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [currentTime, filteredSubtitles, activeId]);

    useEffect(() => {
        const id = pendingFocusRef.current;
        if (id === null) return;
        pendingFocusRef.current = null;
        document.querySelector<HTMLTextAreaElement>(`#sub-${id} textarea`)?.focus();
    });

    /**
     * The keyboard handler reads through this instead of closing over state.
     *
     * Its dependencies used to include `filteredSubtitles`, which is rebuilt on
     * every render — so the listener was torn down and re-added on every render
     * too, and keystrokes arriving in that window were dropped. In practice
     * ↑↓ navigation and ⌘Z never fired at all, while the hint row underneath
     * advertised both.
     */
    const latest = useRef({ activeId, filteredSubtitles, onSeek, onUndo, onRedo });
    useEffect(() => {
        latest.current = { activeId, filteredSubtitles, onSeek, onUndo, onRedo };
    });

    // Keyboard shortcuts — registered once; see `latest` above.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const { activeId, filteredSubtitles, onSeek, onUndo, onRedo } = latest.current;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                onUndo?.();
                return;
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
                e.preventDefault();
                onRedo?.();
                return;
            }

            switch (e.key) {
                case "ArrowUp": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex((s) => s.id === activeId);
                    if (idx > 0) {
                        const prev = filteredSubtitles[idx - 1];
                        setActiveId(prev.id);
                        onSeek(parseSrtTime(prev.start));
                        document.getElementById(`sub-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
                case "ArrowDown": {
                    e.preventDefault();
                    const idx = filteredSubtitles.findIndex((s) => s.id === activeId);
                    if (idx < filteredSubtitles.length - 1) {
                        const next = filteredSubtitles[idx + 1];
                        setActiveId(next.id);
                        onSeek(parseSrtTime(next.start));
                        document.getElementById(`sub-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    break;
                }
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    /**
     * Commit an edited cue time.
     *
     * Applied on blur or Enter rather than on every keystroke: half-typed input
     * is not a value, and rewriting the cue from it meant the field fought
     * whoever was typing into it.
     *
     * Unreadable input is rejected outright — the field springs back to what
     * the cue actually says. The alternative, treating it as zero, silently
     * moves the subtitle to the start of the video.
     */
    const commitTime = useCallback(
        (id: number, field: "start" | "end", value: string): boolean => {
            const parsed = parseCueTime(value);
            if (parsed === null) return false;

            const cue = subtitles.find((s) => s.id === id);
            if (!cue) return false;
            const start = parseSrtTime(cue.start);
            const end = parseSrtTime(cue.end);

            // A cue that ends before it begins is not a cue. Rather than
            // refusing the edit, keep the edge the user moved and push the
            // other one just far enough to stay valid.
            const next =
                field === "start"
                    ? Math.max(0, Math.min(parsed, end - MIN_CUE_SECONDS))
                    : Math.max(parsed, start + MIN_CUE_SECONDS);

            onSubtitlesChange(
                subtitles.map((sub) =>
                    sub.id === id ? { ...sub, [field]: formatSrtTime(next) } : sub
                )
            );
            return true;
        },
        [subtitles, onSubtitlesChange]
    );

    /**
     * Insert an empty cue after this one and put the caret in it — adding a
     * line you then have to hunt for would be half a feature.
     */
    const handleAddCue = useCallback(
        (afterId: number) => {
            const result = insertCueAfter(subtitles, afterId);
            if (!result) return;
            onSubtitlesChange(result.subtitles);
            const newId = result.subtitles[result.newIndex].id;
            setActiveId(newId);
            // Focused from an effect rather than here: the row does not exist
            // in the DOM until React commits, and a requestAnimationFrame can
            // still land before that commit.
            pendingFocusRef.current = newId;
        },
        [subtitles, onSubtitlesChange],
    );

    const handleDeleteCue = useCallback(
        (id: number) => {
            const result = deleteCue(subtitles, id);
            if (!result) return;
            onSubtitlesChange(result.subtitles);
            setActiveId(result.activeId);
        },
        [subtitles, onSubtitlesChange],
    );

    const handleMergeCue = useCallback(
        (id: number) => {
            const result = mergeCueWithNext(subtitles, id);
            if (!result) return;
            onSubtitlesChange(result.subtitles);
            setActiveId(result.activeId);
        },
        [subtitles, onSubtitlesChange],
    );

    const handleExportSrt = useCallback(() => {
        const srt = subtitlesToSrt(subtitles);
        const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
    }, [subtitles]);

    const handleExportVtt = useCallback(() => {
        const vtt = subtitlesToVtt(subtitles);
        const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.vtt";
        a.click();
        URL.revokeObjectURL(url);
    }, [subtitles]);

    const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            if (!content) return;
            const parsed = file.name.endsWith(".vtt") || content.trimStart().startsWith("WEBVTT")
                ? parseVtt(content)
                : parseSrt(content);
            if (parsed.length > 0) onSubtitlesChange(parsed);
        };
        reader.readAsText(file);
        // Reset so the same file can be re-imported
        e.target.value = "";
    }, [onSubtitlesChange]);

    const handleTextChange = useCallback(
        (id: number, newText: string) => {
            const updated = subtitles.map((s) =>
                s.id === id ? { ...s, text: newText } : s
            );
            onSubtitlesChange(updated);
        },
        [subtitles, onSubtitlesChange]
    );

    const handleCopyTranscript = async () => {
        const text = filteredSubtitles.map((s) => s.text).join("\n");
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReplaceAll = () => {
        if (!findText || findMatchCount === 0) return;
        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");
        const updated = subtitles.map((s) => ({
            ...s,
            text: s.text.replace(regex, replaceText),
        }));
        onSubtitlesChange(updated);
        setFindText("");
        setReplaceText("");
    };

    const shiftAllTimings = (deltaMs: number) => {
        const updated = subtitles.map((s) => ({
            ...s,
            start: shiftTime(s.start, deltaMs),
            end: shiftTime(s.end, deltaMs),
        }));
        onSubtitlesChange(updated);
        setTimingOffsetMs((prev) => prev + deltaMs);
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            {/* Toolbar */}
            <div className="border-b border-border bg-card/90 backdrop-blur-sm shrink-0">
                <div className="h-12 flex items-center justify-between px-3 gap-2">
                    <div className="flex items-center gap-1">
                        {/* Review queue — icon-only with count badge */}
                        <button
                            onClick={() => setShowReviewQueue(!showReviewQueue)}
                            title={`Review queue${needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}`}
                            className={cn(
                                "relative p-1.5 rounded-md transition-colors",
                                showReviewQueue ? ACCENT_ON : cn("bg-muted", ACCENT_OFF)
                            )}
                        >
                            <ListTodo className="w-3.5 h-3.5" />
                            {needsReviewCount > 0 && (
                                <span className="pointer-events-none absolute -top-1 -right-1 min-w-[14px] rounded-full bg-destructive px-1 text-center text-[9px] font-medium leading-[14px] text-background">
                                    {needsReviewCount}
                                </span>
                            )}
                        </button>

                        {/* Transcript stats — tooltip on hover (native title) */}
                        <button
                            type="button"
                            title={`${subtitles.length} subtitles · ${totalWords} words · ${statsMins}m ${String(statsSecs).padStart(2, "0")}s`}
                            aria-label="Transcript info"
                            className={cn("p-1.5 rounded-md transition-colors", ACCENT_OFF)}
                        >
                            <Info className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-0.5">
                        {/* Undo */}
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className={cn("p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30", ACCENT_OFF)}
                            title="Undo (⌘Z)"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Redo */}
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className={cn("p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30", ACCENT_OFF)}
                            title="Redo (⌘Y)"
                        >
                            <Redo2 className="w-3.5 h-3.5" />
                        </button>

                        <div className="w-px h-4 bg-border mx-0.5" />

                        {/* Timing offset */}
                        <button
                            onClick={() => setShowTimingOffset(!showTimingOffset)}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                showTimingOffset ? ACCENT_ON : ACCENT_OFF
                            )}
                            title="Timing offset"
                        >
                            <Clock className="w-3.5 h-3.5" />
                        </button>

                        {/* Find & Replace */}
                        <button
                            onClick={() => setShowFindReplace(!showFindReplace)}
                            className={cn(
                                "p-1.5 rounded-md transition-colors",
                                showFindReplace ? ACCENT_ON : ACCENT_OFF
                            )}
                            title="Find & Replace"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Copy transcript */}
                        <button
                            onClick={handleCopyTranscript}
                            className={cn("p-1.5 rounded-md transition-colors", ACCENT_OFF)}
                            title="Copy transcript"
                        >
                            {copied ? (
                                <Check className="w-3.5 h-3.5 text-chart-2" />
                            ) : (
                                <Copy className="w-3.5 h-3.5" />
                            )}
                        </button>

                        {/* Import SRT / VTT */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={cn("p-1.5 rounded-md transition-colors", ACCENT_OFF)}
                            title="Import SRT or VTT file"
                        >
                            <Upload className="w-3.5 h-3.5" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".srt,.vtt"
                            className="hidden"
                            onChange={handleImportFile}
                        />

                        {/* Export SRT */}
                        <button
                            onClick={handleExportSrt}
                            className={cn("p-1.5 rounded-md transition-colors", ACCENT_OFF)}
                            title="Export as .srt"
                        >
                            <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Export VTT */}
                        <button
                            onClick={handleExportVtt}
                            className={cn("p-1.5 rounded-md transition-colors", ACCENT_OFF)}
                            title="Export as .vtt"
                        >
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Search bar */}
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search subtitles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-muted/50 border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Timing Offset Panel */}
                <AnimatePresence>
                    {showTimingOffset && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border"
                        >
                            <div className="px-3 py-2.5 flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    Shift All:
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-background border border-border text-foreground">
                                    Current: {timingOffsetMs > 0 ? `+${timingOffsetMs}` : timingOffsetMs}ms
                                </span>
                                {[-1000, -500, -100, 100, 500, 1000].map((ms) => (
                                    <button
                                        key={ms}
                                        onClick={() => shiftAllTimings(ms)}
                                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted/60 border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                    >
                                        {ms > 0 ? `+${ms}` : ms}ms
                                    </button>
                                ))}
                                <button
                                    onClick={() => { if (timingOffsetMs !== 0) shiftAllTimings(-timingOffsetMs); }}
                                    disabled={timingOffsetMs === 0}
                                    className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-muted disabled:hover:text-foreground"
                                >
                                    Reset
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Find & Replace Panel */}
                <AnimatePresence>
                    {showFindReplace && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border"
                        >
                            <div className="px-3 py-2.5 space-y-2">
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Find..."
                                        value={findText}
                                        onChange={(e) => setFindText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 bg-muted/50 border border-border rounded text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-all"
                                    />
                                    {findText && (
                                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                            {findMatchCount} found
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        placeholder="Replace with..."
                                        value={replaceText}
                                        onChange={(e) => setReplaceText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 bg-muted/50 border border-border rounded text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-all"
                                    />
                                    <button
                                        onClick={handleReplaceAll}
                                        disabled={!findText || findMatchCount === 0}
                                        className={cn("shrink-0 rounded px-3 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-30", ACCENT_ON, "hover:opacity-90")}
                                    >
                                        Replace All
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Subtitle List */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto overscroll-contain subtitle-scroll"
            >
                {filteredSubtitles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <ListTodo className="w-6 h-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">
                            {searchQuery
                                ? "No subtitles match your search"
                                : showReviewQueue
                                  ? "No subtitles need review"
                                  : "No subtitles available"}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                            {!searchQuery && !showReviewQueue
                                ? "Transcribe the video first to generate subtitles"
                                : ""}
                        </p>
                    </div>
                ) : (
                    <div className="p-2 space-y-2">
                        {filteredSubtitles.map((subtitle) => {
                            const isActive = subtitle.id === activeId;
                            const isLowConfidence = subtitle.confidence < 0.8;
                            // Deleting the last one would leave the empty state,
                            // which only offers transcription — no way back to a
                            // list you can add to.
                            const isOnlyCue = subtitles.length === 1;
                            // Merge joins a cue to the one below it, so the
                            // bottom cue has nothing to join to. Compared
                            // against the unfiltered list: a search or the
                            // review queue can hide the cue below without
                            // meaning it is not there.
                            const isLastCue = subtitles[subtitles.length - 1]?.id === subtitle.id;
                            // While the list is filtered, the row under this
                            // one on screen is not the cue merge would join it
                            // to. Rather than quietly pulling in words from a
                            // cue the user cannot see, the button says so.
                            const mergeBlockedByFilter = isFiltered && !isLastCue;

                            return (
                                <div
                                    key={subtitle.id}
                                    id={`sub-${subtitle.id}`}
                                    onClick={() => {
                                        setActiveId(subtitle.id);
                                        onSeek(parseSrtTime(subtitle.start));
                                    }}
                                    className={cn(
                                        "group relative rounded-lg p-2.5 cursor-pointer transition-all duration-200 border",
                                        isActive
                                            ? "bg-muted border-border shadow-sm"
                                            : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border/60"
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground tabular-nums">
                                            <TimeField
                                                value={subtitle.start}
                                                label="Start time"
                                                onCommit={(raw) => commitTime(subtitle.id, "start", raw)}
                                            />
                                            <span>→</span>
                                            <TimeField
                                                value={subtitle.end}
                                                label="End time"
                                                onCommit={(raw) => commitTime(subtitle.id, "end", raw)}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isLowConfidence && (
                                                <span className="flex items-center gap-0.5 text-chart-3/80" title="Low confidence — review recommended">
                                                    <AlertTriangle className="w-3 h-3" />
                                                </span>
                                            )}
                                            {/* Merge and delete take the
                                                number's place on hover. The
                                                slot is wide enough for both at
                                                rest, so the swap never shifts
                                                the row under the pointer. */}
                                            <span className="flex w-10 items-center justify-end gap-1">
                                                <span className="text-[9px] text-muted-foreground/60 font-mono group-hover:hidden">
                                                    #{subtitle.id}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={isLastCue || mergeBlockedByFilter}
                                                    title={isLastCue
                                                        ? "Nothing below to merge into"
                                                        : mergeBlockedByFilter
                                                            ? "Clear the search to merge — the cue below on screen isn't the one below in the transcript"
                                                            : "Merge with the subtitle below"}
                                                    aria-label="Merge with the subtitle below"
                                                    onClick={(e) => { e.stopPropagation(); handleMergeCue(subtitle.id); }}
                                                    className="hidden size-3.5 items-center justify-center rounded text-muted-foreground transition-colors group-hover:flex hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground"
                                                >
                                                    <FoldVertical className="size-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isOnlyCue}
                                                    title={isOnlyCue
                                                        ? "The last subtitle can't be deleted — there would be no way to add one back"
                                                        : "Delete this subtitle"}
                                                    aria-label="Delete this subtitle"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteCue(subtitle.id); }}
                                                    className="hidden size-3.5 items-center justify-center rounded text-muted-foreground transition-colors group-hover:flex hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted-foreground"
                                                >
                                                    <Trash2 className="size-3" />
                                                </button>
                                            </span>
                                        </div>
                                    </div>

                                    <textarea
                                        value={subtitle.text}
                                        onChange={(e) => handleTextChange(subtitle.id, e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="New subtitle…"
                                        rows={Math.max(1, Math.ceil(subtitle.text.length / 45))}
                                        className={cn(
                                            "w-full bg-transparent text-xs leading-relaxed text-foreground/90 resize-none outline-none rounded px-1.5 py-1 -mx-1.5 transition-all placeholder:text-muted-foreground/50",
                                            isActive
                                                ? "bg-muted/40 focus:bg-muted/60"
                                                : "hover:bg-muted/30 focus:bg-muted/40"
                                        )}
                                    />

                                    {/* Sits on the block's bottom edge and only
                                        exists on hover, so the resting list
                                        gains no height for it. */}
                                    <button
                                        type="button"
                                        title="Add a subtitle after this one"
                                        aria-label="Add a subtitle after this one"
                                        onClick={(e) => { e.stopPropagation(); handleAddCue(subtitle.id); }}
                                        className="absolute left-1/2 -bottom-2 z-10 -translate-x-1/2 flex size-3.5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:border-foreground hover:bg-foreground hover:text-background group-hover:opacity-100 focus-visible:opacity-100"
                                    >
                                        <Plus className="size-2.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Keyboard shortcut hints. Each cap lights as its shortcut fires,
                which turns the row from a legend you read once into feedback
                that the keystroke landed — useful precisely because these are
                not shortcuts anyone memorises. */}
            <div className="px-3 py-2 text-[9px] text-muted-foreground text-center border-t border-border flex items-center justify-center gap-2 shrink-0 bg-muted/40">
                <HintCap cap="↑↓" label="Nav" lit={flash === "nav"} />
                <HintCap cap="Space" label="Play" lit={flash === "play"} />
                <HintCap cap="J" label="-5s" lit={flash === "back"} />
                <HintCap cap="L" label="+5s" lit={flash === "fwd"} />
                <HintCap cap="⌘Z" label="Undo" lit={flash === "undo"} spent={!canUndo} />
            </div>
        </div>
    );
}
