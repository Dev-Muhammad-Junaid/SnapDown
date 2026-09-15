"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

/**
 * A continuous slider in the same language as StepSlider — a recessed pill
 * track with a raised thumb riding on it — at about half the height, for dense
 * panels where a full-size control would dominate the section it belongs to.
 *
 * StepSlider is for a handful of named positions and draws a marker for each.
 * This one is for a range where the exact number matters more than the stops,
 * so it has no markers and the value is shown alongside it instead.
 */
interface MiniSliderProps {
    value: number;
    onValueChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    className?: string;
    "aria-label"?: string;
}

export function MiniSlider({
    value,
    onValueChange,
    min,
    max,
    step = 1,
    className,
    ...rest
}: MiniSliderProps) {
    return (
        <SliderPrimitive.Root
            value={value}
            onValueChange={(v) => onValueChange((Array.isArray(v) ? v[0] : v) as number)}
            min={min}
            max={max}
            step={step}
            // The thumb stays inside the track at both ends, so the filled
            // portion reads as the value rather than overshooting it.
            thumbAlignment="edge"
            className={cn("w-full", className)}
            aria-label={rest["aria-label"]}
        >
            <SliderPrimitive.Control className="relative flex h-4 w-full touch-none items-center select-none">
                <SliderPrimitive.Track className="relative h-4 w-full rounded-[6px] bg-muted select-none">
                    <SliderPrimitive.Indicator className="h-full rounded-l-[6px] bg-foreground/[0.10] select-none" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    className={cn(
                        "relative block h-[14px] w-[18px] shrink-0 rounded-[5px] bg-foreground select-none",
                        "shadow-[0_1px_2px_rgb(0_0_0/0.35)]",
                        // The hit area is padded out past the visible thumb:
                        // 14px is comfortable to look at and awkward to grab.
                        "ring-ring/50 transition-[box-shadow] after:absolute after:-inset-2",
                        "hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden active:ring-2",
                    )}
                />
            </SliderPrimitive.Control>
        </SliderPrimitive.Root>
    );
}
