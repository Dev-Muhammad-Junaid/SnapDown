"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowUpRight, FolderOpen, Check, Loader2 } from "lucide-react";

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
    /** Re-probes access; resolves to the new status. */
    onRecheck: () => Promise<{ status: string } | null>;
    /** Whether a "don't remind me" choice makes sense here. It does when the
     *  dialog appeared by itself; it doesn't when the user opened it. */
    dismissible: boolean;
}

/**
 * Asks for Full Disk Access, which is the only way SnapDown can get it.
 *
 * Every other permission macOS gates is requestable: the app touches the thing
 * and the system puts up a prompt. Full Disk Access has no prompt and no API —
 * the toggle exists only in System Settings, and an app that needs it has to
 * explain why and open the pane. That makes this dialog the actual mechanism,
 * not a nicety in front of one.
 */
export function CookieAccessDialog({
    open, browser, onClose, onRecheck, dismissible,
}: CookieAccessDialogProps) {
    const [checking, setChecking] = useState(false);
    const [stillBlocked, setStillBlocked] = useState(false);

    const desktop = typeof window !== "undefined" && !!window.snapdown?.system;

    const openSettings = () => { void window.snapdown?.system.openFullDiskAccess(); };
    const revealApp = () => { void window.snapdown?.system.revealApp(); };

    const recheck = async () => {
        setChecking(true);
        setStillBlocked(false);
        const result = await onRecheck();
        setChecking(false);
        // "ok" closes; anything else keeps the dialog up and says so, because
        // the grant does not take effect until the app is restarted and
        // silently closing would look like success.
        if (result?.status === "ok") onClose(false);
        else setStillBlocked(true);
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(false); }}>
            <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
                <div className="flex flex-col items-center px-8 pt-8 pb-5 text-center">
                    <div className="flex size-14 items-center justify-center rounded-[14px] bg-primary/10">
                        <ShieldCheck className="size-6 text-primary" strokeWidth={1.75} />
                    </div>
                    <DialogTitle className="mt-4 text-[17px] font-semibold tracking-[-0.015em]">
                        Let SnapDown read {label(browser)}&rsquo;s cookies
                    </DialogTitle>
                    <DialogDescription className="mt-2 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">
                        macOS is blocking access to {label(browser)}&rsquo;s data, so YouTube and X
                        see you as signed out — downloads get refused or capped at low quality.
                        Granting Full Disk Access fixes it. Cookies are read on this Mac by
                        yt-dlp and never leave it.
                    </DialogDescription>
                </div>

                <ol className="mx-8 mb-5 space-y-2.5 rounded-lg border bg-muted/40 px-4 py-3.5 text-[12.5px] leading-relaxed">
                    {[
                        "Open Full Disk Access below.",
                        "Add SnapDown to the list with the + button, or switch it on if it is already there.",
                        "Quit and reopen SnapDown — macOS only applies the change on a fresh launch.",
                    ].map((step, i) => (
                        <li key={i} className="flex gap-2.5">
                            <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                {i + 1}
                            </span>
                            <span className="text-muted-foreground">{step}</span>
                        </li>
                    ))}
                </ol>

                {stillBlocked && (
                    <p className="mx-8 mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                        Still blocked. If you have just switched SnapDown on in the list, quit
                        and reopen the app — the grant does not reach a process that is already
                        running.
                    </p>
                )}

                {!desktop && (
                    <p className="mx-8 mb-4 text-[12.5px] leading-relaxed text-muted-foreground">
                        Open this from the SnapDown app to jump straight to the setting. In a
                        browser tab, go to System Settings &rarr; Privacy &amp; Security &rarr;
                        Full Disk Access.
                    </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/60 px-5 py-3.5">
                    {dismissible && (
                        <Button variant="ghost" size="sm" className="mr-auto" onClick={() => onClose(true)}>
                            Don&rsquo;t ask again
                        </Button>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={recheck} disabled={checking}>
                            {checking
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : <Check className="size-3.5" />}
                            Re-check
                        </Button>
                        {desktop && (
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={revealApp}>
                                <FolderOpen className="size-3.5" />
                                Show app
                            </Button>
                        )}
                        <Button size="sm" className="gap-1.5" onClick={openSettings} disabled={!desktop}>
                            Open Full Disk Access
                            <ArrowUpRight className="size-3.5" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
