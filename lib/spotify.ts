import SpotifyWebApi from "spotify-web-api-node"

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
})

export const searchTrack = async (query: string) => {
    try {
        const data = await spotifyApi.clientCredentialsGrant()
        spotifyApi.setAccessToken(data.body["access_token"])

        const result = await spotifyApi.searchTracks(query, { limit: 1 })
        if (result.body.tracks?.items.length && result.body.tracks.items.length > 0) {
            return result.body.tracks.items[0]
        }
        return null
    } catch (error) {
        console.error("Error searching track:", error)
        return null
    }
}

export const getPlaylist = async (playlistId: string) => {
    try {
        const data = await spotifyApi.clientCredentialsGrant()
        const token = data.body["access_token"]
        // spotifyApi.setAccessToken(token) // Not needed for fetch

        const fields = "tracks.items(track(name,artists(name)))";
        const params = new URLSearchParams({
            market: "ES",
            fields: fields
        });
        const url = `https://api.spotify.com/v1/playlists/${playlistId}?${params.toString()}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })

        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status} ${response.statusText}`)
        }

        const playlist = await response.json()
        return playlist
    } catch (error) {
        throw error
    }
}

export const extractPlaylistId = (url: string) => {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
}

import { prisma } from "@/lib/prisma"

export const getAccessToken = async (userId: string) => {
    const account = await prisma.account.findFirst({
        where: {
            userId: userId,
            provider: "spotify",
        },
    })

    if (!account) {
        throw new Error("Spotify account not linked")
    }

    // Check if token is expired or about to expire (e.g., within 5 minutes)
    // expires_at is in seconds
    const nowSeconds = Math.floor(Date.now() / 1000)
    const expiresAt = account.expires_at ?? 0
    const shouldRefresh = !account.expires_at || (nowSeconds > expiresAt - 300)

    console.log(`[SpotifyAuth] Token Check: Now=${nowSeconds}, Expires=${expiresAt}, ShouldRefresh=${shouldRefresh}`)

    if (shouldRefresh) {
        if (!account.refresh_token) {
            throw new Error("No refresh token available and token is expired")
        }

        try {
            console.log("Refreshing Spotify access token...")
            const spotifyClient = new SpotifyWebApi({
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                refreshToken: account.refresh_token
            })

            const data = await spotifyClient.refreshAccessToken()
            const { access_token, expires_in, refresh_token } = data.body

            // Update in DB
            await prisma.account.update({
                where: { id: account.id },
                data: {
                    access_token: access_token,
                    expires_at: Math.floor(Date.now() / 1000 + expires_in),
                    refresh_token: refresh_token ?? account.refresh_token
                }
            })

            return access_token
        } catch (error) {
            console.error("Error refreshing access token:", error)
            throw new Error("Failed to refresh access token")
        }
    }

    return account.access_token
}
