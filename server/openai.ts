// OpenAI integration using blueprint javascript_openai_ai_integrations
import OpenAI from "openai";
import { storage } from "./storage";

// Validate AI Integration environment variables
const aiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

if (!aiBaseUrl || !aiApiKey) {
  console.warn("AI Integrations not configured. Set AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY to enable AI features.");
}

const defaultOpenai = aiBaseUrl && aiApiKey ? new OpenAI({
  baseURL: aiBaseUrl,
  apiKey: aiApiKey
}) : null;

export async function testOpenAiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const testClient = new OpenAI({ apiKey });
    await testClient.models.list(); // Cheap API call to test the key
    return { success: true, message: 'API key válida e ativa' };
  } catch (error: any) {
    if (error.status === 401) {
      return { success: false, message: 'Chave API inválida' };
    }
    if (error.status === 429) {
      return { success: false, message: 'Limite de requisições excedido' };
    }
    return { success: false, message: error.message || 'Erro ao verificar API key' };
  }
}

export async function generateAiResponse(
  userMessage: string, 
  postContent: string | null, 
  mode: string,
  userId: string,
  aiConfig?: {
    systemPrompt?: string | null;
    personalityTraits?: string | null;
    politicalInfo?: string | null;
    responseGuidelines?: string | null;
  }
): Promise<string> {
  // Check for custom API key first
  let openai: OpenAI | null = null;
  const customApiKey = await storage.getDecryptedApiKey(userId);
  
  if (customApiKey) {
    // Use custom API key
    openai = new OpenAI({
      apiKey: customApiKey
    });
  } else if (defaultOpenai) {
    // Use Replit AI Integration
    openai = defaultOpenai;
  } else {
    throw new Error("AI_INTEGRATION_NOT_CONFIGURED");
  }

  try {
    // Build system prompt from user's configuration
    let systemPrompt = "";
    
    // Use custom system prompt if provided, otherwise use defaults
    if (aiConfig?.systemPrompt) {
      systemPrompt = aiConfig.systemPrompt;
    } else {
      systemPrompt = mode === "compliance" 
        ? "Você é uma INTELIGÊNCIA ARTIFICIAL (IA) de atendimento político. SEMPRE inicie suas respostas deixando claro que você é uma IA/assistente virtual. Siga rigorosamente as normas do TSE para comunicação política. Suas respostas devem ser: 1) Identificar-se como IA/robô/assistente virtual logo no início, 2) Institucionais e imparciais, 3) Informativas sobre processos eleitorais, 4) Dentro das regras eleitorais, 5) Encaminhar para canais oficiais quando necessário. IMPORTANTE: Sempre deixe explícito que esta é uma resposta automatizada gerada por IA."
        : "Você é um assistente político que responde de forma profissional e alinhada com os valores do político. Mantenha um tom respeitoso e construtivo.";
    }
    
    // Add personality traits if configured
    if (aiConfig?.personalityTraits) {
      systemPrompt += `\n\nTraços de personalidade: ${aiConfig.personalityTraits}`;
    }
    
    // Add political information if configured
    if (aiConfig?.politicalInfo) {
      systemPrompt += `\n\nInformações políticas: ${aiConfig.politicalInfo}`;
    }
    
    // Add response guidelines if configured  
    if (aiConfig?.responseGuidelines) {
      systemPrompt += `\n\nDiretrizes de resposta: ${aiConfig.responseGuidelines}`;
    }

    const contextMessage = postContent 
      ? `Contexto da publicação: "${postContent}"\n\nPergunta do usuário: ${userMessage}`
      : userMessage;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMessage }
      ],
      max_tokens: 500,
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
