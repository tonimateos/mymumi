
import SpotifyWebApi from "spotify-web-api-node"
import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const run = async () => {
    const playlistId = "3cEYpjA9oz9GiPac4AsH4n" // 3hkp5HatkdvyrvDH9qMBtU 3cEYpjA9oz9GiPac4AsH4n
    console.log(`Testing Playlist ID: ${playlistId}`)

    const spotifyApi = new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    })

    try {
        // 1. Authenticate
        const data = await spotifyApi.clientCredentialsGrant()
        const token = data.body["access_token"]
        console.log("Authentication successful.")

        console.log("Fetching...")
        const fields = "tracks.items(track(name,artists(name)))";
        const encodedFields = encodeURIComponent(fields);

        const url = `https://api.spotify.com/v1/playlists/${playlistId}?market=ES&fields=${encodedFields}`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Fetch failed (${response.status}): ${errorText}`);
            return;
        }

        console.log('Displaying output:')
        console.log(await response.json())

        const json = await response.json()
        const tracks = json.tracks?.items || [];

        console.log(`Raw tracks found: ${tracks.length}`)

        const simplifiedTracks = tracks.map((item: any) => ({
            trackName: item.track.name,
            artistName: item.track.artists.map((a: any) => a.name).join(', ')
        }));

        // 4. Output Results
        console.log("\n--- Generated List---")
        console.log(simplifiedTracks)

        // 5. Final Assertion
        if (simplifiedTracks.length > 0) {
            console.log(`\nPASS: Successfully built a list of ${simplifiedTracks.length} artist - song pairs.`)
        } else {
            console.error("\nFAIL: Generated list is empty.")
        }

    } catch (error) {
        console.error("Test failed with error:", error)
    }
}

run()
