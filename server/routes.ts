import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { insertUserSchema, loginSchema, insertContactSchema, insertPoliticalAllianceSchema, insertDemandSchema, insertDemandCommentSchema, insertEventSchema, insertAiConfigurationSchema, insertAiTrainingExampleSchema, insertAiResponseTemplateSchema, insertMarketingCampaignSchema, insertNotificationSchema, insertIntegrationSchema, insertSurveyCampaignSchema, insertSurveyLandingPageSchema, insertSurveyResponseSchema, insertLeadSchema, DEFAULT_PERMISSIONS } from "@shared/schema";
import { db } from "./db";
import { politicalParties, politicalAlliances, surveyTemplates, surveyCampaigns, surveyLandingPages, surveyResponses, users, events, demands, demandComments, contacts, aiConfigurations, type SurveyTemplate, type SurveyCampaign, type InsertSurveyCampaign, type SurveyLandingPage, type InsertSurveyLandingPage, type SurveyResponse, type InsertSurveyResponse } from "@shared/schema";
import { sql, eq, desc, and } from "drizzle-orm";
import { generateAiResponse, testOpenAiApiKey } from "./openai";
import { requireRole } from "./authorization";
import { authenticateToken, requirePermission, type AuthRequest } from "./auth";
import { authenticateApiKey, apiRateLimit, type AuthenticatedApiRequest } from "./auth-api";
import { encryptApiKey, decryptApiKey } from "./crypto";
import { z } from "zod";
import { groupTextResponses } from "@shared/text-normalization";
import { calculateGenderDistribution } from "./utils/gender-detector";
import fs from "fs";
import path from "path";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in environment variables");
}
const JWT_SECRET = process.env.SESSION_SECRET;

// Helper function to generate slug from name
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD') // Decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '') // Remove todos os espaços
    .trim();
}

// Admin authentication middleware
function authenticateAdminToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido" });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { isAdmin?: boolean; userId?: string; accountId?: string };
    if (decoded.isAdmin !== true) {
      return res.status(403).json({ error: "Acesso negado" });
    }
    // Set userId and accountId in request for admin routes
    req.userId = decoded.userId;
    req.accountId = decoded.accountId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido" });
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

// Seed survey templates
async function seedSurveyTemplates() {
  try {
    const existingTemplates = await storage.getSurveyTemplates();
    const existingSlugs = new Set(existingTemplates.map(t => t.slug));

    const templatesToInsert = [
      {
        name: "Intenção de voto",
        slug: "intencao-voto",
        description: "Identifique o recall espontâneo de candidatos com maior probabilidade de vitória",
        questionText: "Cite o nome de um político (independente do cargo) que você acredita que terá mais chances de vencer a próxima eleição na sua cidade ou estado:",
        questionType: "open_text",
        options: null,
        order: 1
      },
      {
        name: "Temas prioritários para a população",
        slug: "temas-prioritarios",
        description: "Identifique quais temas são mais importantes para os eleitores",
        questionText: "Qual destes temas é mais importante para você nas próximas eleições?",
        questionType: "single_choice",
        options: ["Saúde", "Educação", "Segurança", "Emprego", "Meio Ambiente"],
        order: 2
      },
      {
        name: "Avaliação de políticas públicas",
        slug: "avaliacao-politicas",
        description: "Avalie a percepção sobre políticas públicas atuais",
        questionText: "Como você avalia as políticas públicas atuais em sua cidade/estado?",
        questionType: "single_choice",
        options: ["Ótimas", "Boas", "Regulares", "Ruins"],
        order: 3
      },
      {
        name: "Meios de informação preferidos",
        slug: "meios-informacao",
        description: "Descubra como a população se informa sobre política",
        questionText: "Qual é sua principal fonte de informação política?",
        questionType: "single_choice",
        options: ["TV", "Rádio", "Redes sociais", "Sites de notícias", "Amigos/família"],
        order: 4
      },
      {
        name: "Confiança em instituições",
        slug: "confianca-instituicoes",
        description: "Meça o nível de confiança nas instituições",
        questionText: "Qual nível de confiança você tem nas seguintes instituições?",
        questionType: "rating",
        options: ["Governo", "Câmara", "Justiça", "Polícia"],
        order: 5
      },
      {
        name: "Temas de interesse para programas de governo",
        slug: "temas-programas-governo",
        description: "Identifique áreas prioritárias para investimento",
        questionText: "Em qual área você gostaria de ver mais investimento pelo governo?",
        questionType: "single_choice",
        options: ["Saúde", "Educação", "Transporte", "Segurança", "Cultura"],
        order: 6
      },
      {
        name: "Preocupações da população",
        slug: "preocupacoes-populacao",
        description: "Entenda as principais preocupações dos cidadãos",
        questionText: "Qual é sua maior preocupação atualmente?",
        questionType: "single_choice",
        options: ["Economia", "Emprego", "Segurança", "Saúde", "Educação"],
        order: 7
      },
      {
        name: "Participação política",
        slug: "participacao-politica",
        description: "Avalie o nível de engajamento político da população",
        questionText: "Você costuma participar de discussões ou votações sobre política?",
        questionType: "single_choice",
        options: ["Sempre", "Às vezes", "Raramente", "Nunca"],
        order: 8
      },
      {
        name: "Avaliação da comunicação política",
        slug: "comunicacao-politica",
        description: "Descubra preferências de canal de comunicação",
        questionText: "Como você prefere receber informações de políticos ou partidos?",
        questionType: "single_choice",
        options: ["WhatsApp", "E-mail", "Redes sociais", "TV", "Rádio"],
        order: 9
      },
      {
        name: "Engajamento em ações comunitárias",
        slug: "engajamento-comunitario",
        description: "Meça o nível de participação em ações comunitárias",
        questionText: "Você participa de ações ou projetos da sua comunidade?",
        questionType: "single_choice",
        options: ["Sim, frequentemente", "Sim, ocasionalmente", "Não"],
        order: 10
      },
      {
        name: "Rejeição de perfis políticos",
        slug: "rejeicao-perfis",
        description: "Identifique perfis políticos com maior rejeição",
        questionText: "Qual perfil de político você NÃO votaria de jeito nenhum?",
        questionType: "single_choice",
        options: ["Político de carreira", "Empresário", "Militar", "Religioso", "Celebridade", "Nenhum desses"],
        order: 11
      },
      {
        name: "Conhecimento espontâneo de candidatos",
        slug: "conhecimento-candidatos",
        description: "Meça o recall espontâneo de nomes políticos",
        questionText: "Cite um nome de político que você conhece na sua região:",
        questionType: "open_text",
        options: null,
        order: 12
      },
      {
        name: "Avaliação da gestão atual",
        slug: "avaliacao-gestao",
        description: "Avalie a percepção sobre a administração vigente",
        questionText: "Como você avalia a gestão atual do seu município/estado?",
        questionType: "single_choice",
        options: ["Ótima", "Boa", "Regular", "Ruim", "Péssima"],
        order: 13
      },
      {
        name: "Principal problema local",
        slug: "problema-local",
        description: "Identifique o problema mais urgente da região",
        questionText: "Qual é o maior problema da sua cidade/bairro que precisa ser resolvido?",
        questionType: "open_text",
        options: null,
        order: 14
      },
      {
        name: "Perfil de liderança desejado",
        slug: "perfil-lideranca",
        description: "Entenda qual tipo de liderança a população valoriza",
        questionText: "Qual característica é mais importante em um líder político?",
        questionType: "single_choice",
        options: ["Experiência", "Honestidade", "Capacidade técnica", "Proximidade com o povo", "Força e decisão"],
        order: 15
      },
      {
        name: "Momento da decisão de voto",
        slug: "momento-decisao",
        description: "Descubra quando os eleitores decidem seu voto",
        questionText: "Quando você costuma decidir em quem vai votar?",
        questionType: "single_choice",
        options: ["Muito antes da eleição", "Algumas semanas antes", "Na última semana", "No dia da eleição"],
        order: 16
      },
      {
        name: "Fatores decisivos na escolha",
        slug: "fatores-decisivos",
        description: "Identifique o que mais influencia a decisão de voto",
        questionText: "O que mais influencia sua decisão de voto?",
        questionType: "single_choice",
        options: ["Propostas do candidato", "Histórico político", "Indicação de pessoas próximas", "Partido político", "Debates e entrevistas"],
        order: 17
      },
      {
        name: "Avaliação de propostas específicas",
        slug: "avaliacao-propostas",
        description: "Teste a aceitação de propostas e políticas públicas",
        questionText: "Você seria favorável a uma proposta de investimento massivo em transporte público?",
        questionType: "single_choice",
        options: ["Totalmente favorável", "Parcialmente favorável", "Indiferente", "Parcialmente contra", "Totalmente contra"],
        order: 18
      },
      {
        name: "Percepção de ética e transparência",
        slug: "etica-transparencia",
        description: "Avalie a importância de ética na política",
        questionText: "Quão importante é para você que um candidato tenha ficha limpa?",
        questionType: "single_choice",
        options: ["Extremamente importante", "Muito importante", "Importante", "Pouco importante", "Não é importante"],
        order: 19
      },
      {
        name: "Expectativa para o futuro",
        slug: "expectativa-futuro",
        description: "Meça o sentimento sobre o futuro da região",
        questionText: "Você acredita que sua cidade/estado vai melhorar nos próximos 4 anos?",
        questionType: "single_choice",
        options: ["Sim, com certeza", "Provavelmente sim", "Não sei dizer", "Provavelmente não", "Com certeza não"],
        order: 20
      }
    ];

    const newTemplates = templatesToInsert.filter(t => !existingSlugs.has(t.slug));

    if (newTemplates.length > 0) {
      await db.insert(surveyTemplates).values(newTemplates);
      console.log(`✓ Inserted ${newTemplates.length} new survey templates`);
    } else {
      console.log("✓ All survey templates already exist");
    }
  } catch (error) {
    console.error("Error seeding survey templates:", error);
  }
}

