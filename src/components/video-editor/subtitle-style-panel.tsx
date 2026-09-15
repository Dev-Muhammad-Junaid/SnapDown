"use client";

/**
 * SubtitleStylePanel — floating, draggable subtitle style panel.
 *
 * Renders as `position: absolute` inside the full-viewport modal so it is never
 * clipped by overflow:hidden siblings and avoids the `position:fixed` +
 * CSS-transform stacking-context bug (parent modal has Framer Motion transforms
 * during its entrance animation).
 *
 * Drag is restricted to the drag-handle row at the top.  On release the panel
 * springs to the nearest viewport corner (top-left, top-right, bottom-left,
 * bottom-right) so it never ends up stranded in the middle of the screen.
 *
 * Preset switching deliberately preserves the user's chosen colors, font,
 * position, and size — only structural visual properties (outline, shadow,
 * bold/italic, letter-spacing, font-size-scale) are updated.
 */

import React, { useRef, useCallback, useEffect, useState } from "react";
import {
    motion,
    useMotionValue,
    animate,
    useDragControls,
} from "framer-motion";
import {
    GripVertical, Bold, Italic, X,
    Captions, Highlighter, Square, Clapperboard, Type, AlignCenter, Lightbulb,
    Minus, Sparkles, Zap, ArrowUp, Mic, Flashlight, Waves,
    type LucideIcon,
} from "lucide-react";
import { MiniSlider } from "@/components/ui/mini-slider";
import { ACCENT_ON, ACCENT_OFF } from "./accent";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./subtitle-types";
import { BOX_STYLE_PRESETS, getPresetDefaults, createDefaultStyleConfig } from "@/lib/ass-builder";
import type { SubtitleStyleConfig } from "@/lib/ass-builder";

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_W  = 272; // default width; the user can drag it wider or narrower
const PANEL_H  = 460; // default height, clamped to what the window can show
const MIN_W    = 240; // below this the preset and font grids start to wrap badly
const MAX_W    = 520;
const MIN_H    = 200;
const MARGIN   = 16;
const HDR_H    = 52; // approximate modal header height
const MAX_H_INSET = 96; // header + transport bar; mirrors the CSS maxHeight

/**
 * The panel's size survives closing it, switching modes, and reopening it —
 * it is a working preference, and having to drag it back out every time would
 * make resizing not worth doing.
 */
const SIZE_KEY = "snapdown.subtitleStylePanel.size";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The tallest the panel can actually render. This has to match the `maxHeight`
 * on the element itself — clamp a stored size any harder than CSS does and
 * reopening the panel silently shrinks it, which reads as the app forgetting
 * the size you gave it.
 */
const maxPanelH = () => Math.max(MIN_H, window.innerHeight - MAX_H_INSET);
const maxPanelW = () => clamp(window.innerWidth - 2 * MARGIN, MIN_W, MAX_W);

function defaultPanelSize(): { w: number; h: number } {
    if (typeof window === "undefined") return { w: PANEL_W, h: PANEL_H };
    return { w: clamp(PANEL_W, MIN_W, maxPanelW()), h: clamp(PANEL_H, MIN_H, maxPanelH()) };
}

function loadPanelSize(): { w: number; h: number } {
    const fallback = defaultPanelSize();
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(SIZE_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown };
        if (typeof parsed.w !== "number" || typeof parsed.h !== "number") return fallback;
        // Clamped on read as well as on write: the stored size may come from a
        // much larger window than the one we are opening in now.
        return { w: clamp(parsed.w, MIN_W, maxPanelW()), h: clamp(parsed.h, MIN_H, maxPanelH()) };
    } catch {
        return fallback;
    }
}

// ── Static data ───────────────────────────────────────────────────────────────

export const FONT_OPTIONS = [
    { id: "Roboto",     label: "Roboto"     },
    { id: "Anton",      label: "Anton"      },
    { id: "Lora",       label: "Lora"       },
    { id: "Oswald",     label: "Oswald"     },
    { id: "Space Mono", label: "Mono"       },
    { id: "Nunito",     label: "Nunito"     },
];

