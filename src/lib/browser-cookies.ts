import fs from "fs";
import os from "os";
import path from "path";

/**
 * Whether the browser a user picked for cookies actually has any.
 *
 * yt-dlp's `--cookies-from-browser` is fatal when it comes up empty: it aborts
 * the download with "could not find chrome cookies database in ...", and the
 * user sees a failed job rather than a video. That is the wrong trade. Cookies
 * are an enhancement — they get past YouTube's bot check and unlock higher
 * formats — so when they are unavailable the right move is to download without
 * them, not to refuse.
 *
 * The failure is easy to reach by accident. Uninstalling Chrome leaves
 * `~/Library/Application Support/Google/Chrome` behind as an empty directory,
 * so the setting still names a browser that looks present and has nothing in
 * it. On the machine this was found on, every one of Chrome, Brave, Edge,
 * Chromium, Arc and Vivaldi had a directory and none had a cookie store.
 */

/** Where each browser keeps cookies on macOS, relative to Application Support.
 *  Chromium-family browsers keep one per profile directory. */
const CHROMIUM_ROOTS: Record<string, string> = {
    chrome: "Google/Chrome",
    "chrome-beta": "Google/Chrome Beta",
    chromium: "Chromium",
    brave: "BraveSoftware/Brave-Browser",
    edge: "Microsoft Edge",
    vivaldi: "Vivaldi",
    opera: "com.operasoftware.Opera",
    arc: "Arc",
};

/**
 * The first path we can actually open, not merely the first that exists.
 *
 * Safari's cookie jar is the reason for the distinction: the file is right
 * there, and reading it fails with EPERM unless the app has Full Disk Access.
 * `existsSync` says yes, yt-dlp then dies with "Operation not permitted", and
 * we are back to a failed download for want of an enhancement. Permission is
 * part of the question.
 */
function firstReadable(paths: string[]): string | null {
    for (const p of paths) {
        try {
            fs.accessSync(p, fs.constants.R_OK);
            return p;
        } catch { /* missing or not permitted — either way, not usable */ }
    }
    return null;
}

/**
 * Why a browser's cookies are unavailable, which is not the same question as
 * whether they are.
 *
 * macOS returns EPERM, not ENOENT, for another app's data when the caller has
 * not been granted access — and a plain directory listing comes back empty
 * rather than erroring, so "no cookies here" and "not allowed to look" are
 * easy to confuse. They need opposite advice: one means pick another browser,
 * the other means grant the app Full Disk Access. Telling someone their daily
 * browser has no cookies when the truth is we were not allowed to look sends
 * them somewhere with no fix in it.
 */
export type CookieUnavailableReason = "missing" | "denied";

export function cookieUnavailableReason(
    browserSpec: string,
    home: string = os.homedir(),
): CookieUnavailableReason {
    const browser = browserSpec.split(":")[0].trim().toLowerCase();
    const roots: string[] = [];

    if (browser === "safari") {
        roots.push(path.join(home, "Library", "Cookies"));
        roots.push(path.join(home, "Library", "Containers", "com.apple.Safari", "Data",
                             "Library", "Cookies"));
    } else if (browser === "firefox") {
        roots.push(path.join(home, "Library", "Application Support", "Firefox", "Profiles"));
    } else if (CHROMIUM_ROOTS[browser]) {
        roots.push(path.join(home, "Library", "Application Support", CHROMIUM_ROOTS[browser]));
    }

    for (const root of roots) {
        try {
            fs.readdirSync(root);
        } catch (err) {
            // The directory is there and we are not allowed to read it: the
            // browser's data exists, we simply cannot see it. macOS's privacy
            // layer denies with EPERM and ordinary permission bits with
            // EACCES; both mean the same thing to a user.
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EACCES") return "denied";
        }
    }
    return "missing";
}

/** Cookie stores inside a Chromium profile tree, one per profile. */
function chromiumCookieStores(root: string): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Newer Chrome keeps it under Network/, older versions at the top.
        out.push(path.join(root, entry.name, "Network", "Cookies"));
        out.push(path.join(root, entry.name, "Cookies"));
    }
    return out;
}

/**
 * Locate the cookie store for a browser, or null when it has none.
 *
 * Accepts yt-dlp's `browser:profile` form; the profile part is ignored here
 * because the question being asked is only whether this browser has cookies at
 * all. yt-dlp still does the precise lookup itself.
 */
export function findBrowserCookieStore(
    browserSpec: string,
    home: string = os.homedir(),
): string | null {
    const browser = browserSpec.split(":")[0].trim().toLowerCase();
    if (!browser) return null;

    const appSupport = path.join(home, "Library", "Application Support");

    if (browser === "safari") {
        return firstReadable([
            path.join(home, "Library", "Cookies", "Cookies.binarycookies"),
            path.join(home, "Library", "Containers", "com.apple.Safari", "Data",
                      "Library", "Cookies", "Cookies.binarycookies"),
        ]);
    }

    if (browser === "firefox") {
        const profiles = path.join(appSupport, "Firefox", "Profiles");
        let names: string[];
        try {
            names = fs.readdirSync(profiles);
        } catch {
            return null;
        }
        return firstReadable(names.map((n) => path.join(profiles, n, "cookies.sqlite")));
    }

    const root = CHROMIUM_ROOTS[browser];
    if (!root) return null; // Unknown browser: let yt-dlp be the judge.
    return firstReadable(chromiumCookieStores(path.join(appSupport, root)));
}

/** Whether we know for certain this browser has no cookies we can read. */
export function browserHasNoCookies(browserSpec: string, home?: string): boolean {
    const browser = browserSpec.split(":")[0].trim().toLowerCase();
    // Only claim certainty for browsers whose layout we know.
    const known = browser === "safari" || browser === "firefox" || browser in CHROMIUM_ROOTS;
    if (!known) return false;
    return findBrowserCookieStore(browserSpec, home) === null;
}

/**
 * The full answer for the UI: usable, blocked, or genuinely absent.
 *
 * The UI needs the three-way distinction because only one of them is
 * actionable by the user, and the action is not obvious: Full Disk Access is
 * the one macOS privacy category that never prompts. Nothing the app can do
 * will make the system ask — no first read, no API call, no entitlement. The
 * grant only happens if the user is told to go and make it, which means
 * "denied" has to travel all the way to a dialog with a button in it rather
 * than dying in a server log.
 */
export type CookieAccessStatus = "off" | "ok" | "denied" | "missing";

export function cookieAccessStatus(
    browserSpec: string,
    home?: string,
): CookieAccessStatus {
    const browser = browserSpec.split(":")[0].trim().toLowerCase();
    if (!browser) return "off";
    if (!browserHasNoCookies(browserSpec, home)) return "ok";
    return cookieUnavailableReason(browserSpec, home);
}