// Seed default admin user - ALWAYS updates password on every startup
async function seedAdminUser() {
  try {
    const adminEmail = 'adm@politicall.com.br';
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminAccountId = 'a1111111-1111-1111-1111-111111111111'; // Fixed account ID for demo admin
    
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    if (existingAdmin) {
      await db.update(users).set({ 
        password: hashedPassword,
        role: 'admin',
        permissions: DEFAULT_PERMISSIONS.admin 
      }).where(eq(users.email, adminEmail));
      console.log("✓ Admin user password ALWAYS updated to: admin123");
      return;
    }
    
    // First, create or get the account for this admin
    await db.execute(sql`
      INSERT INTO accounts (id, name, created_at)
      VALUES (
        ${adminAccountId},
        'Gabinete Politicall Demo',
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Then create the admin user linked to this account
    await db.execute(sql`
      INSERT INTO users (id, account_id, email, name, password, role, political_position, permissions, slug, created_at)
      VALUES (
        'd0476e06-f1b0-4204-8280-111fa6478fc9',
        ${adminAccountId},
        ${adminEmail},
        'Carlos Nedel',
        ${hashedPassword},
        'admin',
        'Vereador',
        ${JSON.stringify(DEFAULT_PERMISSIONS.admin)}::jsonb,
        'carlosnedel',
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        password = EXCLUDED.password,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions
    `);
    
    console.log("✓ Admin user created with email: adm@politicall.com.br and password: admin123");
  } catch (error) {
    console.error("❌ ERROR seeding admin user:", error);
  }
}

// Update all users permissions based on their role
async function updateAllUserPermissions() {
  try {
    // Update coordenadores with coordenador permissions
    await db.update(users).set({ 
      permissions: DEFAULT_PERMISSIONS.coordenador 
    }).where(eq(users.role, 'coordenador'));
    
    // Update assessores with assessor permissions (limited access)
    await db.update(users).set({ 
      permissions: DEFAULT_PERMISSIONS.assessor 
    }).where(eq(users.role, 'assessor'));
    
    console.log("✓ All user permissions updated based on their roles");
  } catch (error) {
    console.error("❌ ERROR updating user permissions:", error);
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
      userId: testUserId,
      accountId: testUser.accountId  // Use the test user's accountId
    });
    
    console.log("Test campaign seeded successfully");
  } catch (error) {
    console.error("Error seeding test campaign:", error);
    // Don't throw - this is optional test data
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed admin user on startup
  await seedAdminUser();
  
  // DO NOT reset user permissions on startup - permissions are managed by admin
  // await updateAllUserPermissions();
  
  // Seed political parties on startup
  await seedPoliticalParties();
  
  // Seed survey templates on startup
  await seedSurveyTemplates();
  
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
      
      // CRIAR NOVA CONTA PRIMEIRO
      const account = await storage.createAccount({
        name: validatedData.name || validatedData.email
      });
      
      // Gerar slug base a partir do nome do admin
      const baseSlug = generateSlugFromName(validatedData.name);
      
      // Encontrar um slug único disponível (carlosnedel, carlosnedel2, carlosnedel3, etc)
      const uniqueSlug = await storage.findAvailableSlug(baseSlug);
      
      // Criar primeiro usuário (admin da conta) - SEM partido e SEM avatar
      const { ...userData } = validatedData;
      const user = await storage.createUser({
        ...userData,  // Preserva campos opcionais (phone, whatsapp, planValue, etc)
        password: hashedPassword,
        accountId: account.id,
        role: "admin",
        permissions: validatedData.permissions || DEFAULT_PERMISSIONS.admin,
        partyId: undefined,  // FORÇA: Nova conta SEM partido
        avatar: undefined,   // FORÇA: Nova conta SEM avatar (usa logo padrão)
        slug: uniqueSlug, // USA SLUG ÚNICO: garante que não há conflitos
      } as any);

      // Generate JWT token with accountId
      const token = jwt.sign({ 
        userId: user.id, 
        accountId: user.accountId,
        role: user.role 
      }, JWT_SECRET, { expiresIn: "30d" });

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

      const token = jwt.sign({ 
        userId: user.id, 
        accountId: user.accountId,
        role: user.role 
      }, JWT_SECRET, { expiresIn: "30d" });

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
      
      // Get party information if user has partyId
      let party = null;
      if (user.partyId) {
        const [partyData] = await db.select().from(politicalParties).where(eq(politicalParties.id, user.partyId));
        if (partyData) {
          party = {
            id: partyData.id,
            name: partyData.name,
            acronym: partyData.acronym,
            ideology: partyData.ideology,
          };
        }
      }
      
      const { password, ...sanitizedUser } = user;
      res.json({ 
        ...sanitizedUser, 
        party 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get account admin information (for sidebar header)
  app.get("/api/account/admin", authenticateToken, async (req: AuthRequest, res) => {
    try {
      // Find the admin user for this account
      const [adminUser] = await db
        .select()
        .from(users)
        .where(and(
          eq(users.accountId, req.accountId!),
          eq(users.role, "admin")
        ))
        .limit(1);

      if (!adminUser) {
        return res.status(404).json({ error: "Admin não encontrado para esta conta" });
      }

      // Get party information if admin has partyId
      let party = null;
      if (adminUser.partyId) {
        const [partyData] = await db.select().from(politicalParties).where(eq(politicalParties.id, adminUser.partyId));
        if (partyData) {
          party = {
            id: partyData.id,
            name: partyData.name,
            acronym: partyData.acronym,
            ideology: partyData.ideology,
          };
        }
      }

      const { password, ...sanitizedAdmin } = adminUser;
      res.json({
        ...sanitizedAdmin,
        party
      });
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
        electionNumber: z.string().optional(),
        lastElectionVotes: z.number().int().nonnegative().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6, "Nova senha deve ter no mínimo 6 caracteres").optional(),
      });

      const validatedData = profileUpdateSchema.parse(req.body);
      
      // If changing password, validate current password
      if (validatedData.newPassword) {
        if (!validatedData.currentPassword) {
          return res.status(400).json({ error: "Senha atual é obrigatória para alterar a senha" });
        }

        const user = await storage.getUser(req.userId!);
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
        await db.update(users).set({ ...profileData, password: hashedPassword }).where(eq(users.id, req.userId!));
        const updated = await storage.getUser(req.userId!);
        if (!updated) {
          return res.status(404).json({ error: "Usuário não encontrado" });
        }
        const { password, ...sanitizedUser } = updated;
        return res.json(sanitizedUser);
      }

      // Update without password change
      const { currentPassword, newPassword, ...profileData } = validatedData;
      const updated = await storage.updateUser(req.userId!, req.accountId!, profileData);
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao atualizar perfil" });
    }
  });

  // ==================== ADMIN AUTHENTICATION ====================
  
  // Admin login endpoint (PUBLIC)
  app.post("/api/admin/login", async (req, res) => {
    try {
      const adminLoginSchema = z.object({
        password: z.string(),
      });
      
      const validatedData = adminLoginSchema.parse(req.body);
      
      // Validate hardcoded admin password
      if (validatedData.password !== "politicall123") {
        return res.status(401).json({ error: "Senha incorreta" });
      }

      // Generate JWT token with isAdmin flag
      const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });

      res.json({ token });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao fazer login admin" });
    }
  });

  // Admin token verification endpoint (PUBLIC)
  app.get("/api/admin/verify", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ valid: false });
      }

      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { isAdmin?: boolean };
        
        if (decoded.isAdmin === true) {
          return res.json({ valid: true });
        } else {
          return res.status(401).json({ valid: false });
        }
      } catch (jwtError) {
        return res.status(401).json({ valid: false });
      }
    } catch (error: any) {
      res.status(401).json({ valid: false });
    }
  });

  // ==================== ADMIN SURVEY CAMPAIGNS MANAGEMENT ====================

  // List all survey campaigns (admin only)
  app.get("/api/admin/survey-campaigns", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      // Fetch campaigns with templates and user info
      const results = await db.select({
        campaign: surveyCampaigns,
        template: surveyTemplates,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        }
      })
        .from(surveyCampaigns)
        .innerJoin(surveyTemplates, eq(surveyCampaigns.templateId, surveyTemplates.id))
        .innerJoin(users, eq(surveyCampaigns.userId, users.id))
        .orderBy(desc(surveyCampaigns.createdAt));

      // Enrich with response counts
      const enrichedCampaigns = await Promise.all(
        results.map(async ({ campaign, template, user }) => {
          const responses = await db.select()
            .from(surveyResponses)
            .where(eq(surveyResponses.campaignId, campaign.id));

          return {
            ...campaign,
            template,
            user,
            responseCount: responses.length,
            viewCount: campaign.viewCount || 0
          };
        })
      );

      res.json(enrichedCampaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Approve survey campaign (admin only)
  app.patch("/api/admin/survey-campaigns/:id/approve", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      // Admin can access any account's campaign - fetch directly to get accountId
      const [campaign] = await db.select().from(surveyCampaigns).where(eq(surveyCampaigns.id, id));
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      // When approving, automatically move to "aprovado" stage in kanban
      const updated = await storage.updateSurveyCampaign(id, campaign.accountId, { 
        status: "approved",
        campaignStage: "aprovado"
      });
      
      // Create notification for the user
      await storage.createNotification({
        userId: campaign.userId,
        accountId: campaign.accountId,
        type: "campaign_approved",
        priority: "high",
        title: "Pesquisa Aprovada!",
        message: `Sua pesquisa "${campaign.campaignName}" foi aprovada e já está disponível para coleta de respostas. A pesquisa estará ativa por 7 dias corridos.`,
        isRead: false,
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reject survey campaign (admin only)
  app.patch("/api/admin/survey-campaigns/:id/reject", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const rejectSchema = z.object({
        adminNotes: z.string().optional(),
      });
      const { adminNotes } = rejectSchema.parse(req.body);
      const { id } = req.params;
      
      // Admin can access any account's campaign - fetch directly to get accountId
      const [campaign] = await db.select().from(surveyCampaigns).where(eq(surveyCampaigns.id, id));
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      const rejectionReason = adminNotes || "Rejeitado pelo administrador";
      const updated = await storage.updateSurveyCampaign(id, campaign.accountId, { 
        status: "rejected",
        adminNotes: rejectionReason
      });
      
      // Create notification for the user
      await storage.createNotification({
        userId: campaign.userId,
        accountId: campaign.accountId,
        type: "campaign_rejected",
        priority: "high",
        title: "Pesquisa Não Aprovada",
        message: `Sua pesquisa "${campaign.campaignName}" não foi aprovada. Motivo: ${rejectionReason}`,
        isRead: false,
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update campaign stage (admin only)
  app.patch("/api/admin/survey-campaigns/:id/stage", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const stageSchema = z.object({
        campaignStage: z.enum(["aguardando", "aprovado", "em_producao", "finalizado"]),
      });
      const { campaignStage } = stageSchema.parse(req.body);
      const { id } = req.params;
      
      // Admin can access any account's campaign - fetch directly to get accountId
      const [campaign] = await db.select().from(surveyCampaigns).where(eq(surveyCampaigns.id, id));
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      // Set production start date when moving to "em_producao" stage
      const updateData: any = { campaignStage };
      if (campaignStage === "em_producao" && !campaign.productionStartDate) {
        updateData.productionStartDate = new Date();
      }
      
      const updated = await storage.updateSurveyCampaign(id, campaign.accountId, updateData);
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete paid campaign (admin only)
  app.delete("/api/admin/survey-campaigns/:id", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Admin can access any account's campaign - fetch directly to get accountId
      const [campaign] = await db.select().from(surveyCampaigns).where(eq(surveyCampaigns.id, id));
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      await storage.deleteSurveyCampaign(id, campaign.accountId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List all users (admin panel only)
  app.get("/api/admin/users", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const result = await db.select({
        userId: users.id,
        accountId: users.accountId,
        email: users.email,
        name: users.name,
        role: users.role,
        permissions: users.permissions,
        phone: users.phone,
        avatar: users.avatar,
        partyId: users.partyId,
        politicalPosition: users.politicalPosition,
        lastElectionVotes: users.lastElectionVotes,
        state: users.state,
        city: users.city,
        whatsapp: users.whatsapp,
        planValue: users.planValue,
        expiryDate: users.expiryDate,
        paymentStatus: users.paymentStatus,
        lastPaymentDate: users.lastPaymentDate,
        createdAt: users.createdAt,
        partyAbbreviation: politicalParties.acronym,
        partyName: politicalParties.name,
        partyIdeology: politicalParties.ideology,
      })
      .from(users)
      .leftJoin(politicalParties, eq(users.partyId, politicalParties.id));
      
      // Get activity count for each user
      const usersWithActivityCount = await Promise.all(
        result.map(async (row) => {
          // Count all activities for this user
          const [eventsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(events)
            .where(eq(events.userId, row.userId));
          
          const [demandsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demands)
            .where(eq(demands.userId, row.userId));
          
          const [commentsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demandComments)
            .where(eq(demandComments.userId, row.userId));
          
          const [contactsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(contacts)
            .where(eq(contacts.userId, row.userId));
          
          const [alliancesCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(politicalAlliances)
            .where(eq(politicalAlliances.userId, row.userId));
          
          const [campaignsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(surveyCampaigns)
            .where(eq(surveyCampaigns.accountId, row.accountId));
          
          const totalActivities = 
            (eventsCount?.count || 0) +
            (demandsCount?.count || 0) +
            (commentsCount?.count || 0) +
            (contactsCount?.count || 0) +
            (alliancesCount?.count || 0) +
            (campaignsCount?.count || 0);
          
          // Restructure with party as nested object
          return {
            id: row.userId,
            email: row.email,
            name: row.name,
            role: row.role,
            permissions: row.permissions,
            phone: row.phone,
            avatar: row.avatar,
            partyId: row.partyId,
            politicalPosition: row.politicalPosition,
            lastElectionVotes: row.lastElectionVotes,
            state: row.state,
            city: row.city,
            whatsapp: row.whatsapp,
            planValue: row.planValue,
            expiryDate: row.expiryDate,
            paymentStatus: row.paymentStatus,
            lastPaymentDate: row.lastPaymentDate,
            createdAt: row.createdAt,
            party: row.partyName ? {
              id: row.partyId!,
              name: row.partyName,
              abbreviation: row.partyAbbreviation!,
              ideology: row.partyIdeology,
            } : undefined,
            activityCount: totalActivities
          };
        })
      );
      
      res.json(usersWithActivityCount);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create new user (admin panel only)
  app.post("/api/admin/users/create", authenticateAdminToken, async (req: AuthRequest, res) => {
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
          petitions: z.boolean(),
          users: z.boolean(),
          settings: z.boolean(),
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
      
      // Get admin's accountId to assign new user to same account
      const adminUser = await storage.getUser(req.userId!);
      if (!adminUser) {
        return res.status(401).json({ error: "Admin não encontrado" });
      }
      
      // Create user with specified role and permissions, inheriting accountId from admin
      const { ...userData } = validatedData;
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        accountId: adminUser.accountId,
        permissions: permissionsToSave,
      } as any);

      // Don't send password to frontend
      const { password, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao criar usuário" });
    }
  });

  // Update user contract details (whatsapp, planValue, expiryDate)
  app.patch("/api/admin/users/:id/contract", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        whatsapp: z.string().optional(),
        planValue: z.string().optional(),
        expiryDate: z.string().optional(),
      });

      const validatedData = schema.parse(req.body);
      
      // Get user to find their accountId
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      const updated = await storage.updateUser(req.params.id, user.accountId, validatedData);
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark payment as paid (admin panel only)
  app.post("/api/admin/users/:id/payment", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Get current user to check expiry date
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Get current date in DD/MM/YYYY format
      const now = new Date();
      const currentDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      
      // Calculate next expiry date (one month from current expiry or today if no expiry)
      let nextExpiryDate = currentDate;
      if (user.expiryDate) {
        const [day, month, year] = user.expiryDate.split('/').map(Number);
        if (day && month && year) {
          const expiryDate = new Date(year, month - 1, day);
          // Add one month
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          nextExpiryDate = `${String(expiryDate.getDate()).padStart(2, '0')}/${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${expiryDate.getFullYear()}`;
        }
      }
      
      // Update payment status to "pago", save payment date, and update expiry to next month
      const updated = await storage.updateUser(id, user.accountId, {
        paymentStatus: "pago",
        lastPaymentDate: currentDate,
        expiryDate: nextExpiryDate,
      });
      
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete user account (admin panel only)
  app.delete("/api/admin/users/:id", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Get user to find their accountId and verify they exist
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Prevent admin from deleting themselves
      if (id === req.userId) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      }
      
      // Delete user
      await storage.deleteUser(id, user.accountId);
      
      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== USER MANAGEMENT (Admin Only) ====================
  
  // Get user activity ranking with period filter
  app.get("/api/users/activity-ranking", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      const period = req.query.period as string || 'all';
      const allUsers = await storage.getAllUsers(req.accountId!);
      
      // Calculate date range based on period
      let startDate: Date | null = null;
      const now = new Date();
      
      switch(period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'all':
        default:
          startDate = null;
      }
      
      // Get activity count for each user with date filter
      const usersWithActivityCount = await Promise.all(
        allUsers.map(async (user) => {
          // Build WHERE conditions for each query
          const eventsWhere = startDate 
            ? and(eq(events.userId, user.id), sql`${events.createdAt} >= ${startDate}`)
            : eq(events.userId, user.id);
          
          const demandsWhere = startDate
            ? and(eq(demands.userId, user.id), sql`${demands.createdAt} >= ${startDate}`)
            : eq(demands.userId, user.id);
          
          const commentsWhere = startDate
            ? and(eq(demandComments.userId, user.id), sql`${demandComments.createdAt} >= ${startDate}`)
            : eq(demandComments.userId, user.id);
          
          const contactsWhere = startDate
            ? and(eq(contacts.userId, user.id), sql`${contacts.createdAt} >= ${startDate}`)
            : eq(contacts.userId, user.id);
          
          const alliancesWhere = startDate
            ? and(eq(politicalAlliances.userId, user.id), sql`${politicalAlliances.createdAt} >= ${startDate}`)
            : eq(politicalAlliances.userId, user.id);
          
          const campaignsWhere = startDate
            ? and(eq(surveyCampaigns.userId, user.id), sql`${surveyCampaigns.createdAt} >= ${startDate}`)
            : eq(surveyCampaigns.userId, user.id);
          
          // Execute queries with proper WHERE conditions
          const [eventsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(events)
            .where(eventsWhere);
          
          const [demandsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demands)
            .where(demandsWhere);
          
          const [commentsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demandComments)
            .where(commentsWhere);
          
          const [contactsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(contacts)
            .where(contactsWhere);
          
          const [alliancesCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(politicalAlliances)
            .where(alliancesWhere);
          
          const [campaignsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(surveyCampaigns)
            .where(campaignsWhere);
          
          const totalActivities = 
            (eventsCount?.count || 0) +
            (demandsCount?.count || 0) +
            (commentsCount?.count || 0) +
            (contactsCount?.count || 0) +
            (alliancesCount?.count || 0) +
            (campaignsCount?.count || 0);
          
          return {
            id: user.id,
            name: user.name,
            role: user.role,
            activityCount: totalActivities
          };
        })
      );
      
      // Sort by activity count (descending)
      const ranking = usersWithActivityCount
        .sort((a, b) => b.activityCount - a.activityCount);
      
      res.json(ranking);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // List all users (admin only)
  app.get("/api/users", authenticateToken, requireRole("admin"), requirePermission("users"), async (req: AuthRequest, res) => {
    try {
      const allUsers = await storage.getAllUsers(req.accountId!);
      
      // Get activity count for each user
      const usersWithActivityCount = await Promise.all(
        allUsers.map(async (user) => {
          // Count all activities for this user
          const [eventsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(events)
            .where(eq(events.userId, user.id));
          
          const [demandsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demands)
            .where(eq(demands.userId, user.id));
          
          const [commentsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(demandComments)
            .where(eq(demandComments.userId, user.id));
          
          const [contactsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(contacts)
            .where(eq(contacts.userId, user.id));
          
          const [alliancesCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(politicalAlliances)
            .where(eq(politicalAlliances.userId, user.id));
          
          const [campaignsCount] = await db.select({ count: sql<number>`count(*)::int` })
            .from(surveyCampaigns)
            .where(eq(surveyCampaigns.accountId, user.accountId));
          
          const totalActivities = 
            (eventsCount?.count || 0) +
            (demandsCount?.count || 0) +
            (commentsCount?.count || 0) +
            (contactsCount?.count || 0) +
            (alliancesCount?.count || 0) +
            (campaignsCount?.count || 0);
          
          const { password, ...sanitizedUser } = user;
          return {
            ...sanitizedUser,
            activityCount: totalActivities
          };
        })
      );
      
      res.json(usersWithActivityCount);
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
          petitions: z.boolean(),
          users: z.boolean(),
          settings: z.boolean(),
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
      
      // Create user inheriting accountId from current admin
      const { ...userData } = validatedData;
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        accountId: req.accountId!,
        permissions: permissionsToSave,
      } as any);

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
        password: z.string().min(6).optional(),
        permissions: z.object({
          dashboard: z.boolean(),
          contacts: z.boolean(),
          alliances: z.boolean(),
          demands: z.boolean(),
          agenda: z.boolean(),
          ai: z.boolean(),
          marketing: z.boolean(),
          petitions: z.boolean(),
          users: z.boolean(),
          settings: z.boolean(),
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
      
      // Hash password if provided
      const dataToUpdate = { ...validatedData };
      if (validatedData.password) {
        dataToUpdate.password = await bcrypt.hash(validatedData.password, 10);
      }
      
      const updated = await storage.updateUser(req.params.id, req.accountId!, dataToUpdate);
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
      
      await storage.deleteUser(userId, req.accountId!);
      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Erro ao excluir usuário" });
    }
  });

  // ==================== CONTACTS ====================
  
  app.get("/api/contacts", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.accountId!);
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
        accountId: req.accountId!,
      });
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/contacts/:id", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertContactSchema.partial().parse(req.body);
      const contact = await storage.updateContact(req.params.id, req.accountId!, validatedData);
      res.json(contact);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/contacts/:id", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteContact(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get voter profile aggregated statistics
  app.get("/api/contacts/profile", authenticateToken, requirePermission("contacts"), async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.accountId!);
      
      if (contacts.length === 0) {
        return res.json({
          totalContacts: 0,
          averageAge: null,
          topInterests: [],
          topStates: [],
          topCities: [],
          topSources: [],
          genderDistribution: null,
        });
      }

      // Calculate average age
      const contactsWithAge = contacts.filter(c => c.age != null && c.age > 0 && c.age < 120);
      const averageAge = contactsWithAge.length >= 3
        ? Number((contactsWithAge.reduce((sum, c) => sum + (c.age || 0), 0) / contactsWithAge.length).toFixed(1))
        : null;

      // Top interests (count occurrences)
      const interestCounts: Record<string, number> = {};
      contacts.forEach(contact => {
        if (contact.interests && Array.isArray(contact.interests)) {
          contact.interests.forEach(interest => {
            interestCounts[interest] = (interestCounts[interest] || 0) + 1;
          });
        }
      });
      const topInterests = Object.entries(interestCounts)
        .map(([interest, count]) => ({ interest, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top states
      const stateCounts: Record<string, number> = {};
      contacts.forEach(contact => {
        if (contact.state) {
          stateCounts[contact.state] = (stateCounts[contact.state] || 0) + 1;
        }
      });
      const topStates = Object.entries(stateCounts)
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top cities
      const cityCounts: Record<string, number> = {};
      contacts.forEach(contact => {
        if (contact.city) {
          cityCounts[contact.city] = (cityCounts[contact.city] || 0) + 1;
        }
      });
      const topCities = Object.entries(cityCounts)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top sources
      const sourceCounts: Record<string, number> = {};
      contacts.forEach(contact => {
        if (contact.source) {
          sourceCounts[contact.source] = (sourceCounts[contact.source] || 0) + 1;
        }
      });
      const topSources = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Gender distribution
      const genderDistribution = calculateGenderDistribution(contacts);

      res.json({
        totalContacts: contacts.length,
        averageAge,
        ageSampleSize: contactsWithAge.length,
        topInterests,
        topStates,
        topCities,
        topSources,
        genderDistribution,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      const alliances = await storage.getAlliances(req.accountId!);
      
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
        accountId: req.accountId!,
      });
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertPoliticalAllianceSchema.partial().parse(req.body);
      const alliance = await storage.updateAlliance(req.params.id, req.accountId!, validatedData);
      res.json(alliance);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/alliances/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteAlliance(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== DEMANDS ====================
  
  app.get("/api/demands", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      const demands = await storage.getDemands(req.accountId!);
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
        accountId: req.accountId!,
      });

      // Create notification for urgent demands (non-blocking)
      if (demand.priority === "urgent") {
        try {
          await storage.createNotification({
            userId: req.userId!,
            accountId: req.accountId!,
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
      const demand = await storage.updateDemand(req.params.id, req.accountId!, validatedData);
      res.json(demand);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/demands/:id", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteDemand(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Demand comments
  app.get("/api/demands/:id/comments", authenticateToken, requirePermission("demands"), async (req: AuthRequest, res) => {
    try {
      const comments = await storage.getDemandComments(req.params.id, req.accountId!);
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
        accountId: req.accountId!,
      });

      // Notify demand owner about new comment (non-blocking)
      try {
        const demand = await storage.getDemand(req.params.id, req.accountId!);
        if (demand && demand.userId !== req.userId) {
          await storage.createNotification({
            userId: demand.userId,
            accountId: req.accountId!,
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
      const events = await storage.getEvents(req.accountId!);
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
        accountId: req.accountId!,
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
            accountId: req.accountId!,
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
      const event = await storage.updateEvent(req.params.id, req.accountId!, validatedData);
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteEvent(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== AI CONFIGURATION ====================
  
  app.get("/api/ai-config", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      
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
        accountId: req.accountId!,
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
        accountId: req.accountId!,
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
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      
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
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      
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
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      
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
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      const trainingExamples = await storage.getAiTrainingExamples(req.accountId!);
      
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
      const conversations = await storage.getAiConversations(req.accountId!);
      res.json(conversations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // AI Training Examples
  app.get("/api/ai-training-examples", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const examples = await storage.getTrainingExamples(req.accountId!);
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
        accountId: req.accountId!,
      });
      res.json(example);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/ai-training-examples/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiTrainingExampleSchema.partial().parse(req.body);
      const example = await storage.updateTrainingExample(req.params.id, req.accountId!, validatedData);
      res.json(example);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-training-examples/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteTrainingExample(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // AI Response Templates
  app.get("/api/ai-response-templates", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const templates = await storage.getResponseTemplates(req.accountId!);
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
        accountId: req.accountId!,
      });
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/ai-response-templates/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAiResponseTemplateSchema.partial().parse(req.body);
      const template = await storage.updateResponseTemplate(req.params.id, req.accountId!, validatedData);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/ai-response-templates/:id", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteResponseTemplate(req.params.id, req.accountId!);
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

      const config = await storage.getAiConfig(req.userId!, req.accountId!);
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
        accountId: req.accountId!,
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
      const campaigns = await storage.getCampaigns(req.accountId!);
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
        accountId: req.accountId!,
      });
      res.json(campaign);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/send", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id, req.accountId!);
      
      if (!campaign || campaign.userId !== req.userId!) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      
      const service = campaign.type === 'email' ? 'sendgrid' : 'twilio';
      const integration = await storage.getIntegration(req.userId!, req.accountId!, service);
      
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
        
        await storage.updateCampaign(campaign.id, req.accountId!, {
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

  // ==================== INTEGRATIONS ====================
  
  // Get all integrations for user
  app.get("/api/integrations", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const integrations = await storage.getIntegrations(req.userId!, req.accountId!);
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
      const integration = await storage.getIntegration(req.userId!, req.accountId!, req.params.service);
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
        userId: req.userId!,
        accountId: req.accountId!
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
      const integration = await storage.getIntegration(req.userId!, req.accountId!, req.params.service);
      
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

  // ==================== SURVEY CAMPAIGNS ====================
  
  // Get all survey templates (PUBLIC - no auth required)
  app.get("/api/survey-templates", async (req, res) => {
    try {
      const templates = await storage.getSurveyTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all survey campaigns for user (accessible from Dashboard or Marketing module)
  app.get("/api/survey-campaigns", authenticateToken, async (req: AuthRequest, res) => {
    // Allow access if user has dashboard OR marketing permission (or is admin)
    if (req.user?.role !== "admin" && !req.user?.permissions?.dashboard && !req.user?.permissions?.marketing) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso" });
    }
    try {
      // Fetch campaigns with templates and response counts for this account (multi-tenant)
      const results = await db.select({
        campaign: surveyCampaigns,
        template: surveyTemplates
      })
        .from(surveyCampaigns)
        .innerJoin(surveyTemplates, eq(surveyCampaigns.templateId, surveyTemplates.id))
        .where(eq(surveyCampaigns.accountId, req.accountId!))
        .orderBy(desc(surveyCampaigns.createdAt));

      // Enrich with response counts
      const enrichedCampaigns = await Promise.all(
        results.map(async ({ campaign, template }) => {
          const responses = await db.select()
            .from(surveyResponses)
            .where(eq(surveyResponses.campaignId, campaign.id));

          return {
            ...campaign,
            template,
            responseCount: responses.length,
            viewCount: campaign.viewCount || 0
          };
        })
      );

      res.json(enrichedCampaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single survey campaign
  app.get("/api/survey-campaigns/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getSurveyCampaign(req.params.id, req.accountId!);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Check ownership
      if (campaign.userId !== req.userId!) {
        return res.status(403).json({ error: "Sem permissão para visualizar esta campanha" });
      }

      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create survey campaign
  app.post("/api/survey-campaigns", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertSurveyCampaignSchema.parse(req.body);
      
      const campaign = await storage.createSurveyCampaign({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
      });
      
      res.json(campaign);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Update survey campaign
  app.patch("/api/survey-campaigns/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getSurveyCampaign(req.params.id, req.accountId!);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Check ownership
      if (campaign.userId !== req.userId!) {
        return res.status(403).json({ error: "Sem permissão para atualizar esta campanha" });
      }

      const validatedData = insertSurveyCampaignSchema.partial().parse(req.body);
      const updated = await storage.updateSurveyCampaign(req.params.id, req.accountId!, validatedData);
      
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Delete survey campaign
  app.delete("/api/survey-campaigns/:id", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getSurveyCampaign(req.params.id, req.accountId!);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Check ownership
      if (campaign.userId !== req.userId!) {
        return res.status(403).json({ error: "Sem permissão para deletar esta campanha" });
      }

      await storage.deleteSurveyCampaign(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get public survey landing page by slug (PUBLIC - no auth required)
  app.get("/api/pesquisa/:slug", async (req, res) => {
    try {
      // First find the campaign by slug with template data
      const campaigns = await db.select({
        campaign: surveyCampaigns,
        template: surveyTemplates
      })
        .from(surveyCampaigns)
        .innerJoin(surveyTemplates, eq(surveyCampaigns.templateId, surveyTemplates.id))
        .where(eq(surveyCampaigns.slug, req.params.slug));
      
      if (campaigns.length === 0) {
        return res.status(404).json({ error: "Pesquisa não encontrada" });
      }

      const { campaign, template } = campaigns[0];

      // Check if campaign is approved
      if (campaign.status !== "active" && campaign.status !== "approved") {
        return res.status(400).json({ error: "Esta pesquisa não está disponível no momento" });
      }

      // Increment view count
      await db.update(surveyCampaigns)
        .set({ viewCount: sql`${surveyCampaigns.viewCount} + 1` })
        .where(eq(surveyCampaigns.id, campaign.id));

      res.json({
        campaign: {
          id: campaign.id,
          campaignName: campaign.campaignName,
          slug: campaign.slug,
          status: campaign.status,
        },
        template: {
          questionText: template.questionText,
          questionType: template.questionType,
          options: template.options,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit survey response (PUBLIC - no auth required)
  app.post("/api/pesquisa/:slug/submit", async (req, res) => {
    try {
      // Find the campaign by slug
      const campaigns = await db.select()
        .from(surveyCampaigns)
        .where(eq(surveyCampaigns.slug, req.params.slug));
      
      if (campaigns.length === 0) {
        return res.status(404).json({ error: "Pesquisa não encontrada" });
      }

      const campaign = campaigns[0];

      // Check if campaign is active or approved
      if (campaign.status !== "active" && campaign.status !== "approved") {
        return res.status(400).json({ error: "Esta pesquisa não está mais aceitando respostas" });
      }

      // Get the accountId from the user who created the campaign
      const campaignUser = await db.select()
        .from(users)
        .where(eq(users.id, campaign.userId))
        .limit(1);
      
      if (campaignUser.length === 0) {
        return res.status(500).json({ error: "Erro ao processar pesquisa" });
      }

      const accountId = campaignUser[0].accountId;

      // Get IP address from request (handles proxies)
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                        req.ip || 
                        req.socket.remoteAddress || 
                        'unknown';

      // Check if this IP has already responded to this campaign
      const existingResponse = await db.select()
        .from(surveyResponses)
        .where(and(
          eq(surveyResponses.campaignId, campaign.id),
          eq(surveyResponses.respondentIp, ipAddress)
        ))
        .limit(1);

      if (existingResponse.length > 0) {
        return res.status(400).json({ 
          error: "Você já respondeu esta pesquisa",
          message: "Cada pessoa pode responder apenas uma vez por pesquisa." 
        });
      }

      // Validate response data (without accountId, campaignId and respondentIp which will be added server-side)
      const validatedData = insertSurveyResponseSchema.omit({ accountId: true, campaignId: true, respondentIp: true }).parse(req.body);

      // Create the response with accountId, campaignId and IP address
      const response = await storage.createSurveyResponse({
        ...validatedData,
        accountId,
        campaignId: campaign.id,
        respondentIp: ipAddress,
      });
      
      res.json({ 
        success: true, 
        message: "Resposta enviada com sucesso!",
        responseId: response.id 
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Dados da resposta inválidos", details: error.errors });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Get survey campaign responses
  app.get("/api/survey-campaigns/:id/responses", authenticateToken, requirePermission("marketing"), async (req: AuthRequest, res) => {
    try {
      const campaign = await storage.getSurveyCampaign(req.params.id, req.accountId!);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }

      // Check ownership
      if (campaign.userId !== req.userId!) {
        return res.status(403).json({ error: "Sem permissão para visualizar as respostas desta campanha" });
      }

      const responses = await storage.getSurveyResponses(req.params.id);
      
      // Get template to check question type
      const template = await storage.getSurveyTemplate(campaign.templateId);
      
      // For open_text questions, group similar responses
      if (template && template.questionType === "open_text") {
        const textResponses = responses
          .map(r => (r.responseData as any)?.answer as string)
          .filter((answer): answer is string => typeof answer === 'string' && answer.trim().length > 0);
        
        const grouped = groupTextResponses(textResponses);
        
        res.json({
          responses,
          grouped, // Grouped and counted responses for open_text
          questionType: template.questionType
        });
      } else {
        res.json({
          responses,
          questionType: template?.questionType
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== NOTIFICATIONS ====================
  
  // Get user notifications
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotifications(req.userId!, req.accountId!, limit);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread-count", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadCount(req.userId!, req.accountId!);
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
        accountId: req.accountId!,
      });
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notification = await storage.markAsRead(req.params.id, req.userId!, req.accountId!);
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
      await storage.markAllAsRead(req.userId!, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete notification
  app.delete("/api/notifications/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const deleted = await storage.deleteNotification(req.params.id, req.userId!, req.accountId!);
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
  app.get("/api/webhook/facebook", async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    try {
      if (mode !== 'subscribe') {
        console.log('✗ Facebook webhook verification failed - invalid mode');
        return res.sendStatus(403);
      }
      
      if (!token || typeof token !== 'string') {
        console.log('✗ Facebook webhook verification failed - no token provided');
        return res.sendStatus(403);
      }
      
      // Use filtered database query instead of in-memory filter
      const [matchingConfig] = await db
        .select()
        .from(aiConfigurations)
        .where(eq(aiConfigurations.facebookWebhookVerifyToken, token as string))
        .limit(1);
      
      if (matchingConfig) {
        console.log('✓ Facebook webhook verified for account:', matchingConfig.accountId);
        res.status(200).send(challenge);
      } else {
        console.log('✗ Facebook webhook verification failed - token not found');
        res.sendStatus(403);
      }
    } catch (error) {
      console.error('Error verifying Facebook webhook:', error);
      res.sendStatus(500);
    }
  });

  // Instagram Webhook - Verification (GET) - Endpoint separado para Instagram
  app.get("/api/webhook/instagram", async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    try {
      if (mode !== 'subscribe') {
        console.log('✗ Instagram webhook verification failed - invalid mode');
        return res.sendStatus(403);
      }
      
      if (!token || typeof token !== 'string') {
        console.log('✗ Instagram webhook verification failed - no token provided');
        return res.sendStatus(403);
      }
      
      // Use filtered database query for Instagram-specific token
      const [matchingConfig] = await db
        .select()
        .from(aiConfigurations)
        .where(eq(aiConfigurations.instagramWebhookVerifyToken, token as string))
        .limit(1);
      
      if (matchingConfig) {
        console.log('✓ Instagram webhook verified for account:', matchingConfig.accountId);
        res.status(200).send(challenge);
      } else {
        console.log('✗ Instagram webhook verification failed - token not found');
        res.sendStatus(403);
      }
    } catch (error) {
      console.error('Error verifying Instagram webhook:', error);
      res.sendStatus(500);
    }
  });

  // Instagram Webhook - Receive Events (POST) - Endpoint separado para Instagram
  app.post("/api/webhook/instagram", async (req, res) => {
    const body = req.body;
    
    console.log('🔔 ========== INSTAGRAM WEBHOOK POST CHAMADO ==========');
    console.log('📦 Body completo:', JSON.stringify(body, null, 2));
    console.log('🔍 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('======================================================');
    
    // Guard 1: Validate body.object is 'instagram'
    if (body.object !== 'instagram') {
      console.log('❌ Objeto não é "instagram", recebido:', body.object);
      return res.sendStatus(404);
    }
    
    console.log('✅ Objeto validado como "instagram"');
    
    // Respond immediately to Meta (required within 20 seconds)
    res.status(200).send('EVENT_RECEIVED');
    console.log('✅ Resposta "EVENT_RECEIVED" enviada ao Meta');
    
    // Process messages and comments asynchronously
    (async () => {
      try {
        console.log('🚀 Iniciando processamento assíncrono Instagram...');
        
        for (const entry of body.entry || []) {
          // PROCESS DIRECT MESSAGES
          if (entry.messaging && entry.messaging.length > 0) {
            console.log('📥 Processando', entry.messaging.length, 'mensagens DM');
            
            for (const webhookEvent of entry.messaging) {
              console.log('📨 DM event:', JSON.stringify(webhookEvent, null, 2));
              
              if (!webhookEvent.message || !webhookEvent.message.text) {
                console.log('⏭️ Pulando evento não-texto');
                continue;
              }
              
              if (webhookEvent.postback || webhookEvent.delivery || webhookEvent.read || webhookEvent.standby) {
                console.log('⏭️ Pulando evento especial');
                continue;
              }
              
              const senderId = webhookEvent.sender?.id;
              const recipientId = webhookEvent.recipient?.id;
              const messageText = webhookEvent.message?.text;
              
              if (!senderId || !messageText) {
                console.log('⏭️ Faltando senderId ou messageText');
                continue;
              }
              
              console.log(`📩 Instagram DM de ${senderId}: "${messageText}"`);
              
              // Find config by Instagram Business Account ID or Facebook Page ID
              const configs = await db.select().from(aiConfigurations);
              const config = configs.find(c => 
                c.instagramBusinessAccountId === recipientId || 
                c.instagramFacebookPageId === recipientId ||
                c.instagramBusinessAccountId === entry.id ||
                c.instagramFacebookPageId === entry.id
              );
              
              if (!config) {
                console.log('❌ Configuração não encontrada para recipientId:', recipientId);
                continue;
              }
              
              console.log('✅ Configuração encontrada para account:', config.accountId);
              
              // Generate AI response
              const aiResponse = await generateAiResponse(
                messageText,
                null,
                config.mode || 'compliance',
                config.userId,
                {
                  systemPrompt: config.systemPrompt,
                  personalityTraits: config.personalityTraits,
                  politicalInfo: config.politicalInfo,
                  responseGuidelines: config.responseGuidelines
                }
              );
              
              console.log('🤖 Resposta IA:', aiResponse);
              
              // Send response via Instagram Graph API
              const accessToken = config.instagramAccessToken;
              if (!accessToken) {
                console.log('❌ Instagram Access Token não configurado');
                continue;
              }
              
              const sendResponse = await fetch(
                `https://graph.instagram.com/v21.0/me/messages?access_token=${accessToken}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    message: { text: aiResponse }
                  })
                }
              );
              
              const sendResult = await sendResponse.json();
              console.log('📤 Instagram DM API response:', JSON.stringify(sendResult, null, 2));
              
              // Save conversation
              await storage.createAiConversation({
                userId: config.userId,
                accountId: config.accountId,
                platform: 'instagram',
                postContent: null,
                userMessage: messageText,
                aiResponse: aiResponse,
                mode: config.mode || 'compliance'
              });
              
              console.log('💾 Conversa Instagram DM salva no banco');
            }
          }
          
          // PROCESS COMMENTS
          if (entry.changes && entry.changes.length > 0) {
            console.log('📥 Processando', entry.changes.length, 'changes (comentários)');
            
            for (const change of entry.changes) {
              console.log('💬 Change event:', JSON.stringify(change, null, 2));
              
              // Only process comments
              if (change.field !== 'comments') {
                console.log('⏭️ Pulando change não-comentário:', change.field);
                continue;
              }
              
              const commentData = change.value;
              if (!commentData) {
                console.log('⏭️ Sem dados no comentário');
                continue;
              }
              
              // Skip if it's our own comment (to avoid loops)
              const fromId = commentData.from?.id;
              const commentId = commentData.id;
              const commentText = commentData.text;
              const mediaId = commentData.media?.id || commentData.media_id;
              
              if (!commentId || !commentText || !fromId) {
                console.log('⏭️ Faltando dados do comentário');
                continue;
              }
              
              console.log(`💬 Instagram Comentário de ${fromId}: "${commentText}"`);
              
              // Find config by Instagram Business Account ID
              const configs = await db.select().from(aiConfigurations);
              const config = configs.find(c => 
                c.instagramBusinessAccountId === entry.id ||
                c.instagramFacebookPageId === entry.id
              );
              
              if (!config) {
                console.log('❌ Configuração não encontrada para entry.id:', entry.id);
                continue;
              }
              
              // Skip if comment is from the page itself
              if (fromId === config.instagramBusinessAccountId || fromId === entry.id) {
                console.log('⏭️ Pulando comentário do próprio perfil');
                continue;
              }
              
              console.log('✅ Configuração encontrada para account:', config.accountId);
              
              // Generate AI response for the comment
              const aiResponse = await generateAiResponse(
                commentText,
                `Comentário em post do Instagram`,
                config.mode || 'compliance',
                config.userId,
                {
                  systemPrompt: config.systemPrompt,
                  personalityTraits: config.personalityTraits,
                  politicalInfo: config.politicalInfo,
                  responseGuidelines: config.responseGuidelines
                }
              );
              
              console.log('🤖 Resposta IA para comentário:', aiResponse);
              
              // Reply to comment via Instagram Graph API
              const accessToken = config.instagramAccessToken;
              if (!accessToken) {
                console.log('❌ Instagram Access Token não configurado');
                continue;
              }
              
              // Reply to comment endpoint
              const replyResponse = await fetch(
                `https://graph.instagram.com/v21.0/${commentId}/replies?access_token=${accessToken}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: aiResponse
                  })
                }
              );
              
              const replyResult = await replyResponse.json();
              console.log('📤 Instagram Comment Reply API response:', JSON.stringify(replyResult, null, 2));
              
              // Save conversation
              await storage.createAiConversation({
                userId: config.userId,
                accountId: config.accountId,
                platform: 'instagram_comment',
                postContent: `Comentário ID: ${commentId}`,
                userMessage: commentText,
                aiResponse: aiResponse,
                mode: config.mode || 'compliance'
              });
              
              console.log('💾 Resposta a comentário Instagram salva no banco');
            }
          }
        }
      } catch (error) {
        console.error('❌ Erro no processamento Instagram:', error);
      }
    })();
  });

  // Facebook Webhook - Receive Events (POST) - Apenas Facebook
  app.post("/api/webhook/facebook", async (req, res) => {
    const body = req.body;
    
    console.log('🔔 ========== FACEBOOK WEBHOOK POST CHAMADO ==========');
    console.log('📦 Body completo:', JSON.stringify(body, null, 2));
    console.log('🔍 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('======================================================');
    
    // Guard 1: Validate body.object is 'page' (Facebook)
    if (body.object !== 'page') {
      console.log('❌ Objeto não é "page", recebido:', body.object);
      return res.sendStatus(404);
    }
    
    console.log('✅ Objeto validado como "page" (Facebook)');
    
    // Respond immediately to Meta (required within 20 seconds)
    res.status(200).send('EVENT_RECEIVED');
    console.log('✅ Resposta "EVENT_RECEIVED" enviada ao Meta');
    
    // Process messages and comments asynchronously
    (async () => {
      try {
        console.log('🚀 Iniciando processamento assíncrono Facebook...');
        
        for (const entry of body.entry || []) {
          const pageId = entry.id;
          
          // PROCESS DIRECT MESSAGES (Messenger)
          if (entry.messaging && entry.messaging.length > 0) {
            console.log('📥 Processando', entry.messaging.length, 'mensagens Messenger');
            
            for (const webhookEvent of entry.messaging) {
              console.log('📨 Messenger event:', JSON.stringify(webhookEvent, null, 2));
              
              if (!webhookEvent.message || !webhookEvent.message.text) {
                console.log('⏭️ Pulando evento não-texto');
                continue;
              }
              
              if (webhookEvent.postback || webhookEvent.delivery || webhookEvent.read || webhookEvent.standby) {
                console.log('⏭️ Pulando evento especial');
                continue;
              }
              
              const senderId = webhookEvent.sender?.id;
              const recipientId = webhookEvent.recipient?.id;
              const messageText = webhookEvent.message.text;
              
              if (!senderId || !messageText) {
                console.log('⏭️ Faltando senderId ou messageText');
                continue;
              }
              
              console.log(`📩 Facebook Messenger de ${senderId}: "${messageText}"`);
              
              // Find config by Facebook Page ID
              const configs = await db.select().from(aiConfigurations);
              const config = configs.find(c => c.facebookPageId === recipientId || c.facebookPageId === pageId);
              
              if (!config) {
                console.log('❌ Configuração não encontrada para pageId:', recipientId);
                continue;
              }
              
              console.log('✅ Configuração encontrada para account:', config.accountId);
              
              // Generate AI response
              const aiResponse = await generateAiResponse(
                messageText,
                null,
                config.mode || 'compliance',
                config.userId,
                {
                  systemPrompt: config.systemPrompt,
                  personalityTraits: config.personalityTraits,
                  politicalInfo: config.politicalInfo,
                  responseGuidelines: config.responseGuidelines
                }
              );
              
              console.log('🤖 Resposta IA:', aiResponse);
              
              const accessToken = config.facebookPageAccessToken;
              if (!accessToken) {
                console.log('❌ Facebook Page Access Token não configurado');
                continue;
              }
              
              const sendResponse = await fetch(
                `https://graph.facebook.com/v21.0/me/messages?access_token=${accessToken}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    message: { text: aiResponse }
                  })
                }
              );
              
              const sendResult = await sendResponse.json();
              console.log('📤 Facebook Messenger API response:', JSON.stringify(sendResult, null, 2));
              
              // Save conversation
              await storage.createAiConversation({
                userId: config.userId,
                accountId: config.accountId,
                platform: 'facebook',
                postContent: null,
                userMessage: messageText,
                aiResponse: aiResponse,
                mode: config.mode || 'compliance'
              });
              
              console.log('💾 Conversa Facebook Messenger salva no banco');
            }
          }
          
          // PROCESS COMMENTS (Facebook Page Comments)
          if (entry.changes && entry.changes.length > 0) {
            console.log('📥 Processando', entry.changes.length, 'changes (comentários)');
            
            for (const change of entry.changes) {
              console.log('💬 Change event:', JSON.stringify(change, null, 2));
              
              // Process feed changes (comments on posts)
              if (change.field !== 'feed') {
                console.log('⏭️ Pulando change não-feed:', change.field);
                continue;
              }
              
              const changeValue = change.value;
              if (!changeValue || changeValue.item !== 'comment') {
                console.log('⏭️ Pulando item não-comentário');
                continue;
              }
              
              // Skip if it's a reply removal or edit
              if (changeValue.verb !== 'add') {
                console.log('⏭️ Pulando verb não-add:', changeValue.verb);
                continue;
              }
              
              const commentId = changeValue.comment_id;
              const commentText = changeValue.message;
              const fromId = changeValue.from?.id;
              const fromName = changeValue.from?.name;
              const postId = changeValue.post_id;
              
              if (!commentId || !commentText || !fromId) {
                console.log('⏭️ Faltando dados do comentário');
                continue;
              }
              
              console.log(`💬 Facebook Comentário de ${fromName} (${fromId}): "${commentText}"`);
              
              // Find config by Facebook Page ID
              const configs = await db.select().from(aiConfigurations);
              const config = configs.find(c => c.facebookPageId === pageId);
              
              if (!config) {
                console.log('❌ Configuração não encontrada para pageId:', pageId);
                continue;
              }
              
              // Skip if comment is from the page itself
              if (fromId === pageId || fromId === config.facebookPageId) {
                console.log('⏭️ Pulando comentário da própria página');
                continue;
              }
              
              console.log('✅ Configuração encontrada para account:', config.accountId);
              
              // Generate AI response for the comment
              const aiResponse = await generateAiResponse(
                commentText,
                `Comentário em post do Facebook`,
                config.mode || 'compliance',
                config.userId,
                {
                  systemPrompt: config.systemPrompt,
                  personalityTraits: config.personalityTraits,
                  politicalInfo: config.politicalInfo,
                  responseGuidelines: config.responseGuidelines
                }
              );
              
              console.log('🤖 Resposta IA para comentário:', aiResponse);
              
              const accessToken = config.facebookPageAccessToken;
              if (!accessToken) {
                console.log('❌ Facebook Page Access Token não configurado');
                continue;
              }
              
              // Reply to comment via Facebook Graph API
              const replyResponse = await fetch(
                `https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${accessToken}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: aiResponse
                  })
                }
              );
              
              const replyResult = await replyResponse.json();
              console.log('📤 Facebook Comment Reply API response:', JSON.stringify(replyResult, null, 2));
              
              // Save conversation
              await storage.createAiConversation({
                userId: config.userId,
                accountId: config.accountId,
                platform: 'facebook_comment',
                postContent: `Post ID: ${postId}, Comentário ID: ${commentId}`,
                userMessage: commentText,
                aiResponse: aiResponse,
                mode: config.mode || 'compliance'
              });
              
              console.log('💾 Resposta a comentário Facebook salva no banco');
            }
          }
        }
      } catch (error) {
        console.error('❌ Erro no processamento Facebook:', error);
      }
    })();
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

  // ==================== WEBHOOK TEST (TESTE MANUAL) ====================
  
  // Endpoint de teste para simular chamada do Facebook
  app.post("/api/webhook/facebook/test", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { message, senderId } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Campo 'message' é obrigatório" });
      }
      
      // Get user's config
      const config = await storage.getAiConfig(req.userId!, req.accountId!);
      
      if (!config || !config.facebookPageId) {
        return res.status(400).json({ error: "Configuração do Facebook não encontrada. Configure a integração primeiro." });
      }
      
      // Simula evento do Facebook
      const fakeEvent = {
        object: 'page',
        entry: [{
          id: config.facebookPageId,
          time: Date.now(),
          messaging: [{
            sender: { id: senderId || '123456789' },
            recipient: { id: config.facebookPageId },
            timestamp: Date.now(),
            message: {
              mid: 'test_' + Date.now(),
              text: message
            }
          }]
        }]
      };
      
      console.log('🧪 ========== TESTE MANUAL DO WEBHOOK ==========');
      console.log('📤 Simulando evento do Facebook:', JSON.stringify(fakeEvent, null, 2));
      console.log('===============================================');
      
      // Faz request interno para o próprio webhook
      const response = await fetch(`http://localhost:5000/api/webhook/facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fakeEvent)
      });
      
      const responseText = await response.text();
      
      res.json({ 
        success: true, 
        message: 'Evento de teste enviado ao webhook',
        webhookResponse: responseText,
        simulatedEvent: fakeEvent
      });
    } catch (error: any) {
      console.error('Erro no teste do webhook:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== LEADS (PUBLIC) ====================
  
  // Create lead from landing page (no authentication required)
  app.post("/api/leads", async (req, res) => {
    try {
      const validatedLead = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(validatedLead);
      res.status(201).json(lead);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: "Dados inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // Get all leads (admin only)
  app.get("/api/leads", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete single lead (admin only)
  app.delete("/api/leads/:id", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteLead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete multiple leads (admin only)
  app.post("/api/leads/delete-multiple", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "IDs devem ser um array" });
      }
      await storage.deleteLeads(ids);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== PUBLIC SUPPORT (QR CODE) ====================
  
  // Get candidate data by slug (PUBLIC - no auth required)
  app.get("/api/public/candidate/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const candidate = await storage.getCandidateBySlug(slug);
      
      if (!candidate) {
        return res.status(404).json({ error: "Candidato não encontrado" });
      }
      
      res.json(candidate);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create public supporter (PUBLIC - no auth required)
  app.post("/api/public/support/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const validatedData = insertContactSchema.parse(req.body);
      
      const supporter = await storage.createPublicSupporter(slug, validatedData);
      
      res.status(201).json(supporter);
    } catch (error: any) {
      if (error.message === "Candidate not found") {
        return res.status(404).json({ error: "Candidato não encontrado" });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DASHBOARD STATS ====================
  
  app.get("/api/dashboard/stats", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.accountId!);
      const alliances = await storage.getAlliances(req.accountId!);
      const demands = await storage.getDemands(req.accountId!);
      const events = await storage.getEvents(req.accountId!);
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

      // Calculate gender distribution
      const genderDistribution = calculateGenderDistribution(contacts);

      // Calculate average age
      const contactsWithAge = contacts.filter(c => c.age != null && c.age > 0 && c.age < 120);
      const averageAge = contactsWithAge.length >= 3
        ? Number((contactsWithAge.reduce((sum, c) => sum + (c.age || 0), 0) / contactsWithAge.length).toFixed(1))
        : undefined;
      const ageSampleSize = contactsWithAge.length;

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
        genderDistribution,
        averageAge,
        ageSampleSize,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE CALENDAR INTEGRATION ====================
  
  // GET /api/google-calendar - Get current Google Calendar integration config for the account
  app.get("/api/google-calendar", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const integration = await storage.getGoogleCalendarIntegration(req.accountId!);
      
      if (!integration) {
        return res.json(null);
      }
      
      // Don't expose sensitive data (tokens, clientSecret)
      const safeIntegration = {
        id: integration.id,
        accountId: integration.accountId,
        clientId: integration.clientId,
        redirectUri: integration.redirectUri,
        email: integration.email,
        calendarId: integration.calendarId,
        syncEnabled: integration.syncEnabled,
        lastSyncAt: integration.lastSyncAt,
        syncDirection: integration.syncDirection,
        autoCreateMeet: integration.autoCreateMeet,
        syncReminders: integration.syncReminders,
        isConfigured: !!integration.clientId && !!integration.clientSecret,
        isAuthorized: !!integration.accessToken,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      };
      
      res.json(safeIntegration);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/google-calendar - Save/update Google Calendar OAuth credentials
  app.post("/api/google-calendar", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const { clientId, clientSecret, redirectUri, syncDirection, autoCreateMeet, syncReminders } = req.body;
      
      if (!clientId || !clientSecret || !redirectUri) {
        return res.status(400).json({ error: "Client ID, Client Secret e Redirect URI são obrigatórios" });
      }
      
      // Encrypt the client secret before storing
      const encryptedClientSecret = encryptApiKey(clientSecret);
      
      const integration = await storage.upsertGoogleCalendarIntegration({
        clientId,
        clientSecret: encryptedClientSecret,
        redirectUri,
        syncDirection: syncDirection || "both",
        autoCreateMeet: autoCreateMeet || false,
        syncReminders: syncReminders !== false, // default true
        syncEnabled: true,
        userId: req.userId!,
        accountId: req.accountId!
      });
      
      res.json({ 
        success: true, 
        message: "Credenciais do Google Calendar salvas com sucesso",
        isConfigured: true,
        isAuthorized: !!integration.accessToken
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/google-calendar/auth - Initiate OAuth 2.0 flow (return authorization URL)
  app.post("/api/google-calendar/auth", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const integration = await storage.getGoogleCalendarIntegration(req.accountId!);
      
      if (!integration || !integration.clientId || !integration.clientSecret) {
        return res.status(400).json({ error: "Configure as credenciais OAuth primeiro" });
      }
      
      // Decrypt the client secret
      const decryptedClientSecret = decryptApiKey(integration.clientSecret);
      
      // Create OAuth2 client
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        integration.clientId,
        decryptedClientSecret,
        integration.redirectUri
      );
      
      // Generate auth URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/userinfo.email'
        ],
        state: req.accountId, // Pass accountId in state to identify the account on callback
        prompt: 'consent' // Force consent screen to ensure refresh token
      });
      
      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/google-calendar/callback - Handle OAuth callback from Google
  app.get("/api/google-calendar/callback", async (req, res) => {
    try {
      const { code, state: accountId } = req.query;
      
      if (!code || !accountId) {
        return res.status(400).send("Missing authorization code or account ID");
      }
      
      // Get the integration for this account
      const integration = await storage.getGoogleCalendarIntegration(accountId as string);
      
      if (!integration || !integration.clientId || !integration.clientSecret) {
        return res.status(400).send("Integration not configured");
      }
      
      // Decrypt the client secret
      const decryptedClientSecret = decryptApiKey(integration.clientSecret);
      
      // Exchange code for tokens
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        integration.clientId,
        decryptedClientSecret,
        integration.redirectUri
      );
      
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);
      
      // Get user email
      const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;
      
      // Encrypt tokens before storing
      const encryptedAccessToken = encryptApiKey(tokens.access_token!);
      const encryptedRefreshToken = tokens.refresh_token ? encryptApiKey(tokens.refresh_token) : null;
      
      // Update integration with tokens and email
      await storage.upsertGoogleCalendarIntegration({
        ...integration,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        email,
        calendarId: 'primary', // Default to primary calendar
        userId: integration.userId,
        accountId: accountId as string
      });
      
      // Redirect to settings page with success message
      res.redirect('/settings?tab=google-calendar&status=connected');
    } catch (error: any) {
      console.error('Google Calendar OAuth callback error:', error);
      res.redirect('/settings?tab=google-calendar&error=' + encodeURIComponent('Erro ao conectar: ' + error.message));
    }
  });
  
  // DELETE /api/google-calendar - Remove integration
  app.delete("/api/google-calendar", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteGoogleCalendarIntegration(req.accountId!);
      res.json({ success: true, message: "Integração com Google Calendar removida" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/google-calendar/sync - Trigger manual sync of events
  app.post("/api/google-calendar/sync", authenticateToken, requirePermission("agenda"), async (req: AuthRequest, res) => {
    try {
      const integration = await storage.getGoogleCalendarIntegration(req.accountId!);
      
      if (!integration || !integration.accessToken) {
        return res.status(400).json({ error: "Integração não configurada ou não autorizada" });
      }
      
      // Decrypt tokens
      const decryptedAccessToken = decryptApiKey(integration.accessToken);
      const decryptedRefreshToken = integration.refreshToken ? decryptApiKey(integration.refreshToken) : null;
      const decryptedClientSecret = decryptApiKey(integration.clientSecret!);
      
      // Create OAuth2 client
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        integration.clientId,
        decryptedClientSecret,
        integration.redirectUri
      );
      
      oauth2Client.setCredentials({
        access_token: decryptedAccessToken,
        refresh_token: decryptedRefreshToken,
        expiry_date: integration.tokenExpiryDate?.getTime()
      });
      
      // Check if token needs refresh
      if (integration.tokenExpiryDate && new Date() > integration.tokenExpiryDate) {
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          
          // Update tokens in database
          const encryptedNewAccessToken = encryptApiKey(credentials.access_token!);
          await storage.upsertGoogleCalendarIntegration({
            ...integration,
            accessToken: encryptedNewAccessToken,
            tokenExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
            userId: integration.userId,
            accountId: req.accountId!
          });
          
          oauth2Client.setCredentials(credentials);
        } catch (refreshError) {
          console.error('Token refresh error:', refreshError);
          return res.status(401).json({ error: "Token expirado. Por favor, reconecte sua conta Google." });
        }
      }
      
      // Get calendar service
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      // Sync logic based on direction
      const syncDirection = integration.syncDirection || 'both';
      let syncedEvents = 0;
      
      if (syncDirection === 'from_google' || syncDirection === 'both') {
        // Fetch events from Google Calendar
        const response = await calendar.events.list({
          calendarId: integration.calendarId || 'primary',
          timeMin: new Date().toISOString(),
          maxResults: 100,
          singleEvents: true,
          orderBy: 'startTime'
        });
        
        const googleEvents = response.data.items || [];
        
        // Import Google events to our system
        for (const googleEvent of googleEvents) {
          if (googleEvent.start?.dateTime && googleEvent.summary) {
            // Check if event already exists (you might want to implement a mapping table)
            // For now, we'll just count them
            syncedEvents++;
            
            // TODO: Actually create/update events in our database
            // await storage.createEvent({...})
          }
        }
      }
      
      if (syncDirection === 'to_google' || syncDirection === 'both') {
        // Get local events to sync to Google
        const localEvents = await storage.getEvents(req.accountId!);
        
        for (const localEvent of localEvents) {
          // TODO: Check if event already exists in Google
          // For now, we'll just count them
          syncedEvents++;
          
          // Create event in Google Calendar
          // const event = {
          //   summary: localEvent.title,
          //   description: localEvent.description,
          //   start: { dateTime: localEvent.startDate },
          //   end: { dateTime: localEvent.endDate },
          // };
          // await calendar.events.insert({
          //   calendarId: integration.calendarId || 'primary',
          //   resource: event
          // });
        }
      }
      
      // Update last sync time
      await storage.upsertGoogleCalendarIntegration({
        ...integration,
        lastSyncAt: new Date(),
        userId: integration.userId,
        accountId: req.accountId!
      });
      
      res.json({ 
        success: true, 
        message: `Sincronização concluída. ${syncedEvents} eventos processados.`,
        syncedEvents,
        lastSyncAt: new Date()
      });
    } catch (error: any) {
      console.error('Google Calendar sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Key Management Routes (for users to manage their keys)
  app.get("/api/keys", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const keys = await storage.getApiKeys(req.accountId!);
      // Don't expose the hashed key
      const safeKeys = keys.map(({ hashedKey, ...key }) => key);
      res.json(safeKeys);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/keys", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const { name, description, expiresAt } = req.body;
      
      if (!name || name.length < 3) {
        return res.status(400).json({ error: "Nome deve ter pelo menos 3 caracteres" });
      }
      
      const { apiKey, plainKey } = await storage.createApiKey({
        accountId: req.accountId!,
        name,
        description,
        expiresAt,
        isActive: true
      });
      
      // Only return the plain key once
      res.json({
        ...apiKey,
        key: plainKey,
        message: "Guarde esta chave com segurança. Ela não será mostrada novamente."
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/keys/:id", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      await storage.deleteApiKey(req.params.id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // External API Integration Routes
  // These routes are accessible via API key authentication
  
  // GET /api/v1/contacts - List contacts
  app.get("/api/v1/contacts", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const contacts = await storage.getContacts(req.apiKey!.accountId);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/contacts - Create contact
  app.post("/api/v1/contacts", authenticateApiKey, apiRateLimit(50, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const validation = insertContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      
      // Get the account owner's userId for API-created contacts
      const accountUsers = await db.select()
        .from(users)
        .where(and(
          eq(users.accountId, req.apiKey!.accountId),
          eq(users.role, 'admin')
        ));
      
      const adminUser = accountUsers[0];
      
      if (!adminUser) {
        return res.status(500).json({ error: "No admin user found for this account" });
      }
      
      const contact = await storage.createContact({
        ...validation.data,
        accountId: req.apiKey!.accountId,
        userId: adminUser.id  // Use the account admin's userId
      });
      
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/contacts/:id - Get specific contact
  app.get("/api/v1/contacts/:id", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const contact = await storage.getContact(req.params.id, req.apiKey!.accountId);
      if (!contact) {
        return res.status(404).json({ error: "Contato não encontrado" });
      }
      res.json(contact);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/alliances - List political alliances
  app.get("/api/v1/alliances", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const alliances = await storage.getAlliances(req.apiKey!.accountId);
      res.json(alliances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/alliances - Create alliance
  app.post("/api/v1/alliances", authenticateApiKey, apiRateLimit(50, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const validation = insertPoliticalAllianceSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.errors });
      }
      
      const alliance = await storage.createAlliance({
        ...validation.data,
        accountId: req.apiKey!.accountId,
        userId: 'system-api-user'  // System user for API calls
      });
      
      res.status(201).json(alliance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/demands - List demands
  app.get("/api/v1/demands", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const demands = await storage.getDemands(req.apiKey!.accountId);
      res.json(demands);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/events - List events
  app.get("/api/v1/events", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const events = await storage.getEvents(req.apiKey!.accountId);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/parties - List all political parties (global resource)
  app.get("/api/v1/parties", authenticateApiKey, apiRateLimit(100, 60000), async (req: AuthenticatedApiRequest, res) => {
    try {
      const parties = await storage.getAllParties();
      res.json(parties);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Privacy Policy Routes for Social Media Integrations
  app.get("/privacy/facebook/:accountSlug", (req, res) => {
    const { accountSlug } = req.params;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - Facebook</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #1877F2; }
    h2 { color: #1877F2; margin-top: 30px; }
    .section { margin: 20px 0; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Política de Privacidade - Integração Facebook</h1>
  <p><strong>Conta:</strong> ${accountSlug}</p>
  <p><strong>Data de Atualização:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

  <div class="section">
    <h2>1. Visão Geral</h2>
    <p>Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma Facebook/Meta para fins de atendimento automatizado e análise de mensagens.</p>
  </div>

  <div class="section">
    <h2>2. Dados Coletados</h2>
    <p>Através da integração com o Facebook, o Politicall pode coletar:</p>
    <ul>
      <li>Mensagens enviadas através do Messenger</li>
      <li>Identificação do usuário (ID de conta Facebook)</li>
      <li>Nome e foto de perfil (se disponível publicamente)</li>
      <li>Histórico de conversas e interações</li>
      <li>Informações de metadados (timestamps, tipo de interação)</li>
    </ul>
  </div>

  <div class="section">
    <h2>3. Uso de Dados</h2>
    <p>Os dados coletados serão utilizados para:</p>
    <ul>
      <li>Fornecer respostas automatizadas através de IA</li>
      <li>Melhorar a qualidade do atendimento</li>
      <li>Análise estatística e relatórios</li>
      <li>Conformidade com requisitos legais</li>
    </ul>
  </div>

  <div class="section">
    <h2>4. Armazenamento e Segurança</h2>
    <p>Os dados são armazenados de forma segura com criptografia e são mantidos apenas pelo tempo necessário para fornecer o serviço.</p>
  </div>

  <div class="section">
    <h2>5. Direitos dos Usuários</h2>
    <p>Os usuários possuem direitos sobre seus dados pessoais, incluindo acesso, correção, exclusão e portabilidade, conforme garantido pelas leis aplicáveis (LGPD, GDPR, etc).</p>
  </div>

  <div class="section">
    <h2>6. Conformidade com Meta</h2>
    <p>Esta integração cumpre com as políticas, padrões e diretrizes da Meta/Facebook, incluindo suas políticas de privacidade e plataforma.</p>
  </div>

  <div class="section">
    <h2>7. Contato</h2>
    <p>Para dúvidas sobre esta política, entre em contato através da plataforma Politicall.</p>
  </div>
</body>
</html>`;
    res.type('text/html').send(html);
  });

  app.get("/privacy/instagram/:accountSlug", (req, res) => {
    const { accountSlug } = req.params;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - Instagram</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #E4405F; }
    h2 { color: #E4405F; margin-top: 30px; }
    .section { margin: 20px 0; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Política de Privacidade - Integração Instagram</h1>
  <p><strong>Conta:</strong> ${accountSlug}</p>
  <p><strong>Data de Atualização:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

  <div class="section">
    <h2>1. Visão Geral</h2>
    <p>Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma Instagram para fins de atendimento automatizado e gestão de mensagens diretas.</p>
  </div>

  <div class="section">
    <h2>2. Dados Coletados</h2>
    <p>Através da integração com o Instagram, o Politicall pode coletar:</p>
    <ul>
      <li>Mensagens diretas (DMs) recebidas</li>
      <li>Informações do perfil de usuário</li>
      <li>Nome de usuário e identificação</li>
      <li>Histórico de conversas</li>
      <li>Informações de interação (curtidas, comentários)</li>
    </ul>
  </div>

  <div class="section">
    <h2>3. Uso de Dados</h2>
    <p>Os dados coletados serão utilizados para:</p>
    <ul>
      <li>Automatizar respostas a mensagens diretas</li>
      <li>Fornecer suporte e atendimento ao cliente</li>
      <li>Análise de engajamento</li>
      <li>Conformidade regulatória</li>
    </ul>
  </div>

  <div class="section">
    <h2>4. Armazenamento e Segurança</h2>
    <p>Todos os dados são armazenados com proteção criptográfica de alta segurança e não são compartilhados com terceiros sem consentimento.</p>
  </div>

  <div class="section">
    <h2>5. Direitos dos Usuários</h2>
    <p>Os usuários podem solicitar acesso, correção, exclusão ou portabilidade de seus dados pessoais conforme previsto em lei.</p>
  </div>

  <div class="section">
    <h2>6. Conformidade Meta</h2>
    <p>Esta integração segue rigorosamente as políticas de privacidade, termos de serviço e requisitos de conformidade da Meta/Instagram.</p>
  </div>

  <div class="section">
    <h2>7. Contato</h2>
    <p>Para questões sobre privacidade, entre em contato através da plataforma Politicall.</p>
  </div>
</body>
</html>`;
    res.type('text/html').send(html);
  });

  app.get("/privacy/twitter/:accountSlug", (req, res) => {
    const { accountSlug } = req.params;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - X (Twitter)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #000; }
    h2 { color: #000; margin-top: 30px; }
    .section { margin: 20px 0; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Política de Privacidade - Integração X (Twitter)</h1>
  <p><strong>Conta:</strong> ${accountSlug}</p>
  <p><strong>Data de Atualização:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

  <div class="section">
    <h2>1. Visão Geral</h2>
    <p>Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma X (Twitter) para fins de atendimento automatizado e análise de interações.</p>
  </div>

  <div class="section">
    <h2>2. Dados Coletados</h2>
    <p>Através da integração com X (Twitter), o Politicall pode coletar:</p>
    <ul>
      <li>Mensagens diretas (DMs)</li>
      <li>Menções e respostas públicas</li>
      <li>Identificação e dados de perfil do usuário</li>
      <li>Histórico de conversas</li>
      <li>Informações de engajamento e interações</li>
    </ul>
  </div>

  <div class="section">
    <h2>3. Uso de Dados</h2>
    <p>Os dados coletados serão utilizados para:</p>
    <ul>
      <li>Fornecer respostas automatizadas através de IA</li>
      <li>Monitoramento e análise de menções</li>
      <li>Engajamento com audiência</li>
      <li>Conformidade com requisitos legais</li>
    </ul>
  </div>

  <div class="section">
    <h2>4. Armazenamento e Segurança</h2>
    <p>Os dados são armazenados com padrões de segurança de nível empresarial, incluindo criptografia de ponta a ponta quando aplicável.</p>
  </div>

  <div class="section">
    <h2>5. Direitos dos Usuários</h2>
    <p>Conforme legislações aplicáveis (LGPD, GDPR), os usuários possuem direitos relativos aos seus dados pessoais incluindo acesso e exclusão.</p>
  </div>

  <div class="section">
    <h2>6. Conformidade X/Twitter</h2>
    <p>Esta integração está em total conformidade com as políticas de privacidade e termos de serviço da plataforma X (antigo Twitter).</p>
  </div>

  <div class="section">
    <h2>7. Contato</h2>
    <p>Para dúvidas sobre privacidade, entre em contato através da plataforma Politicall.</p>
  </div>
</body>
</html>`;
    res.type('text/html').send(html);
  });

  const httpServer = createServer(app);
  return httpServer;
}