const TEXT_COLORS = [
    "#FFFFFF", "#FACC15", "#000000", "#EF4444",
    "#22C55E", "#3B82F6", "#F97316", "#EC4899",
];

const ANIMATIONS: Array<{ id: SubtitleStyleConfig["animation"]; Icon: LucideIcon; label: string }> = [
    { id: "none",     Icon: Minus,    label: "None"    },
    { id: "fade",     Icon: Sparkles, label: "Fade"    },
    { id: "pop",      Icon: Zap,      label: "Pop"     },
    { id: "slide-up", Icon: ArrowUp,  label: "Slide"   },
    { id: "karaoke",  Icon: Mic,      label: "Karaoke" },
];

/**
 * Line icons for the presets, replacing the emoji the list used to carry.
 *
 * Emoji are drawn by the OS, so they ignore the theme, ignore the accent, and
 * land at a different weight and baseline from every other glyph in the panel.
 * Keyed here rather than on the preset itself so the shared preset data stays
 * free of anything that only the panel cares about.
 */
const PRESET_ICONS: Record<string, LucideIcon> = {
    classic:       Captions,
    tiktok:        Highlighter,
    box:           Square,
    cinematic:     Clapperboard,
    outline:       Type,
    "bold-center": AlignCenter,
    reveal:        Lightbulb,
};

const POSITION_GRID: Array<{
    v: SubtitleStyleConfig["positionV"];
    h: SubtitleStyleConfig["positionH"];
    label: string;
}> = [
    { v: "top",    h: "left",   label: "Top left"      },
    { v: "top",    h: "center", label: "Top center"    },
    { v: "top",    h: "right",  label: "Top right"     },
    { v: "middle", h: "left",   label: "Middle left"   },
    { v: "middle", h: "center", label: "Middle center" },
    { v: "middle", h: "right",  label: "Middle right"  },
    { v: "bottom", h: "left",   label: "Bottom left"   },
    { v: "bottom", h: "center", label: "Bottom center" },
    { v: "bottom", h: "right",  label: "Bottom right"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Small uppercase section heading — matches the tone of the Cues toolbar. */
function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {children}
        </p>
    );
}

/** Section wrapper — consistent padding + bottom border (last:border-b-0). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="px-3 py-2.5 border-b border-border/40 last:border-b-0">
            <SectionHeader>{title}</SectionHeader>
            {children}
        </section>
    );
}

/** Labelled slider row — compact track in the same language as the export
 *  quality slider, with the value alongside rather than under it. */
function SliderRow({
    label, value, min, max, step = 1, onChange, decimals = 0,
}: {
    label: string; value: number; min: number; max: number;
    step?: number; onChange: (v: number) => void; decimals?: number;
}) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted-foreground w-[52px] shrink-0">{label}</span>
            <MiniSlider
                value={value} min={min} max={max} step={step}
                onValueChange={onChange}
                aria-label={label}
                className="flex-1"
            />
            <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
                {value.toFixed(decimals)}
            </span>
        </div>
    );
}

/**
 * A horizontally scrolling row of chips.
 *
 * These lists were 3- and 5-column grids of tall cells with the icon stacked
 * above its label, which cost most of the panel's height for three sections
 * that are really just "pick one". Laid out along a row instead, each option is
 * one line tall, the row scrolls rather than wrapping, and the height it gives
 * back is where a preset preview can live later.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);

    // Fades the right edge while there is more row to scroll to. macOS hides
    // overlay scrollbars until you actually scroll, so without this a cut-off
    // chip just looks like a clipped layout rather than an invitation.
    //
    // Written straight to the DOM rather than through state: this runs on every
    // scroll frame, and a re-render per frame to move a gradient is not a trade
    // worth making.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const overflows = el.scrollWidth > el.clientWidth + 1;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
            el.dataset.more = overflows && !atEnd ? "true" : "false";
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, []);

    return (
        <div
            ref={ref}
            data-more="false"
            className={cn(
                "-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                "data-[more=true]:[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]",
            )}
        >
            {children}
        </div>
    );
}

/** One option in a ChipRow. `shrink-0` is what makes the row scroll instead of
 *  squeezing every chip until its label is unreadable. */
