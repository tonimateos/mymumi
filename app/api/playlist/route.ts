import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { fetchPlaylistTracks } from "@/lib/scraper"
import { NextResponse } from "next/server"

// Helper to extract playlist ID from URL
function extractPlaylistId(url: string) {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/)
    return match ? match[1] : null
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { url, text, nickname, voiceType } = body

    // Handle generic profile update
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
        console.log(`[API] Scraping playlist ID: ${playlistId}`)

        const scrapedTracks = await fetchPlaylistTracks(playlistId)

        // Convert tracks to text list
        const textList = scrapedTracks
            .map(track => `${track.artists} - ${track.title}`)
            .join('\n')

        console.log(`[API] Generated text list from scrape. Total tracks: ${scrapedTracks.length}`)

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                playlistUrl: url,
                playlistText: textList,
                sourceType: 'text_list'
            },
        })

        return NextResponse.json({ type: 'text', content: textList })
    } catch (error: unknown) {
        console.error("Error in playlist route (scraping):", error)
        const message = error instanceof Error ? error.message : "Failed to scrape playlist"
        return NextResponse.json({ error: "Failed to scrape playlist", details: message }, { status: 500 })
    }
}

export async function GET() {
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

        if (!user) {
            return NextResponse.json({
                playlist: null,
                isSpotifyConnected: false
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
                isSpotifyConnected: false
            })
        }

        return NextResponse.json({
            playlist: null,
            isSpotifyConnected: false
        })

    } catch (error) {
        console.error("Error fetching saved playlist:", error)
        return NextResponse.json({ error: "Failed to fetch saved playlist" }, { status: 500 })
    }
}
