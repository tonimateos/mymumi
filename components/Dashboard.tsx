"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import PixelAvatar from "./PixelAvatar"

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
    url?: string
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
    city: string | null
    country: string | null
    mumeSeed?: string | null
    connectionStatus?: string | null
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
    const [randomSeed, setRandomSeed] = useState("")
    const [city, setCity] = useState<string | null>(null)

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

    // Compatibility Test State
    const [testProfile, setTestProfile] = useState<UserProfile | null>(null)
    const [testPart, setTestPart] = useState<number | null>(null)
    const [testOutcome, setTestOutcome] = useState<"positive" | "negative" | null>(null)

    // Song Access State
    const [matchedSongs, setMatchedSongs] = useState<{ nickname: string, songs: string[] } | null>(null)
    const [showSongModal, setShowSongModal] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)
    const [audioEnded, setAudioEnded] = useState(false)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [createdAt, setCreatedAt] = useState<string | null>(null)

    const fetchProfileAndPlaylist = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/playlist")
            if (res.ok) {
                const data = await res.json()

                // Load data into state
                if (data.nickname) setNickname(data.nickname)
                if (data.city) setCity(data.city)
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

                    if (data.mumeSeed) setRandomSeed(data.mumeSeed)
                    if (data.createdAt) setCreatedAt(data.createdAt)
                }
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
            // Set initial random seed from user ID or random
            setRandomSeed(session?.user?.id || Math.random().toString(36).substring(7))
        }
    }, [status, fetchProfileAndPlaylist, session?.user?.id])

    // Detect city automatically in the background
    useEffect(() => {
        if (currentStep === 1 && !city && status === "authenticated") {
            const detectCity = async () => {
                try {
                    const res = await fetch("/api/detect-city", { method: "POST" })
                    if (res.ok) {
                        const data = await res.json()
                        console.log("City data:", data)
                        if (data.city) setCity(data.city)
                    }
                } catch (err) {
                    console.error("City detection failed:", err)
                }
            }
            detectCity()
        }
    }, [currentStep, city, status])

    const handleRandomizeAvatar = () => {
        setRandomSeed(Math.random().toString(36).substring(7))
    }

    const saveStep1 = async () => {
        if (!nickname.trim()) return setError("Please enter a nickname")
        setLoading(true)
        setError("")
        try {
            await fetch("/api/playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nickname,
                    mumeSeed: randomSeed
                })
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

    const handleStartOver = async () => {
        const confirmed = window.confirm("This will completely delete your profile so you can start again. Are you sure?")
        if (!confirmed) return

        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/profile/reset", { method: "POST" })
            if (res.ok) {
                // Clear all local states
                setCurrentStep(1)
                setNickname("")
                setCity(null)
                setVoiceType(null)
                setSelectedAttributes([])
                setRandomSeed(session?.user?.id || Math.random().toString(36).substring(7))
                setPlaylist(null)
                setUrl("")
                setTextInput("")
                setShowMyIdentity(false)
                setError("")
            } else {
                const data = await res.json()
                setError(data.error || "Failed to reset profile")
            }
        } catch (err) {
            console.error("Reset error:", err)
            setError("Connection failed. Please try again.")
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

    const startCompatibilityTest = (profile: UserProfile) => {
        setTestProfile(profile)
        setTestPart(1)
        setTestOutcome(null)

        // Pick song for Part 1 (based on user's gender)
        const userGender = (voiceType === "FEMALE" ? "female" : "male") as "male" | "female"
        const part1Songs = {
            male: ["/mocks/meeting/part1/male/man-singing-who-are-you.mp3"],
            female: [
                "/mocks/meeting/part1/female/Echoes_of_Shared_Souls.mp3",
                "/mocks/meeting/part1/female/Echoes_of_Shared_Souls_2.mp3"
            ]
        }
        const pool = part1Songs[userGender]
        const song = pool[Math.floor(Math.random() * pool.length)]
        setSelectedAudioUrl(song)
        setIsMuted(false) // Unmute for test
    }

    const handleTestPartEnd = async () => {
        if (!testProfile || testPart === null) {
            setAudioEnded(true)
            console.log("Song finished (not in test)")
            return
        }

        if (testPart === 1) {
            setTestPart(2)
            // Pick song for Part 2 (based on other Mume's gender)
            const targetGender = (testProfile.voiceType === "FEMALE" ? "female" : "male") as "male" | "female"
            const part2Songs = {
                male: ["/mocks/meeting/part2/male/Dangerous_Charm.mp3"],
                female: ["/mocks/meeting/part2/female/Groove_Therapy.mp3"]
            }
            const pool = part2Songs[targetGender] || part2Songs.male // fallback
            const song = pool[Math.floor(Math.random() * pool.length)]
            setSelectedAudioUrl(song)
        } else if (testPart === 2) {
            setTestPart(3)
            // Random outcome
            const outcome = Math.random() > 0.5 ? "positive" : "negative"
            setTestOutcome(outcome)

            // Pick song for Part 3 (based on outcome and user's gender)
            const userGender = (voiceType === "FEMALE" ? "female" : "male") as "male" | "female"
            const part3Songs = {
                positive: {
                    male: ["/mocks/meeting/part3/positive/male/youreTheOne.mp3"],
                    female: ["/mocks/meeting/part3/positive/female/youreTheOne.mp3"]
                },
                negative: {
                    male: ["/mocks/meeting/part3/negative/male/Echoes_of_Another_Life.mp3"],
                    female: ["/mocks/meeting/part3/negative/female/Echoes_in_the_Veil.mp3"]
                }
            }
            const pool = part3Songs[outcome][userGender] || part3Songs[outcome].male
            const song = pool[Math.floor(Math.random() * pool.length)]
            setSelectedAudioUrl(song)

            // Save to DB
            try {
                await fetch("/api/mume-connection", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        receiverId: testProfile.id,
                        status: outcome
                    })
                })
                fetchPublicProfiles()
            } catch (err) {
                console.error("Failed to save connection:", err)
            }
        } else if (testPart === 3) {
            // Show result for a bit, then reset test state
            // Keep testProfile and outcome for the UI to show the final message
            // But clear testPart so it doesn't loop
            setTestPart(4) // Status 4 means "finished, showing final result"
        }
    }

    const fetchMatchedUserSongs = async (userId: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/profile/songs?userId=${userId}`)
            if (res.ok) {
                const data = await res.json()
                setMatchedSongs(data)
                setShowSongModal(true)
            } else {
                const data = await res.json()
                setError(data.error || "Failed to fetch songs")
            }
        } catch (err) {
            console.error("Error fetching songs:", err)
            setError("Connection failed. Please try again.")
        } finally {
            setLoading(false)
        }
    }


    // Fetch profiles if we are at step 5 or 6
    useEffect(() => {
        if (currentStep === 5 || currentStep === 6) fetchPublicProfiles()
    }, [currentStep, fetchPublicProfiles])


    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 font-sans">
            <header className="flex justify-between items-center mb-12 max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                    MyMuMe
                </h1>
                <div className="flex items-center gap-4 relative">
                    <a
                        href="https://github.com/tonimateos/mymume"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-neutral-500 hover:text-white transition-colors"
                        aria-label="GitHub Repository"
                    >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                        </svg>
                    </a>
                    {currentStep < 6 && (
                        <span className="text-neutral-400 text-sm hidden md:inline">Step {currentStep} of 6</span>
                    )}

                    {/* Profile Menu Trigger */}
                    <div className="relative">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="flex items-center gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-full hover:bg-neutral-800 transition-all active:scale-95 group shadow-lg"
                        >
                            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-neutral-700/50 bg-black/40">
                                <PixelAvatar seed={randomSeed || session?.user?.id || 'me'} size={32} className="relative z-10" />
                            </div>
                            <span className="text-sm font-bold text-neutral-400 mr-2 group-hover:text-white transition-colors hidden sm:inline">
                                {nickname || "Menu"}
                            </span>
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsMenuOpen(false)}
                                ></div>
                                <div className="absolute right-0 mt-3 w-56 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] z-50 py-2 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl">
                                    <button
                                        onClick={() => {
                                            startTransfer()
                                            setIsMenuOpen(false)
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors group"
                                    >
                                        <span className="text-lg group-hover:scale-110 transition-transform">👾</span>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white">My Profile</span>
                                            <span className="text-[10px] text-neutral-500">View your musical identity</span>
                                        </div>
                                    </button>

                                    <div className="h-px bg-neutral-800 my-1 mx-2"></div>

                                    <button
                                        onClick={() => signOut()}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-500/10 transition-colors group"
                                    >
                                        <span className="text-lg group-hover:scale-110 transition-transform">🚪</span>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-red-400">Sign Out</span>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-2xl mx-auto">
                {/* Step 1: Nickname */}
                {currentStep === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">Your Musical Me</h2>
                            <p className="text-sm text-neutral-500">Click the Mume to randomize</p>
                        </div>

                        <div
                            onClick={handleRandomizeAvatar}
                            className="flex justify-center p-8 bg-neutral-900 border border-neutral-800 rounded-3xl shadow-inner cursor-pointer hover:bg-neutral-800 transition-all group relative overflow-hidden active:scale-95"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <PixelAvatar
                                seed={randomSeed}
                                size={160}
                                className="drop-shadow-[0_0_20px_rgba(34,197,94,0.3)] group-hover:scale-110 transition-transform duration-300"
                            />
                        </div>

                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="Enter a name for your Mume (e.g. Melody Maker)"
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
                            <div className="flex justify-center mb-8">
                                <PixelAvatar
                                    seed={randomSeed}
                                    size={96}
                                    className="drop-shadow-[0_0_20px_rgba(34,197,94,0.3)] animate-pulse"
                                />
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
                                    {analyzing ? "Understanding Your Musical Identity..." : "Understand My Musical Identity"}
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
                                    onClick={handleStartOver}
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
                                {selectedAudioUrl && (
                                    <audio
                                        ref={audioRef}
                                        src={selectedAudioUrl}
                                        autoPlay
                                        muted={isMuted}
                                        style={{ display: 'none' }}
                                        onEnded={handleTestPartEnd}
                                        onPlay={() => setAudioEnded(false)}
                                    />
                                )}
                            </div>

                            {showMyIdentity ? (
                                <div className="space-y-12 animate-in zoom-in duration-500">
                                    <div className="space-y-4">
                                        <h2 className="text-4xl font-black bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                                            A New MuMe is Born!
                                        </h2>
                                    </div>
                                    <div
                                        className="relative inline-block py-12 cursor-pointer group"
                                        onClick={() => {
                                            const audio = audioRef.current
                                            if (!audio) return

                                            if (audioEnded || audio.paused) {
                                                audio.currentTime = 0
                                                audio.play().catch(err => console.error("Play error:", err))
                                                setAudioEnded(false)
                                                setIsMuted(false)
                                            } else {
                                                setIsMuted(!isMuted)
                                            }
                                        }}
                                    >
                                        {/* The Beast */}
                                        <div className="relative inline-block filter drop-shadow-[0_0_40px_rgba(34,197,94,0.4)] transition-transform active:scale-95">
                                            <PixelAvatar
                                                seed={randomSeed}
                                                size={240}
                                                className={`animate-bounce-slow ${isMuted ? 'grayscale-[0.5] opacity-80' : ''}`}
                                            />
                                            <div className="absolute top-8 -right-8 animate-pulse text-6xl">{isMuted ? '💤' : '🎵'}</div>
                                            <div className="absolute bottom-4 -left-12 animate-pulse delay-700 text-6xl">{isMuted ? '' : '🎶'}</div>

                                            {/* Mute/Unmute Indicator Overlay */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <div className="bg-black/60 backdrop-blur-md rounded-full p-4 border border-white/20">
                                                    <span className="text-4xl">{isMuted ? '🔊' : '🔇'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Singing Animation Overlay */}
                                        <div className="absolute -inset-12 border-8 border-dashed border-green-500/20 rounded-full animate-spin-slow"></div>
                                    </div>

                                    {/* Analysis Result (Permanently Visible) */}
                                    <div className="mx-auto mt-8 opacity-100">
                                        <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-8 backdrop-blur-md max-w-xl mx-auto text-left shadow-2xl">
                                            <div className="mb-6">
                                                <h3 className="text-lg font-bold text-white mb-0 uppercase tracking-wider">{nickname}</h3>
                                                {createdAt && (
                                                    <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mt-1">
                                                        Born: {new Date(createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                    </span>
                                                )}
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

                                            {/* User's Song List */}
                                            <div className="mt-10 pt-8 border-t border-white/5">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h4 className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em]">Your Songs</h4>
                                                    {playlist?.type === 'spotify' && playlist.url && (
                                                        <a
                                                            href={playlist.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] font-bold text-green-500 hover:text-green-400 transition-colors flex items-center gap-1.5 bg-green-500/10 px-3 py-1.5 rounded-full border border-green-500/20"
                                                        >
                                                            <span className="text-xs">🎧</span>
                                                            View on Spotify
                                                        </a>
                                                    )}
                                                </div>

                                                <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                                                    {playlist?.content ? (
                                                        playlist.content.split('\n').filter(s => s.trim().length > 0).map((song, i) => (
                                                            <div
                                                                key={i}
                                                                className="p-3 bg-white/[0.03] border border-white/5 rounded-xl text-neutral-400 text-xs flex justify-between items-center group hover:bg-white/[0.05] transition-all hover:text-neutral-300"
                                                            >
                                                                <span className="truncate mr-4">{song}</span>
                                                                <a
                                                                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-wider"
                                                                >
                                                                    Play ↗
                                                                </a>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center py-8 text-neutral-600 italic text-xs">
                                                            No source songs found.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>


                                    <div className="flex flex-col items-center gap-4 mt-12 pb-8">
                                        <button
                                            onClick={() => setShowMyIdentity(false)}
                                            className="w-full max-w-xs px-8 py-3 bg-neutral-800 text-white rounded-full hover:bg-neutral-700 transition-all font-bold"
                                        >
                                            The MuMe Collective
                                        </button>
                                        <button
                                            onClick={handleStartOver}
                                            className="w-full max-w-xs px-8 py-2 bg-transparent text-red-500/50 hover:text-red-500 transition-all font-bold text-[10px] uppercase tracking-widest mt-4"
                                        >
                                            Dangerous: Delete Profile
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center">
                                        <h2 className="text-3xl font-black bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent mb-2">
                                            MuMe Collective
                                        </h2>
                                        <p className="text-neutral-400">Connect with other unique musical identities</p>
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {publicProfiles.map((profile) => (
                                            <div
                                                key={profile.id}
                                                className={`group relative overflow-hidden bg-neutral-900/40 backdrop-blur-md border rounded-2xl p-5 transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,197,94,0.1)] ${profile.connectionStatus === 'positive' ? 'border-green-500/30' : 'border-neutral-800/50 hover:border-neutral-700'}`}
                                            >
                                                {/* Background Glow for Matches */}
                                                {profile.connectionStatus === 'positive' && (
                                                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none"></div>
                                                )}

                                                <div className="flex gap-4 items-start relative z-10 text-left">
                                                    <div className="relative shrink-0">
                                                        <PixelAvatar
                                                            seed={profile.mumeSeed || profile.id}
                                                            size={56}
                                                            className="rounded-2xl border border-neutral-700/50 shadow-inner"
                                                        />
                                                        {profile.connectionStatus === 'positive' && (
                                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-neutral-900 flex items-center justify-center text-[8px] animate-pulse">✨</div>
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="font-bold text-white truncate text-base">{profile.nickname || "Anonymous"}</div>
                                                            {profile.connectionStatus && (
                                                                <div className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${profile.connectionStatus === 'positive' ? 'bg-green-500 text-black' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                                                    {profile.connectionStatus === 'positive' ? 'Soulmate' : 'No Vibe'}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                                            <span className="text-[10px] text-neutral-400 bg-black/40 px-2 py-0.5 rounded-full border border-neutral-800">
                                                                {profile.voiceType || "Any"}
                                                            </span>
                                                            {profile.country && (
                                                                <span className="text-[10px] text-neutral-400 bg-black/40 px-2 py-0.5 rounded-full border border-neutral-800">
                                                                    📍 {profile.country}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-5 space-y-2 relative z-10">
                                                    {profile.connectionStatus === 'positive' ? (
                                                        <button
                                                            onClick={() => fetchMatchedUserSongs(profile.id)}
                                                            className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 group/btn"
                                                        >
                                                            <span>Explore Sonic Identity</span>
                                                            <span className="opacity-60 group-hover/btn:translate-x-1 transition-transform">→</span>
                                                        </button>
                                                    ) : profile.connectionStatus === 'negative' ? (
                                                        <div className="w-full py-2.5 bg-neutral-800/30 text-neutral-500 text-[10px] font-medium rounded-xl border border-neutral-800/50 flex flex-col items-center justify-center gap-1 cursor-not-allowed group/cooldown">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-red-500/50">✕</span>
                                                                <span className="uppercase tracking-widest font-black text-[9px]">Vibe Mismatch</span>
                                                            </div>
                                                            <div className="text-[9px] opacity-60 flex items-center gap-1">
                                                                <span>🕒</span>
                                                                <span>Next test available in 7 days</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => startCompatibilityTest(profile)}
                                                            className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl transition-colors border border-white/10 flex items-center justify-center gap-2"
                                                        >
                                                            <span>Test Compatibility</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>


                                </div>
                            )}


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
                {/* Compatibility Test Overlay */}
                {testProfile && testPart !== null && (
                    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-6 animate-in fade-in duration-500">
                        <div className="max-w-md w-full text-center space-y-8">
                            <div className="relative flex justify-center items-center gap-8 py-12">
                                {/* User Mume */}
                                <div className={`transition-all duration-500 ${testPart === 1 ? 'scale-125 filter drop-shadow-[0_0_30px_rgba(34,197,94,0.5)]' : 'opacity-50'}`}>
                                    <PixelAvatar seed={randomSeed || session?.user?.id || 'me'} size={128} />
                                    <div className="text-xs font-bold text-neutral-500 mt-2 uppercase tracking-widest">{nickname}</div>
                                </div>

                                {/* Connection Lines/Animation */}
                                <div className="flex-1 h-px bg-gradient-to-r from-green-500 via-white to-blue-500 relative">
                                    <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent w-20 h-full animate-ping-slow ${testPart === 1 || testPart === 2 ? 'opacity-100' : 'opacity-0'}`}></div>
                                </div>

                                {/* Target Mume */}
                                <div className={`transition-all duration-500 ${testPart === 2 ? 'scale-125 filter drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]' : 'opacity-50'}`}>
                                    <PixelAvatar seed={testProfile.mumeSeed || testProfile.id} size={128} />
                                    <div className="text-xs font-bold text-neutral-500 mt-2 uppercase tracking-widest truncate max-w-[80px]">
                                        {testProfile.nickname}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 min-h-[100px] flex flex-col justify-center">
                                {testPart === 1 && (
                                    <p className="text-xl font-bold animate-pulse text-green-400">
                                        {nickname} is establishing a musical connection with {testProfile.nickname}...
                                    </p>
                                )}
                                {testPart === 2 && (
                                    <p className="text-xl font-bold animate-pulse text-blue-400">
                                        {testProfile.nickname} is responding musically...
                                    </p>
                                )}
                                {testPart === 3 && (
                                    <p className="text-xl font-bold text-white">
                                        Revealing affinity...
                                    </p>
                                )}
                                {testPart === 4 && (
                                    <div className="animate-in zoom-in duration-700">
                                        <h3 className={`text-4xl font-black mb-2 ${testOutcome === 'positive' ? 'text-green-500' : 'text-red-500'}`}>
                                            {testOutcome === 'positive' ? 'Positive Connection!' : 'Negative Connection'}
                                        </h3>
                                        <p className="text-neutral-400 mb-8">
                                            {testOutcome === 'positive'
                                                ? `The musical vibes between ${nickname} and ${testProfile.nickname} are perfectly aligned. You now have access to their song list!`
                                                : `${nickname}'s musical frequencies aren't quite matching with ${testProfile.nickname} this time.`}
                                        </p>
                                        <div className="flex gap-4 justify-center">
                                            {testOutcome === 'positive' && (
                                                <button
                                                    onClick={() => {
                                                        const targetId = testProfile.id
                                                        setTestProfile(null)
                                                        setTestPart(null)
                                                        fetchMatchedUserSongs(targetId)
                                                    }}
                                                    className="px-8 py-4 bg-green-500 text-white font-bold rounded-2xl hover:bg-green-400 transition-colors shadow-lg shadow-green-500/20"
                                                >
                                                    See {testProfile.nickname} songs
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setTestProfile(null)
                                                    setTestPart(null)
                                                    setTestOutcome(null)
                                                }}
                                                className={`px-8 py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors ${testOutcome === 'positive' ? 'opacity-50 text-sm py-2 px-4' : ''}`}
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Song List Modal */}
                {showSongModal && matchedSongs && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
                        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-xl w-full max-h-[80vh] flex flex-col shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-2xl font-bold text-white">
                                    <span className="text-green-400">{matchedSongs.nickname}&apos;s</span> Songs
                                </h3>
                                <button
                                    onClick={() => setShowSongModal(false)}
                                    className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-400 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                {matchedSongs.songs.length > 0 ? (
                                    matchedSongs.songs.map((song, i) => (
                                        <a
                                            key={i}
                                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block p-3 bg-neutral-800/50 border border-neutral-700/30 rounded-xl text-neutral-300 hover:bg-neutral-800 hover:border-green-500/50 hover:text-white transition-all group"
                                        >
                                            <div className="flex justify-between items-center">
                                                <span>{song}</span>
                                                <span className="text-[10px] text-neutral-500 group-hover:text-green-500 font-bold uppercase tracking-wider">Play on YouTube ↗</span>
                                            </div>
                                        </a>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-neutral-500">
                                        No songs found.
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setShowSongModal(false)}
                                className="mt-8 w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </main >

            <style jsx global>{`
                @keyframes visualizer {
                    from { height: 40%; }
                    to { height: 100%; }
                }
                .animate-bounce-slow {
                    animation: bounce 7s infinite;
                }
                .animate-spin-slow {
                    animation: spin 10s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes ping-slow {
                    0% { left: -20%; opacity: 0; }
                    50% { opacity: 1; }
                    100% { left: 100%; opacity: 0; }
                }
                .animate-ping-slow {
                    animation: ping-slow 7s cubic-bezier(0, 0, 0.2, 1) infinite;
                }
                @keyframes musical-beat {
                    0%, 100% { transform: scale(1) translateY(0) rotate(0); }
                    25% { transform: scale(1.1) translateY(-10px) rotate(-3deg); }
                    50% { transform: scale(1) translateY(0) rotate(0); }
                    75% { transform: scale(1.1) translateY(-10px) rotate(3deg); }
                }
                .animate-musical-beat {
                    animation: musical-beat 2.5s ease-in-out infinite;
                    display: inline-block;
                }
            `}</style>
        </div >
    )
}
