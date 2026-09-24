"use client";

import { useCallback, useEffect, useState } from "react";
import type { CookieAccessStatus } from "@/lib/browser-cookies";

export interface CookieAccess {
    /** The configured browser, or "" when cookies are off. */
    browser: string;
    status: CookieAccessStatus;
}

/**
 * Whether the configured browser's cookies can be read, asked of the server.
 *
 * Re-checkable on demand rather than only on mount: granting Full Disk Access
 * happens outside the app, in System Settings, so the moment that matters is
 * when the user comes back — and nothing about returning to the window tells
 * the app the answer has changed. `refresh` is what the dialog's "I've done it"
 * button calls.
 */
export function useCookieAccess(): {
    access: CookieAccess | null;
    refresh: () => Promise<CookieAccess | null>;
} {
    const [access, setAccess] = useState<CookieAccess | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/settings/cookies");
            if (!res.ok) return null;
            const data = (await res.json()) as CookieAccess;
            setAccess(data);
            return data;
        } catch {
            // Offline or the server is still coming up. A failed probe must not
            // become a false "denied" — that would send the user to System
            // Settings to fix nothing.
            return null;
        }
    }, []);

    // The rule reads `refresh` as a setState call in the effect body. It is
    // not: every setAccess inside it happens after an awaited fetch, which is
    // exactly the "subscribe and call setState from a callback" shape the rule
    // exists to encourage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void refresh(); }, [refresh]);

    return { access, refresh };
}
