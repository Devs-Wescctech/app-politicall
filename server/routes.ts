import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, loginSchema, insertContactSchema, insertPoliticalAllianceSchema, insertDemandSchema, insertDemandCommentSchema, insertEventSchema, insertAiConfigurationSchema, insertAiTrainingExampleSchema, insertAiResponseTemplateSchema, insertMarketingCampaignSchema, insertNotificationSchema } from "@shared/schema";
import { db } from "./db";
import { politicalParties, politicalAlliances } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { generateAiResponse } from "./openai";
import { requireRole } from "./authorization";
import { z } from "zod";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in environment variables");
}
const JWT_SECRET = process.env.SESSION_SECRET;

// Middleware to verify JWT token
interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.userId = decoded.userId;
    
    // Fetch current role from database (authoritative source)
    // This ensures role changes take effect immediately without requiring new login
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      return res.status(403).json({ error: "Usuário não encontrado" });
    }
    
    req.userRole = user.role;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Token inválido" });
  }
}

// Seed political parties data - All 29 Brazilian political parties from 2025
async function seedPoliticalParties() {
  const parties = [
    // Esquerda
    { name: "Partido dos Trabalhadores", acronym: "PT", ideology: "Esquerda", description: "Partido de esquerda, fundado em 1980" },
    { name: "Partido Socialismo e Liberdade", acronym: "PSOL", ideology: "Esquerda", description: "Partido de esquerda socialista" },
    { name: "Partido Comunista do Brasil", acronym: "PCdoB", ideology: "Esquerda", description: "Partido comunista brasileiro" },
    { name: "Partido Verde", acronym: "PV", ideology: "Esquerda", description: "Partido com foco em questões ambientais" },
    { name: "Rede Sustentabilidade", acronym: "REDE", ideology: "Esquerda", description: "Partido com foco em sustentabilidade" },
    { name: "Partido Socialista dos Trabalhadores Unificado", acronym: "PSTU", ideology: "Esquerda", description: "Partido trotskista" },
    { name: "Partido da Causa Operária", acronym: "PCO", ideology: "Esquerda", description: "Partido comunista revolucionário" },
    { name: "Unidade Popular", acronym: "UP", ideology: "Esquerda", description: "Partido de esquerda" },
    
    // Centro-Esquerda
    { name: "Partido Socialista Brasileiro", acronym: "PSB", ideology: "Centro-Esquerda", description: "Partido socialista democrático" },
    { name: "Partido Democrático Trabalhista", acronym: "PDT", ideology: "Centro-Esquerda", description: "Partido trabalhista" },
    
    // Centro
    { name: "Partido da Social Democracia Brasileira", acronym: "PSDB", ideology: "Centro", description: "Partido social-democrata" },
    { name: "Movimento Democrático Brasileiro", acronym: "MDB", ideology: "Centro", description: "Um dos maiores partidos do Brasil" },
    { name: "Cidadania", acronym: "CIDADANIA", ideology: "Centro", description: "Partido de centro" },
    { name: "Avante", acronym: "AVANTE", ideology: "Centro", description: "Partido de centro" },
    { name: "Solidariedade", acronym: "SOLIDARIEDADE", ideology: "Centro", description: "Partido de centro" },
    { name: "Partido Mobilização Nacional", acronym: "PMN", ideology: "Centro", description: "Partido de centro" },
    { name: "Democracia Cristã", acronym: "DC", ideology: "Centro", description: "Partido democrata-cristão" },
    { name: "Partido da Mulher Brasileira", acronym: "PMB", ideology: "Centro", description: "Partido com foco em questões femininas" },
    
    // Centro-Direita
    { name: "Partido Social Democrático", acronym: "PSD", ideology: "Centro-Direita", description: "Partido de centro-direita" },
    { name: "Podemos", acronym: "PODE", ideology: "Centro-Direita", description: "Partido de centro-direita" },
    { name: "Agir", acronym: "AGIR", ideology: "Centro-Direita", description: "Partido de centro-direita" },
    { name: "Partido Renovador Trabalhista Brasileiro", acronym: "PRTB", ideology: "Centro-Direita", description: "Partido trabalhista de centro-direita" },
    { name: "Mobiliza", acronym: "MOBILIZA", ideology: "Centro-Direita", description: "Partido de centro-direita" },
    { name: "Partido Renovação Democrática", acronym: "PRD", ideology: "Centro-Direita", description: "Partido de renovação" },
    
    // Direita
    { name: "Progressistas", acronym: "PP", ideology: "Direita", description: "Partido conservador" },
    { name: "Republicanos", acronym: "REPUBLICANOS", ideology: "Direita", description: "Partido conservador evangélico" },
    { name: "Partido Liberal", acronym: "PL", ideology: "Direita", description: "Partido liberal-conservador" },
    { name: "União Brasil", acronym: "UNIÃO", ideology: "Direita", description: "Fusão de DEM e PSL" },
    { name: "Novo", acronym: "NOVO", ideology: "Direita", description: "Partido liberal de direita" },
  ];

  try {
    const existingParties = await storage.getAllParties();
    if (existingParties.length === 0) {
      for (const party of parties) {
        await storage.createParty(party);
      }
      console.log("✓ Political parties seeded successfully");
    }
  } catch (error) {
    console.error("Error seeding political parties:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed political parties on startup
  await seedPoliticalParties();

  // ==================== AUTHENTICATION ====================
  
  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });

      // Generate JWT token
      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "30d" });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao criar conta" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      const validPassword = await bcrypt.compare(validatedData.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "30d" });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao fazer login" });
    }
  });

  // Get current authenticated user (with fresh role from database)
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      const { password, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== USER MANAGEMENT (Admin Only) ====================
  
  // List all users (admin only)
  app.get("/api/users", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Don't send passwords to frontend
      const sanitizedUsers = allUsers.map(({ password, ...user }) => user);
      res.json(sanitizedUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user role (admin only)
  app.patch("/api/users/:id", authenticateToken, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      // Validate role if provided
      const updateSchema = z.object({
        role: z.enum(["admin", "coordenador", "assessor"]).optional(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Get current user to compare email
      const currentUser = await storage.getUser(req.params.id);
      if (!currentUser) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Check if email is being changed to one that already exists
      if (validatedData.email && validatedData.email !== currentUser.email) {
        const existingUser = await storage.getUserByEmail(validatedData.email);
        if (existingUser) {
          return res.status(400).json({ error: "Email já está em uso por outro usuário" });
        }
      }
      
      const updated = await storage.updateUser(req.params.id, validatedData);
      // CRITICAL: Never send password hash to client
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== CONTACTS ====================
  
  app.get("/api/contacts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.userId!);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contacts", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/contacts/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(req.params.id, validatedData);
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/contacts/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== POLITICAL PARTIES & ALLIANCES ====================
  
  app.get("/api/parties", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const parties = await storage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alliances", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const alliances = await storage.getAlliances(req.userId!);
      
      // Join with party data
      const parties = await storage.getAllParties();
      const partiesMap = new Map(parties.map(p => [p.id, p]));
      
      const alliancesWithParty = alliances.map(alliance => ({
        ...alliance,
        party: partiesMap.get(alliance.partyId),
      }));
      
      res.json(alliancesWithParty);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliances", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.parse(req.body);
      const alliance = await storage.createAlliance({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/alliances/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.partial().parse(req.body);
      const alliance = await storage.updateAlliance(req.params.id, validatedData);
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/alliances/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteAlliance(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== DEMANDS ====================
  
  app.get("/api/demands", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const demands = await storage.getDemands(req.userId!);
      res.json(demands);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/demands", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertDemandSchema.parse(req.body);
      const demand = await storage.createDemand({
        ...validatedData,
        userId: req.userId!,
      });

      // Create notification for urgent demands (non-blocking)
      if (demand.priority === "urgent") {
        try {
          await storage.createNotification({
            userId: req.userId!,
            type: "demand",
            title: "Demanda Urgente Criada",
            message: `A demanda "${demand.title}" foi criada com prioridade URGENTE`,
            priority: "urgent",
            isRead: false,
            link: `/demands/${demand.id}`,
          });
        } catch (notificationError) {
          console.error("Failed to create notification for urgent demand:", notificationError);
        }
      }

      res.json(demand);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/demands/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertDemandSchema.partial().parse(req.body);
      const demand = await storage.updateDemand(req.params.id, validatedData);
      res.json(demand);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/demands/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteDemand(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Demand comments
  app.get("/api/demands/:id/comments", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const comments = await storage.getDemandComments(req.params.id);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/demands/:id/comments", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertDemandCommentSchema.parse(req.body);
      const comment = await storage.createDemandComment({
        ...validatedData,
        demandId: req.params.id,
        userId: req.userId!,
      });

      // Notify demand owner about new comment (non-blocking)
      try {
        const demand = await storage.getDemand(req.params.id);
        if (demand && demand.userId !== req.userId) {
          await storage.createNotification({
            userId: demand.userId,
            type: "comment",
            title: "Novo Comentário",
            message: `Novo comentário adicionado na demanda "${demand.title}"`,
            priority: "normal",
            isRead: false,
            link: `/demands/${demand.id}`,
          });
        }
      } catch (notificationError) {
        console.error("Failed to create notification for demand comment:", notificationError);
      }

      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== EVENTS ====================
  
  app.get("/api/events", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const events = await storage.getEvents(req.userId!);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Converter strings ISO para objetos Date antes da validação
      const bodyWithDates = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const validatedData = insertEventSchema.parse(bodyWithDates);
      const event = await storage.createEvent({
        ...validatedData,
        userId: req.userId!,
      });

      // Notify about upcoming events (within 24 hours, non-blocking)
      try {
        const now = new Date();
        const eventStart = new Date(event.startDate);
        const timeDiffMs = eventStart.getTime() - now.getTime();
        const minutesUntilEvent = timeDiffMs / (1000 * 60);
        const hoursUntilEvent = minutesUntilEvent / 60;

        // Only create notification if event is in the future and within 24 hours
        if (minutesUntilEvent > 5 && hoursUntilEvent <= 24) {
          let timeMessage: string;
          let priority: "urgent" | "high" | "normal" = "normal";

          if (minutesUntilEvent <= 30) {
            // Less than 30 minutes
            const minutes = Math.round(minutesUntilEvent);
            timeMessage = `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
            priority = "urgent";
          } else if (minutesUntilEvent <= 60) {
            // Between 30 and 60 minutes
            const minutes = Math.round(minutesUntilEvent);
            timeMessage = `${minutes} minutos`;
            priority = "urgent";
          } else if (hoursUntilEvent <= 2) {
            // Between 1 and 2 hours
            const hours = Math.floor(hoursUntilEvent);
            const remainingMinutes = Math.round((hoursUntilEvent - hours) * 60);
            if (remainingMinutes > 0) {
              timeMessage = `${hours} hora${hours !== 1 ? 's' : ''} e ${remainingMinutes} minuto${remainingMinutes !== 1 ? 's' : ''}`;
            } else {
              timeMessage = `${hours} hora${hours !== 1 ? 's' : ''}`;
            }
            priority = "high";
          } else {
            // More than 2 hours
            const hours = Math.round(hoursUntilEvent);
            timeMessage = `${hours} hora${hours !== 1 ? 's' : ''}`;
            priority = hoursUntilEvent <= 6 ? "high" : "normal";
          }

          await storage.createNotification({
            userId: req.userId!,
            type: "event",
            title: "Evento Próximo",
            message: `O evento "${event.title}" está programado para daqui a ${timeMessage}`,
            priority: priority,
            isRead: false,
            link: `/agenda`,
          });
        }
      } catch (notificationError) {
        console.error("Failed to create notification for upcoming event:", notificationError);
      }

      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/events/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Converter strings ISO para objetos Date antes da validação
      const bodyWithDates = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const validatedData = insertEventSchema.partial().parse(bodyWithDates);
      const event = await storage.updateEvent(req.params.id, validatedData);
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== AI CONFIGURATION ====================
  
  app.get("/api/ai-config", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getAiConfig(req.userId!);
      
      // Include API key status but never the actual key
      const response = config ? {
        ...config,
        openaiApiKey: undefined, // Never send the actual key
        hasCustomKey: !!config.openaiApiKey,
        openaiApiKeyLast4: config.openaiApiKeyLast4 || null
      } : { 
        mode: "compliance",
        hasCustomKey: false,
        openaiApiKeyLast4: null
      };
      
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-config", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiConfigurationSchema.parse(req.body);
      const config = await storage.upsertAiConfig({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/ai-config/mode", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { mode } = req.body;
      const config = await storage.upsertAiConfig({
        mode,
        userId: req.userId!,
      });
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // OpenAI API Key Management
  app.post("/api/ai-config/openai-key", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: "Chave API inválida" });
      }
      
      // Basic validation - OpenAI keys start with "sk-"
      if (!apiKey.startsWith('sk-')) {
        return res.status(400).json({ error: "Chave API inválida" });
      }
      
      // Test the API key by making a simple request
      try {
        const OpenAI = (await import("openai")).default;
        const testClient = new OpenAI({ apiKey });
        await testClient.models.list();
      } catch (testError: any) {
        if (testError.status === 401) {
          return res.status(400).json({ error: "Chave API inválida" });
        }
        if (testError.status === 429) {
          return res.status(400).json({ error: "Limite de requisições excedido" });
        }
        return res.status(400).json({ error: "Erro ao validar chave API" });
      }
      
      // Store the encrypted API key
      await storage.setOpenAiApiKey(req.userId!, apiKey);
      
      // Get updated config to return
      const config = await storage.getAiConfig(req.userId!);
      
      res.json({ 
        success: true,
        message: "Chave API configurada com sucesso",
        openaiApiKeyLast4: config?.openaiApiKeyLast4
      });
    } catch (error: any) {
      console.error("Error setting OpenAI API key:", error);
      res.status(500).json({ error: "Erro ao configurar chave API" });
    }
  });

  app.delete("/api/ai-config/openai-key", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteOpenAiApiKey(req.userId!);
      res.json({ success: true, message: "Chave API removida com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao remover chave API" });
    }
  });

  // AI Conversations
  app.get("/api/ai-conversations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const conversations = await storage.getAiConversations(req.userId!);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Training Examples
  app.get("/api/ai-training-examples", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const examples = await storage.getTrainingExamples(req.userId!);
      res.json(examples);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-training-examples", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiTrainingExampleSchema.parse(req.body);
      const example = await storage.createTrainingExample({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(example);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/ai-training-examples/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiTrainingExampleSchema.partial().parse(req.body);
      const example = await storage.updateTrainingExample(req.params.id, validatedData);
      res.json(example);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-training-examples/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteTrainingExample(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // AI Response Templates
  app.get("/api/ai-response-templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const templates = await storage.getResponseTemplates(req.userId!);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-response-templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiResponseTemplateSchema.parse(req.body);
      const template = await storage.createResponseTemplate({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/ai-response-templates/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiResponseTemplateSchema.partial().parse(req.body);
      const template = await storage.updateResponseTemplate(req.params.id, validatedData);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-response-templates/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteResponseTemplate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate AI response
  app.post("/api/ai-conversations/generate", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { userMessage, postContent, platform } = req.body;
      
      if (!userMessage) {
        return res.status(400).json({ error: "Mensagem do usuário é obrigatória", code: "INVALID_INPUT" });
      }

      const config = await storage.getAiConfig(req.userId!);
      const mode = config?.mode || "compliance";

      const aiResponse = await generateAiResponse(userMessage, postContent, mode, req.userId!, {
        systemPrompt: config?.systemPrompt,
        personalityTraits: config?.personalityTraits,
        politicalInfo: config?.politicalInfo,
        responseGuidelines: config?.responseGuidelines
      });

      // Save conversation
      await storage.createAiConversation({
        userId: req.userId!,
        platform: platform || "test",
        postContent: postContent || null,
        userMessage,
        aiResponse,
        mode,
      });

      res.json({ response: aiResponse });
    } catch (error: any) {
      if (error.message === "AI_INTEGRATION_NOT_CONFIGURED") {
        return res.status(503).json({ 
          error: "Serviço de IA não configurado. Configure as variáveis de ambiente da integração OpenAI.",
          code: "AI_NOT_CONFIGURED"
        });
      }
      
      if (error.message === "AI_INVALID_API_KEY") {
        return res.status(401).json({
          error: "Chave de API da IA inválida. Verifique a configuração da integração.",
          code: "AI_INVALID_API_KEY"
        });
      }
      
      if (error.message === "AI_RATE_LIMIT") {
        return res.status(429).json({
          error: "Limite de taxa da IA excedido. Tente novamente em alguns instantes.",
          code: "AI_RATE_LIMIT"
        });
      }
      
      if (error.message === "AI_NETWORK_ERROR") {
        return res.status(503).json({
          error: "Erro de rede ao conectar com o serviço de IA. Tente novamente.",
          code: "AI_NETWORK_ERROR"
        });
      }
      
      if (error.message === "AI_GENERATION_ERROR") {
        return res.status(500).json({
          error: "Erro ao gerar resposta da IA. Tente novamente.",
          code: "AI_GENERATION_ERROR",
          details: error.originalMessage
        });
      }
      
      // Fallback for any unexpected errors - still structured
      const status = error.status || 500;
      res.status(status).json({ 
        error: "Erro ao processar requisição de IA.",
        code: "AI_GENERATION_ERROR",
        details: error.message || "Unknown error"
      });
    }
  });

  // ==================== MARKETING CAMPAIGNS ====================
  
  app.get("/api/campaigns", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const campaigns = await storage.getCampaigns(req.userId!);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertMarketingCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(campaign);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/send", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Update campaign status
      await storage.updateCampaign(req.params.id, {
        status: "sent",
        sentAt: new Date(),
      });

      res.json({ success: true, message: "Campanha enviada com sucesso" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== NOTIFICATIONS ====================
  
  // Get user notifications
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(req.userId!, limit);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread-count", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadCount(req.userId!);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create notification (internal use and for testing)
  app.post("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification({
        ...validatedData,
        userId: req.userId!,
      });
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notification = await storage.markAsRead(req.params.id, req.userId!);
      if (!notification) {
        return res.status(404).json({ error: "Notificação não encontrada ou não pertence a você" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark all notifications as read
  app.patch("/api/notifications/mark-all-read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.markAllAsRead(req.userId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteNotification(req.params.id, req.userId!);
      if (!deleted) {
        return res.status(404).json({ error: "Notificação não encontrada ou não pertence a você" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== DASHBOARD STATS ====================
  
  app.get("/api/dashboard/stats", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.userId!);
      const alliances = await storage.getAlliances(req.userId!);
      const demands = await storage.getDemands(req.userId!);
      const events = await storage.getEvents(req.userId!);
      const parties = await storage.getAllParties();

      // Calculate ideology distribution
      const partiesMap = new Map(parties.map(p => [p.id, p]));
      const ideologyDistribution: Record<string, number> = {};
      
      alliances.forEach(alliance => {
        const party = partiesMap.get(alliance.partyId);
        if (party) {
          ideologyDistribution[party.ideology] = (ideologyDistribution[party.ideology] || 0) + 1;
        }
      });

      const ideologyDistributionArray = Object.entries(ideologyDistribution).map(([ideology, count]) => ({
        ideology,
        count,
      }));

      const now = new Date();
      const pendingDemands = demands.filter(d => d.status === "pending").length;
      const upcomingEvents = events.filter(e => new Date(e.startDate) > now).length;

      res.json({
        totalContacts: contacts.length,
        totalAlliances: alliances.length,
        totalDemands: demands.length,
        pendingDemands,
        totalEvents: events.length,
        upcomingEvents,
        ideologyDistribution: ideologyDistributionArray,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
