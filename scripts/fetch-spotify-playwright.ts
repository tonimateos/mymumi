import { chromium } from 'playwright';

const run = async () => {
    const playlistId = process.argv[2] || "3cEYpjA9oz9GiPac4AsH4n";
    console.log(`\nFetching playlist info from: https://open.spotify.com/playlist/${playlistId}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto(`https://open.spotify.com/playlist/${playlistId}`);

        // Wait for the tracklist to render
        console.log("Waiting for tracks to render...");
        await page.waitForSelector('[data-testid="tracklist-row"]', { timeout: 30000 });

        const tracks = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[data-testid="tracklist-row"]'));
            return rows.map(row => {
                // Try multiple selector patterns for title
                const titleElement =
                    row.querySelector('[data-testid="track-name"]') ||
                    row.querySelector('a[href*="/track/"]') ||
                    row.querySelector('div[dir="auto"].encore-text-body-medium');

                // Try multiple selector patterns for artists (can be multiple)
                const artistElements = row.querySelectorAll('[data-testid="track-artist"], a[href*="/artist/"]');
                const artists = artistElements.length > 0
                    ? Array.from(artistElements).map(el => el.textContent?.trim()).filter(Boolean)
                    : [row.querySelector('span.encore-text-body-small')?.textContent?.trim() || "Unknown Artist"];

                // Remove duplicates from artists array (sometimes the same artist link appears twice)
                const uniqueArtists = [...new Set(artists)];

                return {
                    title: titleElement?.textContent?.trim() || "Unknown Title",
                    artists: uniqueArtists.join(', '),
                };
            });
        });

        console.log("\n--- Track List ---");
        console.table(tracks);
        console.log(`\nTotal tracks found: ${tracks.length}`);

    } catch (error: any) {
        if (error.name === 'TimeoutError') {
            console.error("\nError: Timeout waiting for tracks. The playlist might be private or the page structure has changed.");
        } else {
            console.error("\nError fetching playlist:", error.message);
        }
    } finally {
        await browser.close();
    }
};

run();
