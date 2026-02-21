"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"

interface SpotifyPlaylist {
    type: 'spotify'
    id: string
    name: string
    description: string
    images: { url: string }[]
    external_urls: { spotify: string }
    tracks?: {
        total: number
    }
    owner: {
        display_name: string
    }
    musicIdentity?: string | null
    content?: string
}

interface TextPlaylist {
    type: 'text'
    content: string
    musicIdentity?: string | null
    prompt?: string
}

type PlaylistData = SpotifyPlaylist | TextPlaylist

interface UserProfile {
    id: string
    nickname: string | null
    voiceType: string | null
    image: string | null
    musicIdentity: string | null
    musicalAttributes: string | null
}

const MUSICAL_ATTRIBUTES = [
    "Introverted", "Extroverted", "Sarcastic", "Athletic", "Creative",
    "Bookworm", "Gamer", "Foodie", "Outdoorsy", "Tech-savvy",
    "Chill", "Ambitious", "Practical", "Dreamer", "Organized",
    "Spontaneous", "Reliable", "Friendly", "Competitive", "Artistic",
    "Coffee Lover", "Traveler", "Animal Lover", "Movie Buff", "Night Owl"
]

export default function Dashboard() {
    const { data: session, status } = useSession()
    const searchParams = useSearchParams()

    // Stepper State
    const [currentStep, setCurrentStep] = useState<number>(1)

    // Step 1: Nickname State
    const [nickname, setNickname] = useState("")

    // Step 2: Voice & Attributes State
    const [voiceType, setVoiceType] = useState<"MALE" | "FEMALE" | "ANY" | null>(null)
    const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])

    // Step 3: Playlist State
    const [activeTab, setActiveTab] = useState<"text" | "url">("text")
    const [url, setUrl] = useState("")
    const [textInput, setTextInput] = useState("")
    const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
    // General State
    const [loading, setLoading] = useState(false)
    const [loadingMessage, setLoadingMessage] = useState("Analyzing...")
    const [analyzing, setAnalyzing] = useState(false)
    const [error, setError] = useState("")
    const [publicProfiles, setPublicProfiles] = useState<UserProfile[]>([])

    // Step 6: Transfer Identity State
    const [isMuted, setIsMuted] = useState(false)
    const [selectedAudioUrl, setSelectedAudioUrl] = useState("")
    const [showMyIdentity, setShowMyIdentity] = useState(false)
    const [showFullAnalysis, setShowFullAnalysis] = useState(false)

    const fetchProfileAndPlaylist = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/playlist")
            if (res.ok) {
                const data = await res.json()

                // Load data into state
                if (data.nickname) setNickname(data.nickname)
                if (data.voiceType) setVoiceType(data.voiceType)
                if (data.musicalAttributes) {
                    try {
                        setSelectedAttributes(JSON.parse(data.musicalAttributes))
                    } catch {
                        setSelectedAttributes(data.musicalAttributes.split(','))
                    }
                }

                if (data.type === 'text' || data.type === 'spotify') {
                    setPlaylist(data)
                }

                if (data.error) {
                    setError(data.details || data.error)
                    return
                }

                // Check URL params for overrides from auth redirect
                const stepParam = searchParams.get('step')
                const tabParam = searchParams.get('tab')

                if (stepParam) {
                    const step = parseInt(stepParam)
                    if (step >= 1 && step <= 5) setCurrentStep(step)
                    if (tabParam === 'url' || tabParam === 'text') setActiveTab(tabParam)
                } else {
                    // Determine step based on data existence
                    if (!data.nickname) setCurrentStep(1)
                    else if (!data.voiceType) setCurrentStep(2)
                    else if (!data.content && !data.id && !data.url) setCurrentStep(3) // No playlist
                    else if (!data.musicIdentity) setCurrentStep(4) // Has playlist, needs analysis
                    else setCurrentStep(6) // Done - Go straight to Feed
                }
            } else {
                const errorData = await res.json().catch(() => ({}))
                setError(errorData.error || `Failed to fetch profile (Status: ${res.status})`)
            }
        } catch (err) {
            console.error("Fetch error:", err)
            setError("Connection failed. Please check your internet or try again later.")
        } finally {
            setLoading(false)
        }
    }, [searchParams])

    // Load initial data
    useEffect(() => {
        if (status === "authenticated") {
            fetchProfileAndPlaylist()
        }
    }, [status, fetchProfileAndPlaylist])

    const saveStep1 = async () => {
        if (!nickname.trim()) return setError("Please enter a nickname")
        setLoading(true)
        setError("")
        try {
            await fetch("/api/playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nickname })
            })
            setCurrentStep(2)
        } catch {
            setError("Failed to save nickname")
        } finally {
            setLoading(false)
        }
    }

    const saveStep2 = async () => {
        if (!voiceType) return setError("Please select a voice type")
        if (selectedAttributes.length !== 4) return setError("Please select exactly 4 attributes")

        setLoading(true)
        setError("")
        try {
            await fetch("/api/playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    voiceType,
                    musicalAttributes: JSON.stringify(selectedAttributes)
                })
            })
            setCurrentStep(3)
        } catch {
            setError("Failed to save voice type and attributes")
        } finally {
            setLoading(false)
        }
    }

    const toggleAttribute = (attr: string) => {
        setSelectedAttributes(prev => {
            if (prev.includes(attr)) {
                return prev.filter(a => a !== attr)
            }
            if (prev.length < 4) {
                return [...prev, attr]
            }
            return prev
        })
    }

    const saveStep3 = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setLoadingMessage("Analyzing...")
        setError("")

        // Start a timer to change the loading message after 2 seconds
        const messageTimer = setTimeout(() => {
            setLoadingMessage("Finding first songs...")
        }, 2000)

        const payload: { url?: string; text?: string } = {}
        if (activeTab === "url") {
            if (!url.includes("open.spotify.com/playlist/")) {
                setLoading(false)
                return setError("Please enter a valid Spotify Playlist URL")
            }
            payload.url = url
        } else {
            if (!textInput.trim()) {
                setLoading(false)
                return setError("Please enter a list of songs")
            }
            payload.text = textInput
        }

        try {
            const res = await fetch("/api/playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || "Failed to save playlist")
            }

            if (res.headers.get('Content-Type')?.includes('application/x-ndjson')) {
                const reader = res.body?.getReader()
                if (!reader) throw new Error("Failed to read response")

                const textDecoder = new TextDecoder()

                let done = false
                while (!done) {
                    const { value, done: doneReading } = await reader.read()
                    done = doneReading
                    if (value) {
                        const chunk = textDecoder.decode(value)
                        const lines = chunk.split('\n').filter(Boolean)

                        for (const line of lines) {
                            try {
                                const data = JSON.parse(line)
                                if (data.type === 'progress') {
                                    setLoadingMessage(`Found ${data.count} songs...`)
                                } else if (data.type === 'text') {
                                    setPlaylist(data)
                                    setCurrentStep(4)
                                } else if (data.error) {
                                    throw new Error(data.details || data.error)
                                }
                            } catch (e) {
                                console.error("Error parsing stream chunk:", e)
                            }
                        }
                    }
                }
            } else {
                const data = await res.json()
                setPlaylist(data)
                setCurrentStep(4)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save playlist")
        } finally {
            clearTimeout(messageTimer)
            setLoading(false)
        }
    }

    const handleAnalyze = async () => {
        setAnalyzing(true)
        setError("")
        try {
            const res = await fetch("/api/analyze-identity", { method: "POST" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Analysis failed")

            setPlaylist(prev => prev ? { ...prev, musicIdentity: data.result } : null)
            setCurrentStep(5)
            fetchPublicProfiles()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to analyze")
        } finally {
            setAnalyzing(false)
        }
    }

    const fetchPublicProfiles = useCallback(async () => {
        try {
            const res = await fetch("/api/public-profiles")
            if (res.ok) {
                const data = await res.json()
                setPublicProfiles(data.profiles || [])
            }
        } catch (err) {
            console.error(err)
        }
    }, [])

    const startTransfer = () => {
        const maleSongs = [
            "/mocks/welcome/male/Echo_Bloom_Male.mp3",
            "/mocks/welcome/male/Echo_Bloom_2_Male.mp3"
        ]
        const femaleSongs = [
            "/mocks/welcome/female/Echo_Bloom.mp3",
            "/mocks/welcome/female/Echo_Bloom_2_Female.mp3"
        ]

        let pool = []
        if (voiceType === "MALE") pool = maleSongs
        else if (voiceType === "FEMALE") pool = femaleSongs
        else pool = [...maleSongs, ...femaleSongs]

        const randomSong = pool[Math.floor(Math.random() * pool.length)]
        setSelectedAudioUrl(randomSong)
        setCurrentStep(6)
        setShowMyIdentity(true) // Show identity first time entering Step 6
    }


    // Fetch profiles if we start at step 5
    useEffect(() => {
        if (currentStep === 5) fetchPublicProfiles()
    }, [currentStep, fetchPublicProfiles])


    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 font-sans">
            <header className="flex justify-between items-center mb-12 max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                    MyMuMe
                </h1>
                <div className="flex items-center gap-4">
                    {currentStep >= 5 && (
                        <button
                            onClick={() => {
                                setCurrentStep(6)
                                setShowMyIdentity(!showMyIdentity)
                            }}
                            className={`p-2 rounded-full transition-all transform hover:scale-110 ${showMyIdentity ? 'bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-neutral-800'}`}
                            title="See My Identity"
                        >
                            <span className="text-xl">👾</span>
                        </button>
                    )}
                    <span className="text-neutral-400 text-sm hidden md:inline">Step {currentStep} of 6</span>
                    {session?.user?.image && (
                        <Image src={session.user.image} alt="Profile" width={32} height={32} className="rounded-full border border-neutral-700" />
                    )}
                    <button onClick={() => signOut()} className="text-sm text-neutral-400 hover:text-white transition-colors">Sign out</button>
                </div>
            </header>

            <main className="max-w-2xl mx-auto">
                {/* Step 1: Nickname */}
                {currentStep === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">Name Your Musical Me</h2>
                        </div>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="e.g. Melody Maker"
                            className="w-full px-6 py-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500 text-lg text-center"
                        />
                        <button
                            onClick={saveStep1}
                            disabled={loading || !nickname}
                            className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}

                {/* Step 2: Voice Type */}
                {currentStep === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">Choose a Voice for Your Musical Me</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
                            {[
                                { id: "FEMALE", label: "Female", icon: "👩‍🎤" },
                                { id: "MALE", label: "Male", icon: "👨‍🎤" },
                                { id: "ANY", label: "I don't care", icon: "🎲" }
                            ].map((voice) => (
                                <button
                                    key={voice.id}
                                    onClick={() => setVoiceType(voice.id as "MALE" | "FEMALE" | "ANY")}
                                    className={`p-6 bg-neutral-900 border ${voiceType === voice.id ? 'border-green-500 bg-neutral-800' : 'border-neutral-800'} rounded-2xl hover:border-green-500 hover:bg-neutral-800 transition-all group`}
                                >
                                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">{voice.icon}</div>
                                    <div className="font-semibold">{voice.label}</div>
                                </button>
                            ))}
                        </div>

                        <div className="text-center mb-8">
                            <h3 className="text-xl font-bold mb-2">Define Its Personality</h3>
                            <p className="text-neutral-400">Select 4 attributes</p>
                            <div className="text-sm font-mono mt-2 text-green-500">
                                {selectedAttributes.length} / 4 Selected
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-10">
                            {MUSICAL_ATTRIBUTES.map((attr) => (
                                <button
                                    key={attr}
                                    onClick={() => toggleAttribute(attr)}
                                    className={`py-3 px-2 text-xs font-bold rounded-xl border transition-all ${selectedAttributes.includes(attr)
                                        ? "bg-green-500/20 border-green-500 text-green-400"
                                        : "bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                                        }`}
                                >
                                    {attr}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={saveStep2}
                            disabled={loading || !voiceType || selectedAttributes.length !== 4}
                            className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}

                {/* Step 3: Playlist */}
                {currentStep === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">Inject Your Music</h2>
                            <p className="text-neutral-400">Provide a songs that you love</p>
                        </div>

                        <div className="flex justify-center gap-4 mb-6">
                            <button onClick={() => setActiveTab("text")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "text" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}>Paste Text List</button>
                            <button onClick={() => setActiveTab("url")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "url" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}>Spotify</button>
                        </div>

                        <form onSubmit={saveStep3} className="space-y-4">
                            {activeTab === "url" ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-400 text-center mb-4">
                                        Enter a public Spotify Playlist URL with songs that you love.
                                    </p>
                                    <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://open.spotify.com/playlist/..."
                                        className="w-full px-6 py-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-400 text-center mb-4">
                                        Tip: Use <a href="https://www.tunemymusic.com/" target="_blank" className="underline hover:text-white">TuneMyMusic</a> to <b>Export your Playlist to a File</b>, then copy and paste here.
                                    </p>
                                    <textarea
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder={`Pink Floyd - The Dark Side of the Moon \nSabrina - Boys, Boys Boys\n...`}
                                        rows={8}
                                        className="w-full px-6 py-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-500"
                                    />
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || (activeTab === 'url' ? !url : !textInput)}
                                className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors disabled:opacity-50"
                            >
                                {loading ? loadingMessage : "Inject Playlist"}
                            </button>
                        </form>

                        {error && (
                            <div className="mt-4 p-4 bg-red-900/20 text-red-300 rounded-xl text-center border border-red-900/50">
                                <p className="font-bold mb-1">Import Failed</p>
                                <p className="text-sm">{error}</p>
                                {activeTab === "url" && (
                                    <button
                                        onClick={() => {
                                            setActiveTab("text")
                                            setError("")
                                        }}
                                        className="mt-2 text-xs underline hover:text-white opacity-70"
                                    >
                                        Try pasting text list instead
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Analyze (With Preview) */}
                {
                    currentStep === 4 && (
                        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
                            <div className="w-24 h-24 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30">
                                <span className="text-4xl">🔮</span>
                            </div>
                            <div>
                                <p className="text-neutral-400">We found <strong>{playlist?.type === 'spotify' && playlist.tracks ? playlist.tracks.total : (playlist?.content?.split('\n').length || 0)}</strong> songs.</p>
                            </div>

                            {/* Preview Box */}
                            <div className="w-full max-h-60 overflow-y-auto bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 text-left font-mono text-xs text-neutral-400 whitespace-pre-wrap">
                                {playlist?.content || "No songs found."}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCurrentStep(3)}
                                    className="px-6 py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-2xl transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={analyzing}
                                    className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xl rounded-2xl shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
                                >
                                    {analyzing ? "Understanding Your Musical Identity..." : "Transfer My Musical Identity"}
                                </button>
                            </div>
                            {analyzing && (
                                <p className="text-sm text-neutral-400 animate-pulse mt-4">
                                    Please be patient, understanding your unique music identity can take a moment...
                                </p>
                            )}
                        </div>
                    )
                }

                {/* Step 5: Success & Feed */}
                {
                    currentStep === 5 && (
                        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                            {/* Success Banner */}
                            <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-3xl p-8 text-center backdrop-blur-sm">
                                <div className="text-5xl mb-4">🎉</div>
                                <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">Musical Identity Understood!</h2>
                                <p className="text-neutral-300 mb-6">Dear <span className="font-bold text-white">{nickname}</span>, these are your main musical tastes:</p>

                                <div className="mt-6 bg-black/30 rounded-xl p-6 text-left border border-white/5">
                                    <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
                                        {playlist?.musicIdentity && (
                                            (() => {
                                                try {
                                                    const categories = JSON.parse(playlist.musicIdentity)
                                                    return Array.isArray(categories) ? (
                                                        <div className="space-y-6">
                                                            {categories.map((c: { title?: string; description?: string } | string, i: number) => (
                                                                <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5">
                                                                    <div className="flex items-center gap-3 mb-2">
                                                                        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold border border-indigo-500/30">
                                                                            {i + 1}
                                                                        </span>
                                                                        <span className="text-lg font-bold text-indigo-300">
                                                                            {typeof c === 'string' ? c : c.title}
                                                                        </span>
                                                                    </div>
                                                                    {typeof c === 'object' && c.description && (
                                                                        <p className="text-neutral-300 leading-relaxed pl-9">
                                                                            {c.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : <div className="whitespace-pre-wrap">{playlist.musicIdentity}</div>
                                                } catch { return <div className="whitespace-pre-wrap">{playlist.musicIdentity}</div> }
                                            })()
                                        )}
                                    </div>
                                </div>
                            </div>


                            {/* Transfer Identity Button */}
                            <div className="flex justify-center mt-12 pb-8 border-t border-neutral-800 pt-12">
                                <button
                                    onClick={startTransfer}
                                    className="px-10 py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-black text-2xl rounded-3xl shadow-2xl shadow-green-500/20 transform hover:scale-105 transition-all animate-bounce"
                                >
                                    🚀 Transfer Identity to Your Musical Me
                                </button>
                            </div>

                            {/* Restart Button */}
                            <div className="text-center pt-8 border-t border-neutral-800">
                                <p className="text-neutral-500 mb-4">Want to try a different persona?</p>
                                <button
                                    onClick={() => {
                                        setCurrentStep(1)
                                        setNickname("")
                                        setVoiceType(null)
                                        setSelectedAttributes([])
                                        setPlaylist(null)
                                        setUrl("")
                                        setTextInput("")
                                    }}
                                    className="px-6 py-3 border border-neutral-700 text-neutral-300 rounded-full hover:bg-neutral-800 hover:text-white transition-colors text-sm"
                                >
                                    ↺ Start Over
                                </button>
                            </div>
                        </div>
                    )
                }

                {/* Step 6: Musical Me Transfer */}
                {
                    currentStep === 6 && (
                        <div className="space-y-12 animate-in fade-in duration-700 text-center">
                            <div className="flex justify-center items-center gap-6 mb-8">
                                <audio
                                    src={selectedAudioUrl}
                                    autoPlay
                                    muted={isMuted}
                                    style={{ display: 'none' }}
                                    onEnded={() => console.log("Song finished")}
                                />
                                <button
                                    onClick={() => setIsMuted(!isMuted)}
                                    className="p-4 bg-neutral-800/50 hover:bg-neutral-800 rounded-full border border-neutral-700 transition-all transform hover:scale-110 flex items-center gap-2 group"
                                    title={isMuted ? "Unmute" : "Mute"}
                                >
                                    {isMuted ? (
                                        <>
                                            <span className="text-2xl">🔇</span>
                                            <span className="text-xs font-bold text-neutral-400 group-hover:text-white transition-colors">OFF</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-2xl">🔊</span>
                                            <span className="text-xs font-bold text-green-500 group-hover:text-green-400 transition-colors">ON</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {showMyIdentity ? (
                                <div className="space-y-12 animate-in zoom-in duration-500">
                                    <div className="space-y-4">
                                        <h2 className="text-4xl font-black bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                                            This is Your Identity
                                        </h2>
                                        <p className="text-xl text-neutral-400">The Musical Me that sings your soul...</p>
                                    </div>
                                    <div className="relative inline-block py-12">
                                        {/* The Beast */}
                                        <div className="text-[14rem] leading-none animate-bounce-slow relative inline-block filter drop-shadow-[0_0_40px_rgba(255,255,255,0.4)] md:text-[18rem]">
                                            👾
                                            <div className="absolute top-8 -right-8 animate-pulse text-6xl">🎵</div>
                                            <div className="absolute bottom-4 -left-12 animate-pulse delay-700 text-6xl">🎶</div>
                                        </div>

                                        {/* Singing Animation Overlay */}
                                        <div className="absolute -inset-12 border-8 border-dashed border-green-500/20 rounded-full animate-spin-slow"></div>
                                    </div>

                                    {/* Analysis Result (Icon Triggered) */}
                                    <div className={`transition-all duration-700 ease-in-out overflow-hidden mx-auto ${showFullAnalysis ? 'max-h-[4000px] opacity-100 mt-8' : 'max-h-0 opacity-0 mt-0'}`}>
                                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 backdrop-blur-md max-w-xl mx-auto text-left shadow-2xl">
                                            <div className="flex justify-between items-start mb-6">
                                                <div>
                                                    <h3 className="text-lg font-bold text-white mb-1">Musical Profile</h3>
                                                </div>
                                                <button
                                                    onClick={() => setShowFullAnalysis(false)}
                                                    className="text-neutral-500 hover:text-white transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            </div>

                                            <p className="text-neutral-300 text-sm mb-6 pb-4 border-b border-white/5">
                                                <span className="text-neutral-500 font-mono text-[10px] uppercase block mb-1">
                                                    {selectedAttributes.join(" • ")}</span>
                                            </p>

                                            <div className="space-y-6">
                                                {playlist?.musicIdentity && (
                                                    (() => {
                                                        try {
                                                            const categories = JSON.parse(playlist.musicIdentity)
                                                            return Array.isArray(categories) ? (
                                                                <div className="space-y-6">
                                                                    {categories.map((c: { title?: string; description?: string } | string, i: number) => (
                                                                        <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/5 group hover:bg-white/[0.07] transition-colors">
                                                                            <div className="flex items-center gap-3 mb-2">
                                                                                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-bold border border-indigo-500/30">
                                                                                    {i + 1}
                                                                                </span>
                                                                                <span className="text-base font-bold text-indigo-300">
                                                                                    {typeof c === 'string' ? c : c.title}
                                                                                </span>
                                                                            </div>
                                                                            {typeof c === 'object' && c.description && (
                                                                                <p className="text-neutral-300 text-xs leading-relaxed pl-9">
                                                                                    {c.description}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : <div className="whitespace-pre-wrap text-xs text-neutral-300">{playlist.musicIdentity}</div>
                                                        } catch { return <div className="whitespace-pre-wrap text-xs text-neutral-300">{playlist.musicIdentity}</div> }
                                                    })()
                                                )}
                                            </div>

                                            <button
                                                onClick={() => setShowFullAnalysis(false)}
                                                className="mt-8 w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors text-xs font-bold"
                                            >
                                                Collapse Analysis
                                            </button>
                                        </div>
                                    </div>

                                    {!showFullAnalysis && (
                                        <div className="mt-8 flex flex-col items-center gap-2 animate-in fade-in duration-1000">
                                            <button
                                                onClick={() => setShowFullAnalysis(true)}
                                                className="w-14 h-14 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center text-2xl hover:border-green-500/50 hover:bg-neutral-800 transition-all transform hover:scale-110 shadow-lg shadow-black/50 group"
                                                title="View Full Analysis"
                                            >
                                                <span className="group-hover:animate-pulse">📝</span>
                                            </button>
                                            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Profile Details</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setShowMyIdentity(false)}
                                        className="px-6 py-3 bg-neutral-800 text-white rounded-full hover:bg-neutral-700 transition-all font-bold"
                                    >
                                        Back to Feed
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center">
                                        <h2 className="text-3xl font-black bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-2">
                                            MuME Collective
                                        </h2>
                                        <p className="text-neutral-400">Discover other unique identities</p>
                                    </div>

                                    <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 backdrop-blur-md relative overflow-hidden">
                                        {/* Visualizer bars */}
                                        <div className="absolute bottom-0 left-0 right-0 h-24 flex items-end justify-center gap-1 px-4 opacity-20 pointer-events-none">
                                            {[...Array(20)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="w-full bg-green-500 rounded-t-sm"
                                                    style={{
                                                        height: `${Math.random() * 100}%`,
                                                        animation: `visualizer 1s ease-in-out infinite alternate`,
                                                        animationDelay: `${i * 0.05}s`
                                                    }}
                                                ></div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Public Feed */}
                                    <div className="grid gap-4 md:grid-cols-2 text-left">
                                        {publicProfiles.map((profile) => (
                                            <div key={profile.id} className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl flex items-center gap-4 hover:border-neutral-700 transition-colors">
                                                {profile.image ? (
                                                    <Image src={profile.image} alt={profile.nickname || "User"} width={48} height={48} className="rounded-full" />
                                                ) : (
                                                    <div className="w-12 h-12 bg-neutral-800 rounded-full flex items-center justify-center text-xl">👤</div>
                                                )}
                                                <div>
                                                    <div className="font-bold text-white">{profile.nickname || "Anonymous"}</div>
                                                    <div className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full inline-block mt-1">
                                                        Voice: {profile.voiceType || "Any"}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-12 border-t border-neutral-800">
                                <button
                                    onClick={() => {
                                        setCurrentStep(1)
                                        setNickname("")
                                        setVoiceType(null)
                                        setSelectedAttributes([])
                                        setPlaylist(null)
                                        setUrl("")
                                        setTextInput("")
                                    }}
                                    className="px-6 py-3 border border-neutral-700 text-neutral-300 rounded-full hover:bg-neutral-800 hover:text-white transition-colors text-sm"
                                >
                                    ↺ Start Over
                                </button>
                            </div>

                            <style jsx>{`
                            @keyframes visualizer {
                                from { height: 10%; }
                                to { height: 100%; }
                            }
                            .animate-bounce-slow {
                                animation: bounce 2s infinite;
                            }
                            .animate-spin-slow {
                                animation: spin 10s linear infinite;
                            }
                            @keyframes spin {
                                from { transform: rotate(0deg); }
                                to { transform: rotate(360deg); }
                            }
                        `}</style>
                        </div>
                    )
                }

                {
                    error && currentStep !== 3 && (
                        <div className="mt-8 p-4 bg-red-900/20 text-red-300 rounded-xl text-center border border-red-900/50">
                            {error}
                        </div>
                    )
                }
            </main >
        </div >
    )
}
