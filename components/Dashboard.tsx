"use client"

import { useState, useEffect } from "react"
import { useSession, signOut, signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import prompts from "@/config/prompts.json"

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
}

export default function Dashboard() {
    const { data: session, status } = useSession()
    const searchParams = useSearchParams()

    // Stepper State
    const [currentStep, setCurrentStep] = useState(1)

    // Step 1: Nickname State
    const [nickname, setNickname] = useState("")

    // Step 2: Voice Type State
    const [voiceType, setVoiceType] = useState<"MALE" | "FEMALE" | "ANY" | null>(null)

    // Step 3: Playlist State
    const [activeTab, setActiveTab] = useState<"text" | "url">("text")
    const [url, setUrl] = useState("")
    const [textInput, setTextInput] = useState("")
    const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
    // General State
    const [loading, setLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [isSinging, setIsSinging] = useState(false)
    const [audioUrl, setAudioUrl] = useState("")
    const [error, setError] = useState("")
    const [publicProfiles, setPublicProfiles] = useState<UserProfile[]>([])

    // Load initial data
    useEffect(() => {
        if (status === "authenticated") {
            fetchProfileAndPlaylist()
        }
    }, [status])

    const fetchProfileAndPlaylist = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/playlist")
            if (res.ok) {
                const data = await res.json()
                if (data.nickname) setNickname(data.nickname)
                if (data.voiceType) setVoiceType(data.voiceType)

                if (data.type === 'text' || data.type === 'spotify') {
                    setPlaylist(data)
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
                    else if (!data.content && !data.id) setCurrentStep(3) // No playlist
                    else if (!data.musicIdentity) setCurrentStep(4) // Has playlist, needs analysis
                    else setCurrentStep(5) // Done
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

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
        } catch (err) {
            setError("Failed to save nickname")
        } finally {
            setLoading(false)
        }
    }

    const saveStep2 = async (selectedVoice: "MALE" | "FEMALE" | "ANY") => {
        setVoiceType(selectedVoice)
        setLoading(true)
        setError("")
        try {
            await fetch("/api/playlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voiceType: selectedVoice })
            })
            setCurrentStep(3)
        } catch (err) {
            setError("Failed to save voice type")
        } finally {
            setLoading(false)
        }
    }

    const saveStep3 = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")

        const payload: any = {}
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

            const data = await res.json()

            setPlaylist(data)
            setCurrentStep(4)
        } catch (err: any) {
            setError(err.message || "Failed to save playlist")
        } finally {
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
        } catch (err: any) {
            setError(err.message || "Failed to analyze")
        } finally {
            setAnalyzing(false)
        }
    }

    const fetchPublicProfiles = async () => {
        try {
            const res = await fetch("/api/public-profiles")
            if (res.ok) {
                const data = await res.json()
                setPublicProfiles(data.profiles || [])
            }
        } catch (err) {
            console.error(err)
        }
    }


    // Fetch profiles if we start at step 5
    useEffect(() => {
        if (currentStep === 5) fetchPublicProfiles()
    }, [currentStep])


    return (
        <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-12 font-sans">
            <header className="flex justify-between items-center mb-12 max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                    MyMuMe
                </h1>
                <div className="flex items-center gap-4">
                    <span className="text-neutral-400 text-sm hidden md:inline">Step {currentStep} of 5</span>
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
                            <h2 className="text-3xl font-bold mb-2">What should we call you?</h2>
                            <p className="text-neutral-400">Choose a nickname for your MyMuMe identity.</p>
                        </div>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="e.g. MelodyMaker"
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
                            <h2 className="text-3xl font-bold mb-2">Choose your voice</h2>
                            <p className="text-neutral-400">Who should sing your life's soundtrack?</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { id: "FEMALE", label: "Female", icon: "👩‍🎤" },
                                { id: "MALE", label: "Male", icon: "👨‍🎤" },
                                { id: "ANY", label: "I don't care", icon: "🎲" }
                            ].map((voice) => (
                                <button
                                    key={voice.id}
                                    onClick={() => saveStep2(voice.id as any)}
                                    className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:border-green-500 hover:bg-neutral-800 transition-all group"
                                >
                                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">{voice.icon}</div>
                                    <div className="font-semibold">{voice.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 3: Playlist */}
                {currentStep === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold mb-2">Import your music</h2>
                            <p className="text-neutral-400">Provide a playlist to shape your identity.</p>
                            {activeTab === "text" && (
                                <p className="text-xs text-neutral-500 text-center mt-2">
                                    Tip: Use <a href="https://www.tunemymusic.com/" target="_blank" className="underline hover:text-white">TuneMyMusic</a> to <b>Export your Playlist to a File</b>, then copy and paste here.
                                </p>
                            )}
                        </div>

                        <div className="flex justify-center gap-4 mb-6">
                            <button onClick={() => setActiveTab("text")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "text" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}>Paste Text List</button>
                            <button onClick={() => setActiveTab("url")} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === "url" ? "bg-neutral-800 text-white" : "text-neutral-500"}`}>Spotify URL</button>
                        </div>

                        <form onSubmit={saveStep3} className="space-y-4">
                            {activeTab === "url" ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-neutral-400 text-center mb-4">
                                        Enter a public Spotify Playlist URL to import tracks.
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
                                <div className="space-y-2">
                                    <textarea
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder="Paste a list of Artist - Song..."
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
                                {loading ? "Analyzing..." : "Analyze Playlist"}
                            </button>
                        </form>

                        {error && (
                            <div className="mt-4 p-4 bg-red-900/20 text-red-300 rounded-xl text-center border border-red-900/50">
                                <p className="font-bold mb-1">Import Failed</p>
                                <p className="text-sm">{error}</p>
                                {activeTab === "url" && (
                                    <button
                                        onClick={() => {
                                            setActiveTab("text");
                                            setError("");
                                        }}
                                        className="text-xs mt-2 text-neutral-400 underline hover:text-white bg-transparent border-0 cursor-pointer"
                                    >
                                        Try copying the song list manually
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Analyze (With Preview) */}
                {currentStep === 4 && (
                    <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30">
                            <span className="text-4xl">🔮</span>
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold mb-2">Ready to discover your identity?</h2>
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
                                {analyzing ? "Analyzing Magic..." : "Analyze My Music Identity"}
                            </button>
                        </div>
                        {analyzing && (
                            <p className="text-sm text-neutral-400 animate-pulse mt-4">
                                Please be patient, generating your unique music identity can take a moment...
                            </p>
                        )}
                    </div>
                )}

                {/* Step 5: Success & Feed */}
                {currentStep === 5 && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {/* Success Banner */}
                        <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-3xl p-8 text-center backdrop-blur-sm">
                            <div className="text-5xl mb-4">🎉</div>
                            <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">Identity Established!</h2>
                            <p className="text-neutral-300 mb-6">Welcome to the collective, <span className="font-bold text-white">{nickname}</span>.</p>

                            <div className="mt-6 bg-black/30 rounded-xl p-6 text-left border border-white/5">
                                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Your Analysis</h3>
                                <div className="prose prose-invert prose-sm max-w-none text-neutral-300">
                                    {playlist?.musicIdentity && (
                                        (() => {
                                            try {
                                                const categories = JSON.parse(playlist.musicIdentity)
                                                return Array.isArray(categories) ? (
                                                    <div className="space-y-6">
                                                        {categories.map((c: any, i: number) => (
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

                        {/* Public Feed */}
                        <div className="space-y-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span className="text-2xl">🌍</span> Other MyMuMEs
                            </h3>
                            <div className="grid gap-4">
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
                        {/* Restart Button */}
                        <div className="text-center pt-8 border-t border-neutral-800">
                            <p className="text-neutral-500 mb-4">Want to try a different persona?</p>
                            <button
                                onClick={() => {
                                    setCurrentStep(1)
                                    setNickname("")
                                    setVoiceType(null)
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
                )}

                {error && currentStep !== 3 && <div className="mt-8 p-4 bg-red-900/20 text-red-300 rounded-xl text-center border border-red-900/50">{error}</div>}
            </main>
        </div>
    )
}
