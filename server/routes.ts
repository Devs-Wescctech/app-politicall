import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, loginSchema, insertContactSchema, insertPoliticalAllianceSchema, insertDemandSchema, insertDemandCommentSchema, insertEventSchema, insertAiConfigurationSchema, insertAiTrainingExampleSchema, insertAiResponseTemplateSchema, insertMarketingCampaignSchema, insertNotificationSchema, insertIntegrationSchema, insertGoogleAdsCampaignSchema, DEFAULT_PERMISSIONS } from "@shared/schema";
import { db } from "./db";
import { politicalParties, politicalAlliances, googleAdsCampaigns, googleAdsCampaignAssets } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { generateAiResponse, testOpenAiApiKey } from "./openai";
import { requireRole } from "./authorization";
import { authenticateToken, requirePermission, type AuthRequest } from "./auth";
import { z } from "zod";
import fs from "fs";
import path from "path";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in environment variables");
}
const JWT_SECRET = process.env.SESSION_SECRET;

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

// Seed test marketing campaign for demonstration
async function seedTestCampaign() {
  try {
    const testUserId = 'd0476e06-f1b0-4204-8280-111fa6478fc9'; // Known test user ID
    
    // Check if test user exists
    const testUser = await storage.getUser(testUserId);
    if (!testUser) {
      console.log("Test user not found, skipping test campaign creation");
      return;
    }
    
    // Check if test campaign already exists
    const existingCampaigns = await storage.getCampaigns(testUserId);
    if (existingCampaigns.length > 0) {
      console.log("Test campaign already exists");
      return;
    }
    
    // Create test campaign
    await storage.createCampaign({
      name: 'Campanha de Teste - Boas Vindas',
      type: 'email',
      subject: 'Bem-vindo à nossa plataforma!',
      message: 'Olá! Esta é uma campanha teste para demonstrar o sistema de campanhas de marketing. Aqui você pode criar campanhas de email ou WhatsApp, agendar envios e gerenciar seus contatos.',
      recipients: ['exemplo1@email.com', 'exemplo2@email.com', 'exemplo3@email.com'],
      status: 'draft',
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow as Date object
      userId: testUserId
    });
    
    console.log("Test campaign seeded successfully");
  } catch (error) {
    console.error("Error seeding test campaign:", error);
    // Don't throw - this is optional test data
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed political parties on startup
  await seedPoliticalParties();
  
  // Seed test campaign on startup
  await seedTestCampaign();

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
      
      // Always define permissions explicitly using defaults for role
      const permissionsToSave = validatedData.permissions || DEFAULT_PERMISSIONS[validatedData.role as keyof typeof DEFAULT_PERMISSIONS];
      
      // Create user
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
        permissions: permissionsToSave,
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
          permissions: user.permissions,
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
          permissions: user.permissions,
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

  // Update current user's profile
  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const profileUpdateSchema = z.object({
        name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres").optional(),
        phone: z.string().optional(),
        avatar: z.string().optional(),
        partyId: z.string().optional(),
        politicalPosition: z.string().optional(),
        lastElectionVotes: z.number().int().nonnegative().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6, "Nova senha deve ter no mínimo 6 caracteres").optional(),
      });

      const validatedData = profileUpdateSchema.parse(req.body);
      
      // If changing password, validate current password
      if (validatedData.newPassword) {
        if (!validatedData.currentPassword) {
          return res.status(400).json({ error: "Senha atual é obrigatória para alterar a senha" });
        }

        const user = await storage.getUserById(req.userId!);
        if (!user) {
          return res.status(404).json({ error: "Usuário não encontrado" });
        }

        const isPasswordValid = await bcrypt.compare(validatedData.currentPassword, user.password);
        if (!isPasswordValid) {
          return res.status(400).json({ error: "Senha atual incorreta" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(validatedData.newPassword, 10);
        const { currentPassword, newPassword, ...profileData } = validatedData;
        const updated = await storage.updateUser(req.userId!, { ...profileData, password: hashedPassword });
        const { password, ...sanitizedUser } = updated;
        return res.json(sanitizedUser);
      }

      // Update without password change
      const { currentPassword, newPassword, ...profileData } = validatedData;
      const updated = await storage.updateUser(req.userId!, profileData);
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao atualizar perfil" });
    }
  });

  // ==================== USER MANAGEMENT (Admin Only) ====================
  
  // List all users (admin only)
  app.get("/api/users", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Don't send passwords to frontend
      const sanitizedUsers = allUsers.map(({ password, ...user }) => user);
      res.json(sanitizedUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new user (admin only)
  app.post("/api/users/create", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      // Admin-specific user creation schema that includes role and permissions
      const adminCreateUserSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(2),
        role: z.enum(["admin", "coordenador", "assessor"]),
        permissions: z.object({
          dashboard: z.boolean(),
          contacts: z.boolean(),
          alliances: z.boolean(),
          demands: z.boolean(),
          agenda: z.boolean(),
          ai: z.boolean(),
          marketing: z.boolean(),
          users: z.boolean(),
        }).optional(),
      });
      
      const validatedData = adminCreateUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      // Always define permissions explicitly - use provided or defaults for role
      const permissionsToSave = validatedData.permissions || DEFAULT_PERMISSIONS[validatedData.role as keyof typeof DEFAULT_PERMISSIONS];
      
      // Create user with specified role and permissions
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
        permissions: permissionsToSave,
      });

      // Don't send password to frontend
      const { password, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao criar usuário" });
    }
  });

  // Update user role (admin only)
  app.patch("/api/users/:id", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      // Validate role and permissions if provided
      const updateSchema = z.object({
        role: z.enum(["admin", "coordenador", "assessor"]).optional(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        permissions: z.object({
          dashboard: z.boolean(),
          contacts: z.boolean(),
          alliances: z.boolean(),
          demands: z.boolean(),
          agenda: z.boolean(),
          ai: z.boolean(),
          marketing: z.boolean(),
          users: z.boolean(),
        }).optional(),
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

  // Delete user (admin only)
  app.delete("/api/users/:id", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      const userId = req.params.id;
      
      // Prevent admin from deleting themselves
      if (userId === req.userId) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      }
      
      // Get user to check if it exists and get role
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Prevent deleting admin users
      if (user.role === "admin") {
        return res.status(403).json({ error: "Não é permitido excluir usuários administradores" });
      }
      
      await storage.deleteUser(userId);
      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao excluir usuário" });
    }
  });

  // ==================== CONTACTS ====================
  
  app.get("/api/contacts", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.userId!);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contacts", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
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

  app.patch("/api/contacts/:id", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(req.params.id, validatedData);
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/contacts/:id", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== POLITICAL PARTIES & ALLIANCES ====================
  
  app.get("/api/parties", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const parties = await storage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/alliances", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
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

  app.post("/api/alliances", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
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

  app.patch("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.partial().parse(req.body);
      const alliance = await storage.updateAlliance(req.params.id, validatedData);
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteAlliance(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== DEMANDS ====================
  
  app.get("/api/demands", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      const demands = await storage.getDemands(req.userId!);
      res.json(demands);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/demands", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
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

  app.patch("/api/demands/:id", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertDemandSchema.partial().parse(req.body);
      const demand = await storage.updateDemand(req.params.id, validatedData);
      res.json(demand);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/demands/:id", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteDemand(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Demand comments
  app.get("/api/demands/:id/comments", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      const comments = await storage.getDemandComments(req.params.id);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/demands/:id/comments", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
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
  
  app.get("/api/events", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
    try {
      const events = await storage.getEvents(req.userId!);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
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

  app.patch("/api/events/:id", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
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

  app.delete("/api/events/:id", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== AI CONFIGURATION ====================
  
  app.get("/api/ai-config", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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

  app.post("/api/ai-config", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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

  app.patch("/api/ai-config/mode", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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
  app.post("/api/ai-config/openai-key", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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
      
      // Test the API key and update status
      const testResult = await testOpenAiApiKey(apiKey);
      const status = testResult.success ? 'active' : 'error';
      await storage.updateOpenAiApiStatus(req.userId!, status, testResult.message);
      
      // Get updated config to return
      const config = await storage.getAiConfig(req.userId!);
      
      res.json({ 
        success: true,
        message: testResult.success ? "Chave API configurada e validada com sucesso" : "Chave API configurada mas com erro",
        openaiApiKeyLast4: config?.openaiApiKeyLast4,
        status,
        statusMessage: testResult.message
      });
    } catch (error: any) {
      console.error("Error setting OpenAI API key:", error);
      res.status(500).json({ error: "Erro ao configurar chave API" });
    }
  });

  app.delete("/api/ai-config/openai-key", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteOpenAiApiKey(req.userId!);
      res.json({ success: true, message: "Chave API removida com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: "Erro ao remover chave API" });
    }
  });

  // GET OpenAI API Status
  app.get("/api/ai-config/openai-status", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const config = await storage.getAiConfig(req.userId!);
      
      // Check if using custom key or Replit integration
      const hasCustomKey = !!config?.openaiApiKey;
      
      if (!hasCustomKey) {
        // Using Replit AI Integration
        return res.json({
          status: 'active',
          message: 'Usando Integração Replit AI',
          hasCustomKey: false,
          checkedAt: new Date()
        });
      }
      
      // Return stored status for custom key
      res.json({
        status: config.openaiApiStatus || 'unknown',
        message: config.openaiApiStatusMessage || null,
        hasCustomKey: true,
        checkedAt: config.openaiApiStatusCheckedAt || null
      });
    } catch (error: any) {
      console.error("Error getting OpenAI status:", error);
      res.status(500).json({ error: "Erro ao obter status da API" });
    }
  });

  // POST Test OpenAI API Status
  app.post("/api/ai-config/test-openai-status", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const config = await storage.getAiConfig(req.userId!);
      
      // Check if using custom key or Replit integration
      const hasCustomKey = !!config?.openaiApiKey;
      
      if (!hasCustomKey) {
        // Using Replit AI Integration - always active
        return res.json({
          status: 'active',
          message: 'Usando Integração Replit AI',
          hasCustomKey: false,
          checkedAt: new Date()
        });
      }
      
      // Test custom API key
      const apiKey = await storage.getDecryptedApiKey(req.userId!);
      
      if (!apiKey) {
        const status = 'error';
        const message = 'Chave API não encontrada';
        await storage.updateOpenAiApiStatus(req.userId!, status, message);
        
        return res.json({
          status,
          message,
          hasCustomKey: true,
          checkedAt: new Date()
        });
      }
      
      // Test the API key
      const testResult = await testOpenAiApiKey(apiKey);
      const status = testResult.success ? 'active' : 'error';
      const checkedAt = new Date();
      
      // Update status in database
      await storage.updateOpenAiApiStatus(req.userId!, status, testResult.message, checkedAt);
      
      res.json({
        status,
        message: testResult.message,
        hasCustomKey: true,
        checkedAt
      });
    } catch (error: any) {
      console.error("Error testing OpenAI API:", error);
      
      // Update status to error
      const errorMessage = "Erro ao testar API";
      await storage.updateOpenAiApiStatus(req.userId!, 'error', errorMessage);
      
      res.status(500).json({ 
        status: 'error',
        message: errorMessage,
        hasCustomKey: true,
        checkedAt: new Date()
      });
    }
  });

  // Test AI Response Endpoint
  app.post("/api/ai-config/test-response", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      // Get AI configuration and training examples
      const config = await storage.getAiConfig(req.userId!);
      const trainingExamples = await storage.getAiTrainingExamples(req.userId!);
      
      // Check if AI is configured (either custom key or Replit integration)
      const hasCustomKey = !!config?.openaiApiKey;
      const hasReplitIntegration = true; // Replit AI is always available
      
      if (!hasCustomKey && !hasReplitIntegration) {
        return res.status(400).json({ 
          error: "Por favor, configure uma chave de API da OpenAI primeiro" 
        });
      }

      // Build context from training examples if available
      let trainingContext = "";
      const activeExamples = trainingExamples.filter(ex => ex.active);
      if (activeExamples.length > 0) {
        trainingContext = "\n\nExemplos de respostas para referência:\n";
        activeExamples.forEach(ex => {
          trainingContext += `\nPergunta: ${ex.question}\nResposta: ${ex.answer}\n`;
        });
      }

      // Create enhanced message with context
      const enhancedMessage = message + trainingContext;

      // Generate AI response using existing function
      const aiResponse = await generateAiResponse(
        enhancedMessage,
        null, // No post content for testing
        config?.mode || 'compliance',
        req.userId!,
        {
          systemPrompt: config?.systemPrompt,
          personalityTraits: config?.personalityTraits,
          politicalInfo: config?.politicalInfo,
          responseGuidelines: config?.responseGuidelines
        }
      );

      res.json({ 
        response: aiResponse,
        message: message
      });
    } catch (error: any) {
      console.error("Error generating test response:", error);
      res.status(500).json({ 
        error: error.message === "AI_INTEGRATION_NOT_CONFIGURED" 
          ? "Por favor, configure a integração com a OpenAI primeiro"
          : "Erro ao gerar resposta da IA"
      });
    }
  });

  // AI Conversations
  app.get("/api/ai-conversations", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const conversations = await storage.getAiConversations(req.userId!);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Training Examples
  app.get("/api/ai-training-examples", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const examples = await storage.getTrainingExamples(req.userId!);
      res.json(examples);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-training-examples", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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

  app.patch("/api/ai-training-examples/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiTrainingExampleSchema.partial().parse(req.body);
      const example = await storage.updateTrainingExample(req.params.id, validatedData);
      res.json(example);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-training-examples/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteTrainingExample(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // AI Response Templates
  app.get("/api/ai-response-templates", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const templates = await storage.getResponseTemplates(req.userId!);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai-response-templates", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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

  app.patch("/api/ai-response-templates/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiResponseTemplateSchema.partial().parse(req.body);
      const template = await storage.updateResponseTemplate(req.params.id, validatedData);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-response-templates/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteResponseTemplate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate AI response
  app.post("/api/ai-conversations/generate", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
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
  
  app.get("/api/campaigns", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaigns = await storage.getCampaigns(req.userId!);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
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

  app.post("/api/campaigns/:id/send", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign || campaign.userId !== req.userId!) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      const service = campaign.type === 'email' ? 'sendgrid' : 'twilio';
      const integration = await storage.getIntegration(req.userId!, service);
      
      if (!integration || !integration.enabled) {
        return res.status(400).json({ 
          error: `Integração ${campaign.type === 'email' ? 'de email' : 'do WhatsApp'} não configurada` 
        });
      }
      
      try {
        if (campaign.type === 'email' && integration.sendgridApiKey) {
          const sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(integration.sendgridApiKey);
          
          await sgMail.sendMultiple({
            to: campaign.recipients as string[],
            from: {
              email: integration.fromEmail!,
              name: integration.fromName || 'Politicall'
            },
            subject: campaign.subject || 'Mensagem do Politicall',
            html: campaign.message.replace(/\n/g, '<br>')
          });
        } else if (campaign.type === 'whatsapp' && integration.twilioAccountSid) {
          const twilio = require('twilio');
          const client = twilio(integration.twilioAccountSid, integration.twilioAuthToken);
          
          const promises = (campaign.recipients as string[]).map((phone: string) => 
            client.messages.create({
              from: integration.twilioPhoneNumber,
              to: phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`,
              body: campaign.message
            })
          );
          
          await Promise.allSettled(promises);
        }
        
        await storage.updateCampaign(campaign.id, {
          status: "sent",
          sentAt: new Date(),
        });
        
        res.json({ success: true, message: 'Campanha enviada com sucesso!' });
      } catch (sendError: any) {
        console.error('Send error:', sendError);
        res.status(500).json({ error: 'Falha ao enviar campanha', details: sendError.message });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== GOOGLE ADS CAMPAIGNS ====================
  
  // Utility function to generate slug from campaign name
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Trim hyphens from edges
  }

  // Get all Google Ads campaigns for user
  app.get("/api/google-ads-campaigns", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaigns = await storage.getGoogleAdsCampaigns(req.userId!);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single Google Ads campaign
  app.get("/api/google-ads-campaigns/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getGoogleAdsCampaign(req.params.id);
      
      if (!campaign || campaign.userId !== req.userId!) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Get assets for this campaign
      const assets = await storage.getCampaignAssets(campaign.id);
      
      res.json({ ...campaign, assets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new Google Ads campaign
  app.post("/api/google-ads-campaigns", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertGoogleAdsCampaignSchema.parse(req.body);
      
      // Generate unique slug
      let slug = generateSlug(validatedData.campaignName);
      let counter = 1;
      let finalSlug = slug;
      
      // Check for slug uniqueness and append counter if needed
      while (true) {
        const existing = await db.query.googleAdsCampaigns.findFirst({
          where: eq(googleAdsCampaigns.lpSlug, finalSlug)
        });
        if (!existing) break;
        finalSlug = `${slug}-${counter}`;
        counter++;
      }

      // Calculate management fee (15% of budget)
      const budget = parseFloat(validatedData.budget);
      const managementFee = (budget * 0.15).toFixed(2);

      // Generate LP URL
      const lpUrl = `https://www.politicall.com.br/${finalSlug}`;

      const campaign = await storage.createGoogleAdsCampaign({
        ...validatedData,
        managementFee,
        lpSlug: finalSlug,
        lpUrl,
        userId: req.userId!,
      });
      
      res.json(campaign);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Update Google Ads campaign
  app.patch("/api/google-ads-campaigns/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getGoogleAdsCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Only campaign owner or admin can update
      const user = await storage.getUser(req.userId!);
      if (campaign.userId !== req.userId! && user?.role !== 'admin') {
        return res.status(403).json({ error: "Sem permissão para atualizar esta campanha" });
      }

      // Recalculate management fee if budget changes
      const updates: any = { ...req.body };
      if (req.body.budget) {
        const budget = parseFloat(req.body.budget);
        updates.managementFee = (budget * 0.15).toFixed(2);
      }

      const updated = await storage.updateGoogleAdsCampaign(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete Google Ads campaign
  app.delete("/api/google-ads-campaigns/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getGoogleAdsCampaign(req.params.id);
      
      if (!campaign || campaign.userId !== req.userId!) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      await storage.deleteGoogleAdsCampaign(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get campaign assets/images
  app.get("/api/google-ads-campaigns/:id/assets", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const assets = await storage.getCampaignAssets(req.params.id);
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upload campaign image (base64) - DEPRECATED, use upload-asset instead
  app.post("/api/google-ads-campaigns/:id/upload-image", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      console.log('[UPLOAD] Starting upload for campaign:', req.params.id);
      const campaign = await storage.getGoogleAdsCampaign(req.params.id);
      
      if (!campaign || campaign.userId !== req.userId!) {
        console.log('[UPLOAD] Campaign not found or unauthorized');
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      const { imageData, filename, mimeType } = req.body;
      console.log('[UPLOAD] Received:', { filename, mimeType, dataLength: imageData?.length });
      
      if (!imageData || !filename || !mimeType) {
        console.log('[UPLOAD] Missing data');
        return res.status(400).json({ error: "Dados da imagem incompletos" });
      }

      // Validate mime type
      if (!mimeType.startsWith('image/')) {
        console.log('[UPLOAD] Invalid mime type');
        return res.status(400).json({ error: "Apenas imagens são permitidas" });
      }

      console.log('[UPLOAD] Decoding base64...');
      // Decode base64 and get size
      const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const sizeBytes = buffer.length;
      console.log('[UPLOAD] Buffer size:', sizeBytes);

      // Generate unique filename
      const timestamp = Date.now();
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageKey = `google-ads-campaigns/${campaign.id}/${timestamp}_${safeFilename}`;
      const fullPath = `attached_assets/${storageKey}`;

      console.log('[UPLOAD] Creating directory...');
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      console.log('[UPLOAD] Writing file to:', fullPath);
      // Write file
      fs.writeFileSync(fullPath, buffer);

      console.log('[UPLOAD] Creating asset record...');
      // Create asset record
      const asset = await storage.createCampaignAsset({
        campaignId: campaign.id,
        assetType: "image",
        storageKey,
        url: `/assets/${storageKey}`,
        originalFilename: filename,
        sizeBytes,
        mimeType,
        uploadedBy: req.userId!,
      });

      console.log('[UPLOAD] Success! Asset ID:', asset.id);
      res.json(asset);
    } catch (error: any) {
      console.error('[UPLOAD] Error:', error.message, error.stack);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload campaign asset (image or video, base64)
  app.post("/api/google-ads-campaigns/:id/upload-asset", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      console.log('[UPLOAD] Starting asset upload for campaign:', req.params.id);
      const campaign = await storage.getGoogleAdsCampaign(req.params.id);
      
      if (!campaign || campaign.userId !== req.userId!) {
        console.log('[UPLOAD] Campaign not found or unauthorized');
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      const { assetData, filename, mimeType, assetType } = req.body;
      console.log('[UPLOAD] Received:', { filename, mimeType, assetType, dataLength: assetData?.length });
      
      if (!assetData || !filename || !mimeType || !assetType) {
        console.log('[UPLOAD] Missing data');
        return res.status(400).json({ error: "Dados do arquivo incompletos" });
      }

      // Validate asset type and mime type
      if (assetType === "image" && !mimeType.startsWith('image/')) {
        console.log('[UPLOAD] Invalid image mime type');
        return res.status(400).json({ error: "Apenas imagens são permitidas" });
      }
      if (assetType === "video" && !mimeType.startsWith('video/')) {
        console.log('[UPLOAD] Invalid video mime type');
        return res.status(400).json({ error: "Apenas vídeos são permitidos" });
      }

      console.log('[UPLOAD] Decoding base64...');
      // Decode base64 and get size
      const mimePattern = new RegExp(`^data:(image|video)/\\w+;base64,`);
      const buffer = Buffer.from(assetData.replace(mimePattern, ''), 'base64');
      const sizeBytes = buffer.length;
      console.log('[UPLOAD] Buffer size:', sizeBytes);

      // Generate unique filename
      const timestamp = Date.now();
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storageKey = `google-ads-campaigns/${campaign.id}/${timestamp}_${safeFilename}`;
      const fullPath = `attached_assets/${storageKey}`;

      console.log('[UPLOAD] Creating directory...');
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      console.log('[UPLOAD] Writing file to:', fullPath);
      // Write file
      fs.writeFileSync(fullPath, buffer);

      console.log('[UPLOAD] Creating asset record...');
      // Create asset record
      const asset = await storage.createCampaignAsset({
        campaignId: campaign.id,
        assetType,
        storageKey,
        url: `/assets/${storageKey}`,
        originalFilename: filename,
        sizeBytes,
        mimeType,
        uploadedBy: req.userId!,
      });

      console.log('[UPLOAD] Success! Asset ID:', asset.id);
      res.json(asset);
    } catch (error: any) {
      console.error('[UPLOAD] Error:', error.message, error.stack);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete campaign image
  app.delete("/api/google-ads-campaign-assets/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      // Get asset to verify ownership
      const assets = await db.select()
        .from(googleAdsCampaignAssets)
        .where(eq(googleAdsCampaignAssets.id, req.params.id));
      
      if (assets.length === 0) {
        return res.status(404).json({ error: "Imagem não encontrada" });
      }

      const asset = assets[0];

      // Verify campaign ownership
      const campaign = await storage.getGoogleAdsCampaign(asset.campaignId);
      if (!campaign || campaign.userId !== req.userId!) {
        return res.status(403).json({ error: "Sem permissão para deletar esta imagem" });
      }

      // Delete file from filesystem
      const fullPath = `attached_assets/${asset.storageKey}`;
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      // Delete record
      await storage.deleteCampaignAsset(req.params.id);
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== INTEGRATIONS ====================
  
  // Get all integrations for user
  app.get("/api/integrations", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const integrations = await storage.getIntegrations(req.userId!);
      // Remove sensitive data from response for security
      const sanitized = integrations.map(i => ({
        ...i,
        sendgridApiKey: i.sendgridApiKey ? '***' : null,
        twilioAuthToken: i.twilioAuthToken ? '***' : null
      }));
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get specific integration
  app.get("/api/integrations/:service", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const integration = await storage.getIntegration(req.userId!, req.params.service);
      if (integration) {
        // Mask sensitive fields
        integration.sendgridApiKey = integration.sendgridApiKey ? '***' : null;
        integration.twilioAuthToken = integration.twilioAuthToken ? '***' : null;
      }
      res.json(integration);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Save/update integration
  app.post("/api/integrations", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertIntegrationSchema.parse(req.body);
      const integration = await storage.upsertIntegration({
        ...validatedData,
        userId: req.userId!
      });
      // Mask sensitive fields in response
      const sanitized = {
        ...integration,
        sendgridApiKey: integration.sendgridApiKey ? '***' : null,
        twilioAuthToken: integration.twilioAuthToken ? '***' : null
      };
      res.json(sanitized);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Test integration
  app.post("/api/integrations/:service/test", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const integration = await storage.getIntegration(req.userId!, req.params.service);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integração não encontrada' });
      }
      
      if (req.params.service === 'sendgrid') {
        // Test SendGrid by verifying API key
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(integration.sendgridApiKey);
        
        // Try to send test email in sandbox mode
        await sgMail.send({
          to: integration.fromEmail,
          from: integration.fromEmail,
          subject: 'Teste de Integração - Politicall',
          text: 'Este é um email de teste da integração com SendGrid.',
          mailSettings: {
            sandboxMode: { enable: true } // Don't actually send
          }
        });
        res.json({ success: true, message: 'SendGrid configurado corretamente!' });
      } else if (req.params.service === 'twilio') {
        // Test Twilio
        const twilio = require('twilio');
        const client = twilio(integration.twilioAccountSid, integration.twilioAuthToken);
        
        // Verify credentials by fetching account
        await client.api.accounts(integration.twilioAccountSid).fetch();
        res.json({ success: true, message: 'Twilio configurado corretamente!' });
      } else {
        res.status(400).json({ error: 'Serviço não suportado' });
      }
    } catch (error: any) {
      res.status(400).json({ 
        error: 'Falha no teste de integração',
        details: error.message 
      });
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

  // ==================== WEBHOOKS (Meta, WhatsApp, Twitter) ====================
  
  // Facebook/Instagram Webhook - Verification (GET)
  app.get("/api/webhook/facebook", (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Você deve configurar o mesmo token no Meta Developer Console
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'politicall_fb_verify_token_2024';
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✓ Facebook webhook verified');
      res.status(200).send(challenge);
    } else {
      console.log('✗ Facebook webhook verification failed');
      res.sendStatus(403);
    }
  });

  // Facebook/Instagram Webhook - Receive Events (POST)
  app.post("/api/webhook/facebook", (req, res) => {
    const body = req.body;
    
    console.log('Facebook webhook event received:', JSON.stringify(body, null, 2));
    
    if (body.object === 'page') {
      body.entry?.forEach((entry: any) => {
        const webhookEvent = entry.messaging?.[0];
        if (webhookEvent) {
          console.log('Facebook message:', webhookEvent);
          // TODO: Process Facebook/Instagram message
          // Implement AI response logic here
        }
      });
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  });

  // WhatsApp Webhook - Verification (GET)
  app.get("/api/webhook/whatsapp", (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'politicall_wa_verify_token_2024';
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✓ WhatsApp webhook verified');
      res.status(200).send(challenge);
    } else {
      console.log('✗ WhatsApp webhook verification failed');
      res.sendStatus(403);
    }
  });

  // WhatsApp Webhook - Receive Events (POST)
  app.post("/api/webhook/whatsapp", (req, res) => {
    const body = req.body;
    
    console.log('WhatsApp webhook event received:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach((entry: any) => {
        const changes = entry.changes?.[0];
        const value = changes?.value;
        
        if (value?.messages) {
          const message = value.messages[0];
          console.log('WhatsApp message from:', message.from, 'Text:', message.text?.body);
          // TODO: Process WhatsApp message
          // Implement AI response logic here
        }
      });
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  });

  // Twitter/X Webhook - Verification (GET)
  app.get("/api/webhook/twitter", (req, res) => {
    const crc_token = req.query.crc_token;
    
    if (crc_token) {
      const crypto = require('crypto');
      const consumer_secret = process.env.TWITTER_CONSUMER_SECRET || '';
      
      const hmac = crypto.createHmac('sha256', consumer_secret).update(crc_token as string).digest('base64');
      const response_token = `sha256=${hmac}`;
      
      console.log('✓ Twitter CRC verified');
      res.status(200).json({ response_token });
    } else {
      res.sendStatus(400);
    }
  });

  // Twitter/X Webhook - Receive Events (POST)
  app.post("/api/webhook/twitter", (req, res) => {
    const body = req.body;
    
    console.log('Twitter webhook event received:', JSON.stringify(body, null, 2));
    
    if (body.direct_message_events) {
      body.direct_message_events.forEach((event: any) => {
        console.log('Twitter DM:', event);
        // TODO: Process Twitter message
        // Implement AI response logic here
      });
    }
    
    res.status(200).send('EVENT_RECEIVED');
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
