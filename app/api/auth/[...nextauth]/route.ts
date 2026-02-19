import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

import SpotifyProvider from "next-auth/providers/spotify"

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        }),
        SpotifyProvider({
            clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
            authorization: {
                params: {
                    scope: "playlist-read-private playlist-read-collaborative user-read-email",
                },
            },
        }),
    ],
    callbacks: {
        async session({ session, user }) {
            if (session.user) {
                session.user.id = user.id

                // Fetch the Spotify Account to get the access token
                try {
                    const account = await prisma.account.findFirst({
                        where: {
                            userId: user.id,
                            provider: "spotify",
                        },
                    })

                    if (account?.access_token) {
                        // Basic check if token is expired (if expires_at is present)
                        // If expired, we should ideally refresh it here or mark it.
                        // For now, let's just pass it through.
                        session.accessToken = account.access_token
                    }
                } catch (error) {
                    console.error("Error fetching Spotify account:", error)
                }
            }
            return session
        },
    },
    debug: true,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
