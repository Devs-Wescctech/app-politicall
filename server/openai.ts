// OpenAI integration using blueprint javascript_openai_ai_integrations
import OpenAI from "openai";

// Validate AI Integration environment variables
const aiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!aiBaseUrl || !aiApiKey) {
  console.warn("AI Integrations not configured. Set AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY to enable AI features.");
}

const openai = aiBaseUrl && aiApiKey ? new OpenAI({
  baseURL: aiBaseUrl,
  apiKey: aiApiKey
}) : null;

export async function generateAiResponse(userMessage: string, postContent: string | null, mode: string): Promise<string> {
  if (!openai) {
    throw new Error("AI_INTEGRATION_NOT_CONFIGURED");
  }

  try {
    const systemPrompt = mode === "compliance" 
      ? "Você é um assistente de atendimento político seguindo as normas do TSE. Forneça respostas institucionais, objetivas e dentro das regras eleitorais. Encaminhe para canais oficiais quando necessário."
      : "Você é um assistente político que responde de forma profissional e alinhada com os valores do político. Mantenha um tom respeitoso e construtivo.";

    const contextMessage = postContent 
      ? `Contexto da publicação: "${postContent}"\n\nPergunta do usuário: ${userMessage}`
      : userMessage;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMessage }
      ],
      max_completion_tokens: 500,
    });

    return response.choices[0]?.message?.content || "Desculpe, não pude gerar uma resposta no momento.";
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    
    // Structured error handling for different OpenAI failures
    if (error.status === 401) {
      const apiError = new Error("AI_INVALID_API_KEY") as any;
      apiError.status = 401;
      throw apiError;
    }
    
    if (error.status === 429) {
      const apiError = new Error("AI_RATE_LIMIT") as any;
      apiError.status = 429;
      throw apiError;
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const apiError = new Error("AI_NETWORK_ERROR") as any;
      apiError.status = 503;
      throw apiError;
    }

    // Generic AI error
    const apiError = new Error("AI_GENERATION_ERROR") as any;
    apiError.status = 500;
    apiError.originalMessage = error.message;
    throw apiError;
  }
}
