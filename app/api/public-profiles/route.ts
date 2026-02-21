
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Fetch up to 50 users who have analyzed their identity
        // Exclude the current user? Optional.
        const profiles = await prisma.user.findMany({
            where: {
                musicIdentity: { not: null },
                // id: { not: session.user.id } // Uncomment if we want to hide self
            },
            take: 20,
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                nickname: true,
                image: true,
                voiceType: true,
                musicalAttributes: true,
                musicIdentity: true,
                city: true,
                country: true
            }
        })

        return NextResponse.json({ profiles })

    } catch (error) {
        console.error("Error fetching public profiles:", error)
        return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 })
    }
}
