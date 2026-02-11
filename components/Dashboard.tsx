"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import Image from "next/image"

interface SpotifyPlaylist {
    type: 'spotify'
    id: string
    name: string
    description: string
    images: { url: string }[]
    external_urls: { spotify: string }
    tracks: {
        total: number
    }
    owner: {
        display_name: string
    }
}

interface TextPlaylist {
    type: 'text'
    content: string
}

type PlaylistData = SpotifyPlaylist | TextPlaylist

export default function Dashboard() {
    const { data: session } = useSession()

    // UI State
    const [activeTab, setActiveTab] = useState<"url" | "text">("url")

    // Form State
    const [url, setUrl] = useState("")
    const [textInput, setTextInput] = useState("")

    // Data State
    const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // Validate URL format before submission (basic check)
    const isValidSpotifyUrl = (input: string) => input.includes("open.spotify.com/playlist/")

    const fetchPlaylist = async (payload?: { url?: string, text?: string }) => {
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/playlist", {
                method: payload ? "POST" : "GET",
                headers: { "Content-Type": "application/json" },
                body: payload ? JSON.stringify(payload) : undefined
            })

            if (!res.ok) {
                if (res.status === 404) {
                    setPlaylist(null)
                    return
                }
                const data = await res.json()
                throw new Error(data.error || "Failed to fetch")
            }

            const data = await res.json()
            // If GET returns { playlist: null } or similar, handle it.
            // Our API returns the object directly if found, or { playlist: null } if not found.
            if (!data || data.playlist === null) {
                setPlaylist(null)
            } else {
                setPlaylist(data)
                // Clear inputs on success
                if (payload?.url) setUrl("")
                if (payload?.text) setTextInput("")
            }
        } catch (err: any) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Load saved playlist on mount
    useEffect(() => {
        fetchPlaylist()
    }, [])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (activeTab === "url") {
            if (!isValidSpotifyUrl(url)) {
                setError("Please enter a valid Spotify Playlist URL")
                return
            }
            fetchPlaylist({ url })
        } else {
            if (!textInput.trim()) {
                setError("Please enter a list of songs")
                return
            }
            fetchPlaylist({ text: textInput })
        }
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12">
            <header className="flex justify-between items-center mb-12">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                    MyMumi
                </h1>
                <div className="flex items-center gap-4">
                    {session?.user?.image && (
                        <Image
                            src={session.user.image}
                            alt="Profile"
                            width={32}
                            height={32}
                            className="rounded-full border border-neutral-700"
                        />
                    )}
                    <button
                        onClick={() => signOut()}
                        className="text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                        Sign out
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto flex flex-col items-center gap-12">

                {/* Input Section */}
                <div className="w-full max-w-xl text-center space-y-4">
                    <h2 className="text-3xl md:text-4xl font-semibold">
                        {playlist ? "Your Saved Playlist" : "Add a Playlist"}
                    </h2>
                    <p className="text-neutral-400">
                        {playlist ? "Replace it by entering a new one below." : "Import a playlist to get started."}
                    </p>

                    {/* Tabs */}
                    <div className="flex justify-center gap-4 mt-6 mb-4">
                        <button
                            onClick={() => { setActiveTab("url"); setError("") }}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "url"
                                ? "bg-neutral-800 text-white border border-neutral-700"
                                : "text-neutral-500 hover:text-neutral-300"
                                }`}
                        >
                            Spotify URL
                        </button>
                        <button
                            onClick={() => { setActiveTab("text"); setError("") }}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "text"
                                ? "bg-neutral-800 text-white border border-neutral-700"
                                : "text-neutral-500 hover:text-neutral-300"
                                }`}
                        >
                            Paste Text List
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="relative mt-2">
                        {activeTab === "url" ? (
                            <div className="relative">
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://open.spotify.com/playlist/..."
                                    className="w-full px-6 py-4 bg-neutral-900 border border-neutral-800 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg placeholder-neutral-600 transition-all pr-24"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !url}
                                    className="absolute right-2 top-2 bottom-2 px-6 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? "..." : "Save"}
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <textarea
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder="Artist - Song Name&#10;Artist - Song Name&#10;..."
                                    rows={6}
                                    className="w-full px-6 py-4 bg-neutral-900 border border-neutral-800 rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg placeholder-neutral-600 transition-all resize-none"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !textInput.trim()}
                                    className="mt-4 w-full py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? "Processing..." : "Save Text List"}
                                </button>
                            </div>
                        )}
                    </form>
                    {error && <p className="text-red-400 mt-2">{error}</p>}
                </div>

                {/* Playlist Display */}
                {playlist && (
                    <div className="w-full bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 md:p-10 flex flex-col md:flex-row gap-8 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {playlist.type === 'spotify' ? (
                            <>
                                <div className="relative w-60 h-60 md:w-80 md:h-80 flex-shrink-0 mx-auto md:mx-0 shadow-2xl shadow-green-500/10">
                                    {playlist.images?.[0]?.url ? (
                                        <Image
                                            src={playlist.images[0].url}
                                            alt={playlist.name}
                                            fill
                                            className="object-cover rounded-2xl"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-neutral-800 rounded-2xl flex items-center justify-center text-neutral-600">
                                            No Cover
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col justify-center space-y-4 text-center md:text-left">
                                    <div>
                                        <h3 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">{playlist.name}</h3>
                                        <p className="text-neutral-400 text-lg line-clamp-3">{playlist.description}</p>
                                    </div>

                                    <div className="flex flex-wrap gap-4 justify-center md:justify-start text-sm font-medium text-neutral-300">
                                        <span className="bg-neutral-800 px-3 py-1 rounded-full">By {playlist.owner.display_name}</span>
                                        <span className="bg-neutral-800 px-3 py-1 rounded-full">{playlist.tracks.total} Tracks</span>
                                    </div>

                                    <div className="pt-4">
                                        <a
                                            href={playlist.external_urls.spotify}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors font-semibold"
                                        >
                                            Open in Spotify
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </a>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="w-full flex flex-col gap-4">
                                <h3 className="text-2xl font-bold text-neutral-200">Saved Text List</h3>
                                <div className="w-full bg-neutral-950 rounded-xl p-6 border border-neutral-800 font-mono text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                                    {playlist.content}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </main>
        </div>
    )
}
