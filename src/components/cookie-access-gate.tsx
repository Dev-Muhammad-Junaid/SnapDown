"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CookieAccessDialog } from "@/components/cookie-access-dialog";
import { useCookieAccess } from "@/hooks/use-cookie-access";
import { ONBOARDING_CLOSED_EVENT } from "@/components/onboarding-modal";

const DISMISSED_KEY = "snapdown_cookie_access_dismissed";
/** Written by OnboardingModal. Read here only to avoid stacking dialogs. */
const ONBOARDING_KEY = "snapdown_onboarding_seen";

/**
 * Raises the Full Disk Access dialog by itself when cookies are blocked.
 *
 * Runs on launch rather than waiting for a download to fail. The failure is
 * certain — a blocked cookie store means every YouTube or X download is
 * refused or capped — so there is nothing to gain by letting the user hit it
 * first, and the error yt-dlp produces ("could not find chrome cookies
 * database") points at the wrong cause anyway.
 *
 * Dismissal is permanent and per-machine: the user is entitled to decide the
 * app does not get to read their browser, and asking again every launch after
 * they have said no is nagging. Settings keeps a way back in.
 */
export function CookieAccessGate() {
    const { access, refresh } = useCookieAccess();
    const [open, setOpen] = useState(false);
    /** Guards against reopening after the user closed it this session. */
    const closedThisSession = useRef(false);

    const recheckOnReturn = useCallback(() => {
        if (document.visibilityState === "visible") void refresh();
    }, [refresh]);

    useEffect(() => {
        // The grant is made in System Settings, so the app learns about it by
        // being looked at again.
        document.addEventListener("visibilitychange", recheckOnReturn);
        return () => document.removeEventListener("visibilitychange", recheckOnReturn);
    }, [recheckOnReturn]);

    /** Bumped when the tour closes, to re-run the gate that deferred to it. */
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const onTourClosed = () => setAttempt((n) => n + 1);
        window.addEventListener(ONBOARDING_CLOSED_EVENT, onTourClosed);
        return () => window.removeEventListener(ONBOARDING_CLOSED_EVENT, onTourClosed);
    }, []);

    useEffect(() => {
        if (access?.status !== "denied" || closedThisSession.current) return;
        /* eslint-disable react-hooks/set-state-in-effect */
        try {
            if (localStorage.getItem(DISMISSED_KEY)) return;
            // First launch shows the tour; two dialogs at once is a wall.
            if (!localStorage.getItem(ONBOARDING_KEY)) return;
        } catch {
            return; // No localStorage means no way to honour a dismissal.
        }
        setOpen(true);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [access, attempt]);

    if (!access || access.status !== "denied") return null;

    return (
        <CookieAccessDialog
            open={open}
            browser={access.browser}
            dismissible
            onRecheck={refresh}
            onClose={(dontAskAgain) => {
                setOpen(false);
                closedThisSession.current = true;
                if (dontAskAgain) {
                    try { localStorage.setItem(DISMISSED_KEY, "true"); } catch { }
                }
            }}
        />
    );
}

/** Undoes "Don't ask again", for a Settings entry point. */
export function allowCookieAccessPrompt() {
    try { localStorage.removeItem(DISMISSED_KEY); } catch { }
}
