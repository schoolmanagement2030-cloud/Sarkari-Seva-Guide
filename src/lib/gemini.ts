import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getSchemeGuidance(query: string, context: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a helpful government scheme expert. Answer the user's query in Hindi. 
    Context about latest schemes: ${context}
    User Query: ${query}`,
    config: {
      systemInstruction: "You are 'Sarkari Seva Guide' AI. You help users understand Indian government schemes. Always respond in Hindi (Devanagari). Be polite and accurate.",
    }
  });
  return response.text;
}

export async function enhanceSchemeWithAI(title: string, snippet: string) {
  const prompt = `You are an expert on Indian Government Schemes. Given the following title and snippet of a news/scheme, write a detailed and structured description in Hindi.
  
  Title: ${title}
  Snippet: ${snippet}
  
  Format the output exactly like this:
  **योजना का नाम और उद्देश्य:** [Detailed explanation]
  **पात्रता (Eligibility):** [Who can apply]
  **जरूरी दस्तावेज़ (Documents Required):** [List of documents]
  **आवेदन कैसे करें (How to Apply):** [Step by step process]
  
  Keep it professional and helpful. If some details are missing, use your knowledge to provide general guidance for such schemes.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text;
}

export async function analyzeAndExtract(title: string, content: string, source: string) {
  const prompt = `Analyze this government/job information for a high-trust platform.
  Title: ${title}
  Content: ${content}
  Source: ${source}

  CRITICAL SAFETY CHECKS:
  1. Is this a real government scheme or official job?
  2. Is it clickbait or a scam?
  3. Is it currently active (not expired)?
  4. Is the source reliable?`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["Scheme", "Job"] },
            jobType: { type: Type.STRING, enum: ["Government", "Private"], nullable: true },
            category: { type: Type.STRING, enum: ["Central", "State", "Scholarship"] },
            state: { type: Type.STRING },
            eligibility: { type: Type.STRING },
            lastDate: { type: Type.STRING },
            isTrustworthy: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
            hindiTitle: { type: Type.STRING },
            hindiDescription: { type: Type.STRING },
            imageKeywords: { type: Type.STRING, description: "3-4 English keywords for a relevant image (e.g. 'farmer scheme', 'office job')" },
            isClickbait: { type: Type.BOOLEAN },
            isExpired: { type: Type.BOOLEAN }
          },
          required: ["type", "category", "state", "isTrustworthy", "confidence", "reasoning", "hindiTitle", "hindiDescription", "isClickbait", "isExpired"]
        }
      }
    });
    
    const result = JSON.parse(response.text || '{}');
    return result;
  } catch (err) {
    console.error("AI Analysis Error:", err);
    return null;
  }
}
