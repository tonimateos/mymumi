import { chromium } from 'playwright';

export interface ScrapedTrack {
    title: string;
    artists: string;
}

/**
 * Fetches track names and artists from a public Spotify playlist using Playwright.
 * This avoids the need for Spotify API credentials or user authentication.
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<ScrapedTrack[]> {
    console.log(`[Scraper] Fetching playlist info from: https://open.spotify.com/playlist/${playlistId}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(`https://open.spotify.com/playlist/${playlistId}`);

        // Wait for the tracklist to render
        // Spotify's public view uses [data-testid="tracklist-row"]
        await page.waitForSelector('[data-testid="tracklist-row"]', { timeout: 15000 });

        const tracks = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'));
            return rows.map(row => {
                // Robust selectors for title
                const titleElement =
                    row.querySelector('[data-testid="track-name"]') ||
                    row.querySelector('a[href*="/track/"]') ||
                    row.querySelector('div[dir="auto"].encore-text-body-medium');

                // Robust selectors for artists
                const artistElements = row.querySelectorAll('[data-testid="track-artist"], a[href*="/artist/"]');
                const artists = artistElements.length > 0
                    ? Array.from(artistElements).map(el => el.textContent?.trim()).filter(Boolean)
                    : [row.querySelector('span.encore-text-body-small')?.textContent?.trim() || "Unknown Artist"];

                // Remove duplicates from artists array
                const uniqueArtists = [...new Set(artists)];

                return {
                    title: titleElement?.textContent?.trim() || "Unknown Title",
                    artists: uniqueArtists.join(', '),
                };
            });
        });

        console.log(`[Scraper] Successfully scraped ${tracks.length} tracks.`);
        return tracks;

    } catch (error: any) {
        console.error(`[Scraper] Error fetching playlist ${playlistId}:`, error.message);
        throw error;
    } finally {
        await browser.close();
    }
}
