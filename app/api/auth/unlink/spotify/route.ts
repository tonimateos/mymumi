import { getServerSession } from "next-auth"
import { authOptions } from "../../[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST() {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        await prisma.account.deleteMany({
            where: {
                userId: session.user.id,
                provider: "spotify"
            }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Error unlinking Spotify:", error)
        return NextResponse.json({ error: "Failed to unlink Spotify account" }, { status: 500 })
    }
}
