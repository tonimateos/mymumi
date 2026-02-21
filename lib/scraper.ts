// Force Playwright to look in node_modules/playwright-core/.local-browsers on Digital Ocean
if (process.env.NODE_ENV === 'production' && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}

import { chromium } from 'playwright';

export interface ScrapedTrack {
    title: string;
    artists: string;
}

/**
 * Fetches track names and artists from a public Spotify playlist using Playwright.
 * This avoids the need for Spotify API credentials or user authentication.
 */
export async function fetchPlaylistTracks(playlistId: string, onProgress?: (count: number) => void): Promise<ScrapedTrack[]> {
    console.log(`[Scraper] Fetching playlist info from: https://open.spotify.com/playlist/${playlistId}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(`https://open.spotify.com/playlist/${playlistId}`);

        // Initial wait for the first elements to appear
        await page.waitForSelector('[data-testid="tracklist-row"]', { timeout: 45000 });

        const allTracks = new Map<string, { title: string, artists: string }>();
        let lastCount = 0;
        let stagnantIterations = 0;

        console.log(`[Scraper] Starting scroll-and-capture...`);

        // We scroll several times to trigger lazy loading in Spotify's virtualized list
        for (let i = 0; i < 15; i++) {
            const currentTracks = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'));
                return rows.map(row => {
                    const titleElement =
                        row.querySelector('[data-testid="track-name"]') ||
                        row.querySelector('a[href*="/track/"]') ||
                        row.querySelector('div[dir="auto"].encore-text-body-medium');

                    const artistElements = row.querySelectorAll('[data-testid="track-artist"], a[href*="/artist/"]');
                    const artists = artistElements.length > 0
                        ? Array.from(artistElements).map(el => el.textContent?.trim()).filter(Boolean)
                        : [row.querySelector('span.encore-text-body-small')?.textContent?.trim() || "Unknown Artist"];

                    const uniqueArtists = [...new Set(artists)];

                    return {
                        title: titleElement?.textContent?.trim() || "Unknown Title",
                        artists: uniqueArtists.join(', '),
                    };
                });
            });

            // Add new unique tracks to our collection
            currentTracks.forEach(track => {
                const key = `${track.artists} - ${track.title}`.toLowerCase();
                if (!allTracks.has(key)) {
                    allTracks.set(key, track);
                }
            });

            console.log(`[Scraper] Iteration ${i + 1}: Found ${allTracks.size} unique tracks so far.`);
            if (onProgress) onProgress(allTracks.size);

            // If we didn't find any new tracks for 2 iterations, we've probably reached the end
            if (allTracks.size === lastCount) {
                stagnantIterations++;
                if (stagnantIterations >= 2) break;
            } else {
                stagnantIterations = 0;
            }

            lastCount = allTracks.size;

            // Scroll down to trigger more loading
            // We hover over a track row first to ensure the scroll happens in the right container
            const trackRows = page.locator('[data-testid="tracklist-row"]');
            const rowCount = await trackRows.count();
            if (rowCount > 0) {
                try {
                    // Hover over the last visible row to anchor the scroll
                    await trackRows.nth(rowCount - 1).hover();
                    // Use mouse wheel for targeted scrolling
                    await page.mouse.wheel(0, 1000);
                    console.log("Found track to move mouse to...")
                } catch {
                    console.log("Found track to move mouse to... but failed to scroll")
                    await page.evaluate(() => window.scrollBy(0, 1000));
                }
            } else {
                console.log("No track found to move mouse to... scrolling general page")
                await page.evaluate(() => window.scrollBy(0, 1000));
            }

            await page.waitForTimeout(2000);
        }

        const tracks = Array.from(allTracks.values());
        console.log(`[Scraper] Successfully scraped ${tracks.length} tracks.`);
        return tracks;

    } catch (error) {
        console.error(`[Scraper] Error fetching playlist ${playlistId}:`, error instanceof Error ? error.message : "Unknown error");
        throw error;
    } finally {
        await browser.close();
    }
}