function Chip({
    active, onClick, title, children,
}: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-all",
                active ? ACCENT_ON : cn("border-border bg-muted/40", ACCENT_OFF),
            )}
        >
            {children}
        </button>
    );
}

/** Compact color picker row — swatch + hex code + hidden native input. */
function ColorRow({
    label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex items-center gap-2 py-0.5">
            <span className="text-[10px] text-muted-foreground w-[68px] shrink-0">{label}</span>
            <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-md border border-border bg-muted/40 hover:bg-muted px-1.5 py-0.5 transition-colors">
                <span
                    className="w-3.5 h-3.5 rounded-sm border border-border shrink-0"
                    style={{ backgroundColor: value }}
                />
                <span className="text-[10px] text-foreground font-mono tabular-nums flex-1">
                    {value.toUpperCase()}
                </span>
                <input
                    type="color"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="absolute w-0 h-0 opacity-0"
                />
            </label>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SubtitleStylePanelProps {
    config: SubtitleStyleConfig;
    onChange: (updates: Partial<SubtitleStyleConfig>) => void;
    /** When true, renders as a plain scrollable div instead of a floating overlay */
    embedded?: boolean;
    /** Dismiss the floating panel. Styling is optional, so it should be
     *  possible to get it out of the way and see the video underneath. */
    onClose?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SubtitleStylePanel({ config, onChange, embedded = false, onClose }: SubtitleStylePanelProps) {
    // Motion values / drag — only used in floating mode
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragControls = useDragControls();

    // Mirrored in a ref because the pointermove handler below is registered
    // once per gesture and would otherwise close over a stale size.
    // Read the stored size up front rather than in an effect. The panel only
    // ever mounts inside an already-open editor modal, so there is no server
    // render for a localStorage read to disagree with.
    const [size, setSize] = useState<{ w: number; h: number }>(loadPanelSize);
    const sizeRef = useRef(size);
    const applySize = useCallback((next: { w: number; h: number }) => {
        sizeRef.current = next;
        setSize(next);
    }, []);

    useEffect(() => {
        if (embedded || typeof window === "undefined") return;
        mx.set(window.innerWidth  - sizeRef.current.w - MARGIN);
        my.set(window.innerHeight - sizeRef.current.h - MARGIN - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded]);

    /**
     * Drag the bottom-right grip to resize.
     *
     * Plain pointer events rather than another Framer drag: this has to run
     * while the panel's own drag is active on the same element tree, and the
     * two would fight over pointer capture.
     */
    const beginResize = useCallback((event: React.PointerEvent) => {
        if (embedded) return;
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startY = event.clientY;
        const start = { ...sizeRef.current };
        const originX = mx.get();
        const originY = my.get();

        const onMove = (e: PointerEvent) => {
            applySize({
                // The upper bound is the window edge, not MAX_W alone, so the
                // panel can never be resized out past where it can be seen.
                w: clamp(start.w + (e.clientX - startX), MIN_W, Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - originX - MARGIN))),
                h: clamp(start.h + (e.clientY - startY), MIN_H, Math.min(maxPanelH(), Math.max(MIN_H, window.innerHeight - originY - MARGIN))),
            });
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            try {
                window.localStorage.setItem(SIZE_KEY, JSON.stringify(sizeRef.current));
            } catch { /* private mode, or storage full — the size just won't persist */ }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }, [embedded, mx, my, applySize]);

    const handleDragEnd = useCallback(() => {
        if (embedded) return;
        const el = panelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const snapX = cx < vw / 2 ? MARGIN : vw - rect.width - MARGIN;
        const snapY = cy < vh / 2
            ? HDR_H + MARGIN
            : vh - rect.height - MARGIN - 80;

        animate(mx, snapX, { type: "spring", stiffness: 320, damping: 32 });
        animate(my, snapY, { type: "spring", stiffness: 320, damping: 32 });
    }, [embedded, mx, my]);

    useEffect(() => {
        if (embedded) return;
        const onResize = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const el = panelRef.current;
            const h = el?.offsetHeight ?? 380;
            // Shrink the panel too, not just its position — a window narrower
            // than the panel would otherwise leave part of it unreachable.
            applySize({
                w: clamp(sizeRef.current.w, MIN_W, maxPanelW()),
                h: clamp(sizeRef.current.h, MIN_H, maxPanelH()),
            });
            mx.set(Math.max(0, Math.min(mx.get(), vw - sizeRef.current.w - MARGIN)));
            my.set(Math.max(HDR_H, Math.min(my.get(), vh - h - MARGIN)));
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [embedded, mx, my, applySize]);

    /**
     * Clicking a preset applies its full visual identity — colours, border
     * model, animation, casing, position. We reset from the preset's complete
     * default config (so flags like uppercase / blur from a previous preset
     * are cleared), keeping only the user's chosen font unless the preset
     * pins its own.
     */
    const handlePresetClick = (presetId: string) => {
        const full = createDefaultStyleConfig(presetId);
        const pinnedFont = getPresetDefaults(presetId).fontFamily;
        onChange({ ...full, fontFamily: pinnedFont ?? config.fontFamily });
    };

    const isBoxStyle = BOX_STYLE_PRESETS.has(config.preset);

    // For TikTok / Reveal, `primaryColor` is the highlight colour (the box /
    // the spoken-word colour), not the body text colour — so label it clearly.
    const isHighlightPreset = config.preset === "tiktok" || config.preset === "reveal";
    const colorLabel = isHighlightPreset ? "Highlight Color" : "Text Color";
    const colorHint =
        config.preset === "tiktok" ? "Colour of the box behind the spoken word."
        : config.preset === "reveal" ? "Colour each word turns as it's spoken."
        : null;
    // TikTok renders its own fixed stroke, so the outline controls do nothing.
    const showOutlineSection = !isBoxStyle && config.preset !== "tiktok";

    // ── Shared panel body (used in both embedded and floating modes) ─────────
    const panelBody = (
        <div className="overflow-y-auto flex-1 min-h-0">

            {/* ── Presets ── */}
            <Section title="Preset">
                <ChipRow>
                    {STYLE_PRESETS.map(p => {
                        const Icon = PRESET_ICONS[p.id] ?? Captions;
                        return (
                            <Chip
                                key={p.id}
                                active={config.preset === p.id}
                                onClick={() => handlePresetClick(p.id)}
                                title={p.desc}
                            >
                                <Icon className="size-3 shrink-0" />
                                {p.name}
                            </Chip>
                        );
                    })}
                </ChipRow>
            </Section>

            {/* ── Font (grid with previews) ── */}
            <Section title="Font">
                <ChipRow>
                    {FONT_OPTIONS.map(f => (
                        <Chip
                            key={f.id}
                            active={config.fontFamily === f.id}
                            onClick={() => onChange({ fontFamily: f.id })}
                            title={f.id}
                        >
                            {/* The specimen stays set in the font itself — it is
                                the only part of the chip that says what you are
                                choosing. */}
                            <span style={{ fontFamily: f.id }} className="text-[13px] leading-none">Aa</span>
                            <span style={{ fontFamily: f.id }}>{f.label}</span>
                        </Chip>
                    ))}
                </ChipRow>
            </Section>

            {/* ── Reveal Options (only when Reveal preset is active) ── */}
            {config.preset === "reveal" && (
                <Section title="Reveal Options">
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => onChange({ revealFadeInactive: !config.revealFadeInactive })}
                            className={cn(
                                "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                config.revealFadeInactive ? ACCENT_ON : "border-border bg-muted/40 text-foreground hover:bg-muted"
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <Flashlight className="size-3 shrink-0" />
                                Fade inactive words
                            </span>
                            <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded",
                                config.revealFadeInactive ? "bg-background/20" : "bg-muted",
                            )}>
                                {config.revealFadeInactive ? "ON" : "OFF"}
                            </span>
                        </button>
                        <button
                            onClick={() => onChange({ revealWordEntrance: !config.revealWordEntrance })}
                            className={cn(
                                "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all",
                                config.revealWordEntrance ? ACCENT_ON : "border-border bg-muted/40 text-foreground hover:bg-muted"
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                <Waves className="size-3 shrink-0" />
                                Word-by-word entrance
                            </span>
                            <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded",
                                config.revealWordEntrance ? "bg-background/20" : "bg-muted",
                            )}>
                                {config.revealWordEntrance ? "ON" : "OFF"}
                            </span>
                        </button>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-snug">
                            Combine both for a spotlight that follows the speaker.
                        </p>
                    </div>
                </Section>
            )}

            {/* ── Animation ── */}
            <Section title="Animation">
                <ChipRow>
                    {ANIMATIONS.map(({ id, Icon, label }) => (
                        <Chip
                            key={id}
                            active={config.animation === id}
                            onClick={() => onChange({ animation: id })}
                            title={label}
                        >
                            <Icon className="size-3 shrink-0" />
                            {label}
                        </Chip>
                    ))}
                </ChipRow>
            </Section>

            {/* ── Position (3×3 grid) + Style (B / I) ── */}
            <Section title="Position & Style">
                <div className="flex items-center gap-3">
                    <div className="grid shrink-0 grid-cols-3 gap-0.5">
                        {POSITION_GRID.map(cell => {
                            const active = config.positionV === cell.v && config.positionH === cell.h;
                            return (
                                <button
                                    key={`${cell.v}-${cell.h}`}
                                    onClick={() => onChange({ positionV: cell.v, positionH: cell.h })}
                                    title={cell.label}
                                    className={cn(
                                        "flex size-[18px] items-center justify-center rounded-[4px] border transition-all",
                                        active ? ACCENT_ON : "border-border bg-muted/40 hover:bg-muted",
                                    )}
                                >
                                    <div className={cn(
                                        "size-1 rounded-full",
                                        active ? "bg-background" : "bg-muted-foreground/50",
                                    )} />
                                </button>
                            );
                        })}
                    </div>
                    {/* B and I are universally legible on their own, so they take
                        an icon button's worth of room rather than a full-width
                        labelled row each. */}
                    <div className="flex gap-1">
                        {([
                            { on: config.bold,   Icon: Bold,   label: "Bold",   apply: () => onChange({ bold: !config.bold }) },
                            { on: config.italic, Icon: Italic, label: "Italic", apply: () => onChange({ italic: !config.italic }) },
                        ] as const).map(({ on, Icon, label, apply }) => (
                            <button
                                key={label}
                                onClick={apply}
                                title={label}
                                aria-label={label}
                                aria-pressed={on}
                                className={cn(
                                    "flex size-[26px] items-center justify-center rounded-md border transition-all",
                                    on ? ACCENT_ON : cn("border-border bg-muted/40", ACCENT_OFF),
                                )}
                            >
                                <Icon className="size-3.5" />
                            </button>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ── Text / highlight colour ── */}
            <Section title={colorLabel}>
                {colorHint && (
                    <p className="text-[9px] text-muted-foreground/70 mb-1.5 leading-snug">{colorHint}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {TEXT_COLORS.map(hex => {
                        const active = config.primaryColor.toUpperCase() === hex.toUpperCase();
                        return (
                            <button
                                key={hex}
                                onClick={() => onChange({ primaryColor: hex })}
                                title={hex}
                                className={cn(
                                    "w-6 h-6 rounded-full border-2 transition-all hover:scale-110 shrink-0",
                                    hex === "#000000" && "ring-1 ring-border",
                                    active ? "border-foreground scale-110 shadow-sm" : "border-transparent",
                                )}
                                style={{ backgroundColor: hex }}
                            />
                        );
                    })}
                    <label
                        title="Custom colour"
                        className="relative w-6 h-6 rounded-full border-2 border-dashed border-border cursor-pointer flex items-center justify-center hover:border-foreground/60 transition-all overflow-hidden shrink-0"
                    >
                        <input
                            type="color"
                            value={config.primaryColor}
                            onChange={e => onChange({ primaryColor: e.target.value })}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                        <span className="text-[10px] text-muted-foreground pointer-events-none">+</span>
                    </label>
                </div>
            </Section>

            {/* ── Sizing ── */}
            <Section title="Sizing">
                <SliderRow
                    label="Size"
                    value={config.fontSizeScale} min={0.5} max={2.0} step={0.05}
                    onChange={v => onChange({ fontSizeScale: v })} decimals={2}
                />
                <SliderRow
                    label="Spacing"
                    value={config.letterSpacing} min={0} max={10} step={0.5}
                    onChange={v => onChange({ letterSpacing: v })} decimals={1}
                />
            </Section>

            {/* ── Outline & shadow (hidden for box + TikTok, which fix their own) ── */}
            {showOutlineSection && (
                <Section title="Outline & Shadow">
                    <SliderRow
                        label="Outline"
                        value={config.outlineSize} min={0} max={8} step={0.5}
                        onChange={v => onChange({ outlineSize: v })} decimals={1}
                    />
                    <SliderRow
                        label="Shadow"
                        value={config.shadowSize} min={0} max={10} step={0.5}
                        onChange={v => onChange({ shadowSize: v })} decimals={1}
                    />
                    <ColorRow
                        label="Color"
                        value={config.outlineColor}
                        onChange={v => onChange({ outlineColor: v })}
                    />
                </Section>
            )}

            {/* ── Background (only for box styles) ── */}
            {isBoxStyle && (
                <Section title="Background">
                    <SliderRow
                        label="Opacity"
                        value={config.backgroundOpacity} min={0} max={100} step={5}
                        onChange={v => onChange({ backgroundOpacity: v })}
                    />
                    <ColorRow
                        label="Color"
                        value={config.backgroundColor}
                        onChange={v => onChange({ backgroundColor: v })}
                    />
                </Section>
            )}
        </div>
    );

    // ── Embedded mode: plain scrollable panel (used in sidebar) ──────────────
    if (embedded) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                {panelBody}
            </div>
        );
    }

    // ── Floating mode: draggable overlay ─────────────────────────────────────
    return (
        <motion.div
            ref={panelRef}
            style={{
                position: "absolute",
                left: 0,
                top:  0,
                x: mx,
                y: my,
                width: size.w,
                height: size.h,
                maxHeight: `calc(100vh - ${MAX_H_INSET}px)`,
                zIndex: 200,
                pointerEvents: "auto",
            }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0.05}
            dragConstraints={{
                left:   0,
                top:    HDR_H,
                right:  typeof window !== "undefined" ? window.innerWidth  - size.w  - 4 : 980,
                bottom: typeof window !== "undefined" ? window.innerHeight - 120       : 660,
            }}
            onDragEnd={handleDragEnd}
            className="bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl shadow-black/20 overflow-hidden flex flex-col"
        >
            {/* Drag handle */}
            <div
                onPointerDown={e => dragControls.start(e)}
                className="flex items-center gap-2 px-2.5 py-2 bg-muted/50 border-b border-border/60 cursor-grab active:cursor-grabbing select-none touch-none shrink-0"
            >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
                    Subtitle Style
                </span>
                {onClose && (
                    <button
                        type="button"
                        title="Hide subtitle style"
                        aria-label="Hide subtitle style"
                        // Stop the pointer reaching the drag handle underneath,
                        // or closing turns into an accidental drag.
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onClose}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            {panelBody}

            {/* Resize grip. `touch-none` keeps a trackpad or touch drag from
                scrolling the panel body instead of resizing it. */}
            <div
                onPointerDown={beginResize}
                title="Drag to resize"
                aria-hidden
                className="absolute bottom-0 right-0 z-10 size-4 cursor-nwse-resize touch-none"
            >
                <svg viewBox="0 0 16 16" className="size-full text-muted-foreground/50">
                    <path d="M15 6 L6 15 M15 11 L11 15" stroke="currentColor" strokeWidth="1.25" fill="none" strokeLinecap="round" />
                </svg>
            </div>
        </motion.div>
    );
}
