"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

const BROWSER_LABELS: Record<string, string> = {
    chrome: "Chrome",
    safari: "Safari",
    firefox: "Firefox",
    edge: "Edge",
    brave: "Brave",
};

const label = (browser: string) =>
    BROWSER_LABELS[browser.split(":")[0].toLowerCase()] ?? browser;

interface CookieAccessDialogProps {
    open: boolean;
    /** The browser whose cookies are blocked, for naming it in the copy. */
    browser: string;
    /** Called with `true` when the user asked not to be reminded again. */
    onClose: (dontAskAgain: boolean) => void;
    /** Whether a "don't ask again" choice makes sense here. It does when the
     *  dialog appeared by itself; it doesn't when the user opened it. */
    dismissible: boolean;
}

/**
 * Asks for Full Disk Access, which is the only way SnapDown can get it.
 *
 * Every other permission macOS gates is requestable: the app touches the thing
 * and the system puts up a prompt. Full Disk Access has no prompt and no API —
 * the toggle exists only in System Settings, so an app that needs it can only
 * open the pane and say why.
 *
 * Deliberately one sentence and one button. An earlier version explained the
 * steps and offered "Re-check" and "Show app" alongside; the steps are visible
 * in System Settings the moment it opens, and Re-check could never succeed,
 * because the grant does not reach a process that is already running.
 */
export function CookieAccessDialog({
    open, browser, onClose, dismissible,
}: CookieAccessDialogProps) {
    const desktop = typeof window !== "undefined" && !!window.snapdown?.system;

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(false); }}>
            <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden">
                <div className="flex flex-col items-center px-7 pt-7 pb-6 text-center">
                    <div className="flex size-12 items-center justify-center rounded-[13px] bg-primary/10">
                        <ShieldCheck className="size-5 text-primary" strokeWidth={1.75} />
                    </div>
                    <DialogTitle className="mt-3.5 text-[15px] font-semibold tracking-[-0.015em]">
                        Allow SnapDown to read {label(browser)}
                    </DialogTitle>
                    <DialogDescription className="mt-1.5 max-w-[290px] text-[13px] leading-relaxed text-muted-foreground">
                        {desktop
                            ? "Turn on Full Disk Access, then reopen SnapDown."
                            : "In System Settings, turn on Full Disk Access for SnapDown."}
                    </DialogDescription>
                </div>

                <div className="flex items-center justify-end gap-2 border-t bg-muted/60 px-4 py-3">
                    {dismissible && (
                        <Button variant="ghost" size="sm" className="mr-auto" onClick={() => onClose(true)}>
                            Don&rsquo;t ask again
                        </Button>
                    )}
                    <Button
                        size="sm"
                        disabled={!desktop}
                        onClick={() => { void window.snapdown?.system.openFullDiskAccess(); }}
                    >
                        Open Settings
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
