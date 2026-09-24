import { NextResponse } from "next/server";
import { getServerSettings } from "@/lib/settings";
import { cookieAccessStatus } from "@/lib/browser-cookies";

/**
 * Whether the configured browser's cookies can actually be read.
 *
 * Exists because the renderer cannot answer this itself — the check is a
 * filesystem probe of another app's data directory, which only the server
 * process can do. Without it the UI would have to wait for a download to fail
 * and then parse yt-dlp's message, which says "could not find chrome cookies
 * database" for a denial as readily as for a real absence.
 */
export async function GET() {
    try {
        const browser = getServerSettings().ytCookiesBrowser?.trim() || "";
        return NextResponse.json({ browser, status: cookieAccessStatus(browser) });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Failed to check cookie access", details: error.message },
            { status: 500 },
        );
    }
}
