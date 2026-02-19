import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getPlaylist, extractPlaylistId, getAccessToken } from "@/lib/spotify"
import { NextResponse } from "next/server"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { url, text, nickname, voiceType } = body

    // Handle generic profile update (Step 1 & 2)
    if (nickname || voiceType) {
        try {
            await prisma.user.update({
                where: { id: session.user.id },
                data: {
                    ...(nickname && { nickname }),
                    ...(voiceType && { voiceType })
                }
            })
            return NextResponse.json({ success: true })
        } catch (error) {
            console.error("Error updating profile:", error)
            return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
        }
    }

    if (!url && !text) {
        return NextResponse.json({ error: "URL or Text is required" }, { status: 400 })
    }

    if (text) {
        try {
            // Save to DB
            await prisma.user.update({
                where: { id: session.user.id },
                data: {
                    playlistText: text,
                    playlistUrl: null,
                    sourceType: 'text_list'
                },
            })

            return NextResponse.json({ type: 'text', content: text })
        } catch (error) {
            console.error("Error processing text playlist:", error)
            return NextResponse.json({ error: "Failed to process text list" }, { status: 500 })
        }
    }

    const playlistId = extractPlaylistId(url)
    if (!playlistId) {
        return NextResponse.json({ error: "Invalid Spotify Playlist URL" }, { status: 400 })
    }

    try {
        console.log(`[API] Extracted playlist ID: ${playlistId}`)

        // Get fresh access token (handles refresh if needed)
        const accessToken = await getAccessToken(session.user.id)

        // Initialize SDK with User Token
        const token = {
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "", // Managed by getAccessToken
            expires: Date.now() + 3600 * 1000
        }
        const sdk = SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID!, token as any)

        // Light debug: Check if we can fetch user profile to verify token FIRST
        try {
            await sdk.currentUser.profile();
        } catch (e: any) {
            console.error("[API] Token failed generic profile check", e);
            return NextResponse.json({ error: "Spotify Token Invalid", details: e.message }, { status: 401 })
        }

        const fields = "item";
        const encodedFields = encodeURIComponent(fields);

        // const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?fields=${encodedFields}`;
        const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`;

        // const rawResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`, {

        // Use raw fetch for playlist items as SDK was throwing 403s
        const rawResponse = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })

        if (!rawResponse.ok) {
            const errText = await rawResponse.text()
            console.error(`[API] Raw fetch failed: ${rawResponse.status} - ${errText}`)
            throw new Error(`Spotify API Error: ${rawResponse.status} ${errText}`)
        }

        const playlistItems = await rawResponse.json()
        console.log(`[API] Fetched playlist items. Total: ${playlistItems.total}`)
        console.log(playlistItems)

        const isTrack = playlistItems.items[0].item.track;
        const trackName = playlistItems.items[0].item.name;
        const artists = playlistItems.items[0].item.artists;
        console.log(isTrack, trackName, artists)

        // Convert tracks to text list
        let textList = ""
        if (playlistItems.items) {
            textList = playlistItems.items
                .map((item: any) => item.track)
                .filter((track: any) => track !== null)
                .map((track: any) => `${track.artists[0]?.name || 'Unknown Artist'} - ${track.name}`)
                .join('\n')

            console.log(`[API] Generated text list length: ${textList.length}`)
        } else {
            console.log("[API] No tracks found via SDK.")
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                playlistUrl: url,
                playlistText: textList,
                sourceType: 'text_list' // Switch to text list view
            },
        })
        console.log("[API] User updated with playlist text.")

        return NextResponse.json({ type: 'text', content: textList })
    } catch (error: any) {
        console.error("Error in playlist route:", error)
        return NextResponse.json({ error: "Failed to fetch playlist", details: error.message }, { status: 500 })
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                playlistUrl: true,
                playlistText: true,
                sourceType: true,
                musicIdentity: true,
                nickname: true,
                voiceType: true
            },
        })

        const spotifyAccount = await prisma.account.findFirst({
            where: {
                userId: session.user.id,
                provider: 'spotify'
            }
        })

        if (!user) {
            return NextResponse.json({
                playlist: null,
                isSpotifyConnected: !!spotifyAccount
            })
        }

        // Handle Text List
        if (user.sourceType === 'text_list' && user.playlistText) {
            return NextResponse.json({
                type: 'text',
                content: user.playlistText,
                musicIdentity: user.musicIdentity,
                nickname: user.nickname,
                voiceType: user.voiceType,
                isSpotifyConnected: !!spotifyAccount
            })
        }

        // Handle Spotify URL
        if (!user.playlistUrl) {
            return NextResponse.json({
                playlist: null,
                isSpotifyConnected: !!spotifyAccount
            })
        }

        // If we have text content (legacy or new), return it
        if (user.playlistText) {
            return NextResponse.json({
                type: 'text',
                content: user.playlistText,
                musicIdentity: user.musicIdentity,
                nickname: user.nickname,
                voiceType: user.voiceType,
                isSpotifyConnected: !!spotifyAccount
            })
        }

        // Strictly do not fetch from Spotify on GET. 
        return NextResponse.json({
            playlist: null,
            isSpotifyConnected: !!spotifyAccount
        })

    } catch (error) {
        console.error("Error fetching saved playlist:", error)
        return NextResponse.json({ error: "Failed to fetch saved playlist" }, { status: 500 })
    }
}
