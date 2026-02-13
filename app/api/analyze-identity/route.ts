import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import prompts from "@/config/prompts.json"

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { playlistText: true, sourceType: true },
        })

        if (!user || !user.playlistText) {
            return NextResponse.json({ error: "No text playlist found" }, { status: 404 })
        }

        // Safety check to ensure we only process text lists as requested
        // (Though the prompt could technically handle URLs if we fetched them first, 
        // the requirement implies processing the raw text input).

        const textToAnalyze = user.playlistText
        const prompt = `${prompts.identityAnalysis}\n${textToAnalyze}`

        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

        const result = await model.generateContent(prompt)
        const response = await result.response
        const textResponse = response.text().trim()

        // Clean and parse the response
        const cleanedResponse = textResponse.replace(/```json/g, "").replace(/```/g, "").trim()

        // Define stored type for clarity
        type IdentityCategory = { title: string, description: string }

        let identityCategories: IdentityCategory[]
        try {
            identityCategories = JSON.parse(cleanedResponse)
            if (!Array.isArray(identityCategories) || !identityCategories.every(item =>
                typeof item === 'object' && item !== null && 'title' in item && 'description' in item
            )) {
                throw new Error("Response is not an array of objects with title and description")
            }
        } catch (e) {
            console.error("Failed to parse Gemini response:", textResponse)
            return NextResponse.json({
                error: "analysis failed"
            }, { status: 500 })
        }

        // Save result to DB as minified JSON
        const jsonResult = JSON.stringify(identityCategories)
        await prisma.user.update({
            where: { id: session.user.id },
            data: { musicIdentity: jsonResult },
        })

        return NextResponse.json({ result: textResponse, prompt })

    } catch (error) {
        console.error("Error analyzing identity:", error)
        return NextResponse.json({ error: "Failed to analyze identity" }, { status: 500 })
    }
}
