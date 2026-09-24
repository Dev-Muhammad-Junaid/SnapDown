"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Cookie, Info, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useCookieAccess } from "@/hooks/use-cookie-access";
import { CookieAccessDialog } from "@/components/cookie-access-dialog";
import { allowCookieAccessPrompt } from "@/components/cookie-access-gate";
import { cn } from "@/lib/utils";

const BROWSER_LABELS: Record<string, string> = {
    "": "Off (no cookies)",
    chrome: "Chrome",
    safari: "Safari",
    firefox: "Firefox",
    edge: "Edge",
    brave: "Brave",
};

interface DownloaderCardProps {
    ytCookiesBrowser: string;
    setYtCookiesBrowser: (v: string) => void;
    onSave: () => void;
}

export function DownloaderCard({ ytCookiesBrowser, setYtCookiesBrowser, onSave }: DownloaderCardProps) {
    const { access, refresh } = useCookieAccess();
    const [dialogOpen, setDialogOpen] = useState(false);

    // The status line is what makes the setting honest. Picking "Chrome" from a
    // dropdown looks like it worked whether or not the cookies are reachable,
    // and until the next download fails there is nothing to say otherwise.
    const status = access?.status ?? null;

    const save = () => {
        onSave();
        // The saved browser may be reachable or blocked; only the server knows.
        void refresh();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Cookie className="w-5 h-5 text-primary" />
                    Downloader Cookies
                    <Tooltip>
                        <TooltipTrigger className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="w-4 h-4" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                            Some sites (e.g. YouTube) now require a signed-in session to download
                            or to offer resolutions above 360p. Pick a browser you&rsquo;re logged
                            into — it must be installed on this machine. Cookies are read locally
                            by yt-dlp and never leave your computer.
                        </TooltipContent>
                    </Tooltip>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="ytCookiesBrowser">Read cookies from</Label>
                    <Select
                        value={ytCookiesBrowser || "off"}
                        onValueChange={(v) => setYtCookiesBrowser(v === "off" ? "" : (v ?? ""))}
                    >
                        <SelectTrigger id="ytCookiesBrowser">
                            <SelectValue>{(v) => BROWSER_LABELS[v === "off" ? "" : String(v)] ?? "Off (no cookies)"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="off">Off (no cookies)</SelectItem>
                            <SelectItem value="chrome">Chrome</SelectItem>
                            <SelectItem value="safari">Safari</SelectItem>
                            <SelectItem value="firefox">Firefox</SelectItem>
                            <SelectItem value="edge">Edge</SelectItem>
                            <SelectItem value="brave">Brave</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {status === "ok" && (
                    <p className="flex items-center gap-2 text-[12.5px] text-emerald-600 dark:text-emerald-500">
                        <ShieldCheck className="size-3.5 shrink-0" />
                        Cookies from {BROWSER_LABELS[access!.browser] ?? access!.browser} are readable.
                    </p>
                )}

                {status === "missing" && (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                        <ShieldX className="size-3.5 shrink-0" />
                        No cookie store found for {BROWSER_LABELS[access!.browser] ?? access!.browser}.
                        Downloads will run without cookies.
                    </p>
                )}

                {status === "denied" && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
                        <ShieldAlert className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <p className="text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-400">
                                macOS is blocking SnapDown from reading{" "}
                                {BROWSER_LABELS[access!.browser] ?? access!.browser}.
                                Downloads will be capped or refused until it has Full Disk Access.
                            </p>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    // Reopening from here overrides an earlier
                                    // "don't ask again" — the user came looking.
                                    allowCookieAccessPrompt();
                                    setDialogOpen(true);
                                }}
                            >
                                Grant access
                            </Button>
                        </div>
                    </div>
                )}

                <div className={cn("flex justify-end")}>
                    <Button onClick={save}>Save</Button>
                </div>
            </CardContent>

            {access && (
                <CookieAccessDialog
                    open={dialogOpen}
                    browser={access.browser}
                    dismissible={false}
                    onClose={() => setDialogOpen(false)}
                />
            )}
        </Card>
    );
}
