import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { findBrowserCookieStore, browserHasNoCookies } from "@/lib/browser-cookies";

/**
 * Downloads were failing outright with "could not find chrome cookies database
 * in …" because the setting named Chrome and Chrome's Application Support
 * directory had been left behind, empty, by an uninstall. yt-dlp treats a
 * missing store as fatal; these cover the check that lets us skip the flag
 * instead of losing the download.
 */

let home: string;

const make = (...segments: string[]) => {
    const file = path.join(home, ...segments);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "");
    return file;
};

const appSupport = ["Library", "Application Support"];

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "cookie-home-"));
});
afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
});

describe("findBrowserCookieStore", () => {
    it("finds a Chrome cookie store under a profile", () => {
        const store = make(...appSupport, "Google", "Chrome", "Default", "Network", "Cookies");
        expect(findBrowserCookieStore("chrome", home)).toBe(store);
    });

    it("finds the older top-level location too", () => {
        const store = make(...appSupport, "Google", "Chrome", "Default", "Cookies");
        expect(findBrowserCookieStore("chrome", home)).toBe(store);
    });

    it("looks past the first profile", () => {
        fs.mkdirSync(path.join(home, ...appSupport, "Google", "Chrome", "Default"), { recursive: true });
        const store = make(...appSupport, "Google", "Chrome", "Profile 2", "Network", "Cookies");
        expect(findBrowserCookieStore("chrome", home)).toBe(store);
    });

    it("returns null for a directory left behind by an uninstall", () => {
        // Exactly the reported case: the folder exists, nothing is in it.
        fs.mkdirSync(path.join(home, ...appSupport, "Google", "Chrome"), { recursive: true });
        expect(findBrowserCookieStore("chrome", home)).toBeNull();
    });

    it("returns null when the browser was never installed", () => {
        expect(findBrowserCookieStore("brave", home)).toBeNull();
    });

    it("handles the other Chromium browsers", () => {
        const brave = make(...appSupport, "BraveSoftware", "Brave-Browser", "Default", "Cookies");
        expect(findBrowserCookieStore("brave", home)).toBe(brave);
        const edge = make(...appSupport, "Microsoft Edge", "Default", "Cookies");
        expect(findBrowserCookieStore("edge", home)).toBe(edge);
    });

    it("finds Firefox's sqlite store in a named profile", () => {
        const store = make(...appSupport, "Firefox", "Profiles", "abc.default-release", "cookies.sqlite");
        expect(findBrowserCookieStore("firefox", home)).toBe(store);
    });

    it("finds Safari's binary cookies", () => {
        const store = make("Library", "Cookies", "Cookies.binarycookies");
        expect(findBrowserCookieStore("safari", home)).toBe(store);
    });

    it("ignores the profile half of yt-dlp's browser:profile form", () => {
        const store = make(...appSupport, "Google", "Chrome", "Default", "Cookies");
        expect(findBrowserCookieStore("chrome:Profile 1", home)).toBe(store);
    });

    it("is case-insensitive about the browser name", () => {
        const store = make(...appSupport, "Google", "Chrome", "Default", "Cookies");
        expect(findBrowserCookieStore("Chrome", home)).toBe(store);
    });
});

describe("browserHasNoCookies", () => {
    it("is true only when we know the layout and found nothing", () => {
        fs.mkdirSync(path.join(home, ...appSupport, "Google", "Chrome"), { recursive: true });
        expect(browserHasNoCookies("chrome", home)).toBe(true);
    });

    it("is false once a store exists", () => {
        make(...appSupport, "Google", "Chrome", "Default", "Cookies");
        expect(browserHasNoCookies("chrome", home)).toBe(false);
    });

    it("never claims certainty about a browser it does not know", () => {
        // Guessing wrong here would strip cookies yt-dlp could have used.
        expect(browserHasNoCookies("some-new-browser", home)).toBe(false);
    });
});
