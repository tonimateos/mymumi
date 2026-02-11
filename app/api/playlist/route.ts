import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getPlaylist, extractPlaylistId } from "@/lib/spotify"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { url, text } = body

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
        const playlistData = await getPlaylist(playlistId)

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                playlistUrl: url,
                playlistText: null,
                sourceType: 'spotify_url'
            },
        })

        return NextResponse.json({ ...playlistData, type: 'spotify' })
    } catch (error) {
        console.error("Error in playlist route:", error)
        return NextResponse.json({ error: "Failed to fetch playlist" }, { status: 500 })
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
            select: { playlistUrl: true, playlistText: true, sourceType: true, musicIdentity: true },
        })

        if (!user) {
            return NextResponse.json({ playlist: null })
        }

        // Handle Text List
        if (user.sourceType === 'text_list' && user.playlistText) {
            return NextResponse.json({ type: 'text', content: user.playlistText, musicIdentity: user.musicIdentity })
        }

        // Handle Spotify URL
        if (!user.playlistUrl) {
            return NextResponse.json({ playlist: null })
        }

        const playlistId = extractPlaylistId(user.playlistUrl)
        if (!playlistId) {
            return NextResponse.json({ playlist: null })
        }

        const playlistData = await getPlaylist(playlistId)
        return NextResponse.json({ ...playlistData, type: 'spotify' })

    } catch (error) {
        console.error("Error fetching saved playlist:", error)
        return NextResponse.json({ error: "Failed to fetch saved playlist" }, { status: 500 })
    }
}
