/**
 * ============================================================================
 * POLITICALL - Plataforma de Gestão Política
 * ============================================================================
 * 
 * Desenvolvido por: David Flores Andrade
 * Website: www.politicall.com.br
 * 
 * Todos os direitos reservados © 2024-2025
 * ============================================================================
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import { google } from "googleapis";
import crypto from "crypto";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { insertUserSchema, loginSchema, insertContactSchema, insertPoliticalAllianceSchema, insertAllianceInviteSchema, insertDemandSchema, insertDemandCommentSchema, insertEventSchema, insertAiConfigurationSchema, insertAiTrainingExampleSchema, insertAiResponseTemplateSchema, insertMarketingCampaignSchema, insertNotificationSchema, insertIntegrationSchema, insertSurveyCampaignSchema, insertSurveyLandingPageSchema, insertSurveyResponseSchema, insertLeadSchema, DEFAULT_PERMISSIONS } from "@shared/schema";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});
import { db } from "./db";
import { accounts, politicalParties, politicalAlliances, surveyTemplates, surveyCampaigns, surveyLandingPages, surveyResponses, users, events, demands, demandComments, contacts, aiConfigurations, type SurveyTemplate, type SurveyCampaign, type InsertSurveyCampaign, type SurveyLandingPage, type InsertSurveyLandingPage, type SurveyResponse, type InsertSurveyResponse } from "@shared/schema";
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
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Admin master password management
const ADMIN_CONFIG_FILE = path.join(process.cwd(), '.admin-config.json');
const DEFAULT_ADMIN_PASSWORD = "politicall123";

// Get admin password hash (creates default if not exists)
async function getAdminPasswordHash(): Promise<string> {
  try {
    if (fs.existsSync(ADMIN_CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf-8'));
      if (config.passwordHash) {
        return config.passwordHash;
      }
    }
    // Create default config with hashed password
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify({ passwordHash: hash }));
    return hash;
  } catch {
    // Fallback to hashing default password on each request
    return bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  }
}

// Update admin password hash
async function updateAdminPasswordHash(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 10);
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify({ passwordHash: hash }));
}

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in environment variables");
}
const JWT_SECRET = process.env.SESSION_SECRET;

// Cache para evitar processamento duplicado de mensagens (Facebook/Instagram)
const processedMessagesCache = new Set<string>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function isMessageProcessed(messageId: string): boolean {
  return processedMessagesCache.has(messageId);
}

function markMessageAsProcessed(messageId: string): void {
  processedMessagesCache.add(messageId);
  // Limpar após TTL
  setTimeout(() => {
    processedMessagesCache.delete(messageId);
  }, CACHE_TTL_MS);
}

// Limpar cache periodicamente (evitar memory leak)
setInterval(() => {
  if (processedMessagesCache.size > 1000) {
    processedMessagesCache.clear();
    console.log('🧹 Cache de mensagens limpo');
  }
}, 10 * 60 * 1000); // A cada 10 minutos

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
    
    // Ensure custom template exists with fixed ID for "Personalizado" option
    await db.execute(sql`
      INSERT INTO survey_templates (id, name, slug, description, question_text, question_type, options, "order", created_at)
      VALUES ('custom-template', 'Personalizado', 'personalizado', 'Crie sua própria pergunta personalizada', 'Sua pergunta personalizada aqui', 'open_text', NULL, 0, NOW())
      ON CONFLICT (id) DO NOTHING
    `);
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
      // ONLY update password - PRESERVE existing permissions set by Admin Master
      await db.update(users).set({ 
        password: hashedPassword
        // DO NOT reset role or permissions - they are managed by Admin Master
      }).where(eq(users.email, adminEmail));
      console.log("✓ Admin user password ALWAYS updated to: admin123 (permissions preserved)");
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
      let user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Auto-generate volunteer code if user is a volunteer and doesn't have one
      if (user.role === 'voluntario' && !user.volunteerCode) {
        const volunteerCode = await storage.generateUniqueVolunteerCode();
        user = await storage.updateUser(user.id, user.accountId, { volunteerCode });
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
        landingBackground: z.string().optional(),
        partyId: z.string().optional(),
        politicalPosition: z.string().optional(),
        electionNumber: z.string().optional(),
        lastElectionVotes: z.number().int().nonnegative().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6, "Nova senha deve ter no mínimo 6 caracteres").optional(),
        skipPasswordCheck: z.boolean().optional(),
      });

      const validatedData = profileUpdateSchema.parse(req.body);
      
      // Check if admin master is impersonating (verify admin token in header)
      let isAdminImpersonating = false;
      const adminToken = req.headers['x-admin-token'] as string;
      if (adminToken && validatedData.skipPasswordCheck) {
        try {
          const decoded = jwt.verify(adminToken, JWT_SECRET) as { isAdmin?: boolean };
          if (decoded.isAdmin) {
            isAdminImpersonating = true;
          }
        } catch (e) {
          // Invalid admin token, ignore
        }
      }
      
      // If changing password, validate current password (unless admin master is impersonating)
      if (validatedData.newPassword) {
        if (!isAdminImpersonating && !validatedData.currentPassword) {
          return res.status(400).json({ error: "Senha atual é obrigatória para alterar a senha" });
        }

        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(404).json({ error: "Usuário não encontrado" });
        }

        // Only validate current password if not admin impersonating
        if (!isAdminImpersonating) {
          const isPasswordValid = await bcrypt.compare(validatedData.currentPassword!, user.password);
          if (!isPasswordValid) {
            return res.status(400).json({ error: "Senha atual incorreta" });
          }
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(validatedData.newPassword, 10);
        const { currentPassword, newPassword, skipPasswordCheck, ...profileData } = validatedData;
        await db.update(users).set({ ...profileData, password: hashedPassword }).where(eq(users.id, req.userId!));
        const updated = await storage.getUser(req.userId!);
        if (!updated) {
          return res.status(404).json({ error: "Usuário não encontrado" });
        }
        const { password, ...sanitizedUser } = updated;
        return res.json(sanitizedUser);
      }

      // Update without password change
      const { currentPassword, newPassword, skipPasswordCheck, ...profileData } = validatedData;
      const updated = await storage.updateUser(req.userId!, req.accountId!, profileData);
      const { password, ...sanitizedUser } = updated;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao atualizar perfil" });
    }
  });

  // Validate account admin password (for export authorization)
  app.post("/api/auth/validate-admin-password", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const validateSchema = z.object({
        password: z.string().min(1, "Senha é obrigatória"),
      });
      
      const validatedData = validateSchema.parse(req.body);
      
      // Find the admin of this account
      const adminUser = await storage.getAccountAdmin(req.accountId!);
      
      if (!adminUser) {
        return res.status(404).json({ error: "Admin da conta não encontrado" });
      }
      
      // Validate password against admin's password
      const isValid = await bcrypt.compare(validatedData.password, adminUser.password);
      
      if (!isValid) {
        return res.status(401).json({ error: "Senha incorreta" });
      }
      
      res.json({ valid: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao validar senha" });
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
      
      // Get stored password hash and verify
      const passwordHash = await getAdminPasswordHash();
      const isValid = await bcrypt.compare(validatedData.password, passwordHash);
      
      if (!isValid) {
        return res.status(401).json({ error: "Senha incorreta" });
      }

      // Generate JWT token with isAdmin flag
      const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });

      res.json({ token });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao fazer login admin" });
    }
  });

  // Admin change password endpoint (PROTECTED)
  app.post("/api/admin/change-password", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const changePasswordSchema = z.object({
        newPassword: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      });
      
      const validatedData = changePasswordSchema.parse(req.body);
      
      // Update admin password
      await updateAdminPasswordHash(validatedData.newPassword);
      
      res.json({ success: true, message: "Senha alterada com sucesso" });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao alterar senha" });
    }
  });

  // Platform Manual PDF Download (PROTECTED)
  app.get("/api/admin/platform-manual", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const PdfPrinter = require('pdfmake');

      // Use Roboto fonts from local fonts folder
      const fontsDir = path.join(process.cwd(), 'server/fonts');
      const fonts = {
        Roboto: {
          normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
          bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
          italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
          bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf')
        }
      };

      const printer = new PdfPrinter(fonts);

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          font: 'Roboto',
          fontSize: 11,
          lineHeight: 1.4
        },
        styles: {
          header: { fontSize: 28, bold: true, alignment: 'center', margin: [0, 0, 0, 20], color: '#40E0D0' },
          subheader: { fontSize: 18, bold: true, margin: [0, 20, 0, 10], color: '#333' },
          moduleTitle: { fontSize: 16, bold: true, margin: [0, 15, 0, 8], color: '#40E0D0' },
          sectionTitle: { fontSize: 13, bold: true, margin: [0, 10, 0, 5], color: '#555' },
          paragraph: { fontSize: 11, margin: [0, 0, 0, 8], alignment: 'justify' },
          listItem: { fontSize: 11, margin: [10, 2, 0, 2] },
          footer: { fontSize: 9, alignment: 'center', color: '#888', margin: [0, 20, 0, 0] },
          tip: { fontSize: 10, italics: true, color: '#666', margin: [15, 5, 15, 5], fillColor: '#f5f5f5' },
          warning: { fontSize: 10, bold: true, color: '#d32f2f', margin: [15, 5, 15, 5] }
        },
        content: [
          { text: 'MANUAL COMPLETO', style: 'header' },
          { text: 'Plataforma Politicall', style: 'subheader', alignment: 'center' },
          { text: 'Sistema de Gestão Política Integrada', alignment: 'center', margin: [0, 0, 0, 10] },
          { text: `Versão 2.0 - ${new Date().toLocaleDateString('pt-BR')}`, alignment: 'center', fontSize: 10, color: '#888', margin: [0, 0, 0, 30] },
          
          { text: 'Bem-vindo ao Politicall!', style: 'subheader' },
          { text: 'O Politicall é uma plataforma completa de gestão política desenvolvida para gabinetes parlamentares, candidatos e equipes políticas. Este manual irá guiá-lo através de todas as funcionalidades disponíveis na plataforma.', style: 'paragraph' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '1. DASHBOARD - VISÃO GERAL', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'O Dashboard é sua central de comando, oferecendo uma visão consolidada de todas as atividades do gabinete.', style: 'paragraph' },
          
          { text: '1.1 Métricas Principais', style: 'sectionTitle' },
          { ul: [
            'Total de Contatos: Número total de cidadãos cadastrados no CRM',
            'Demandas Abertas: Quantidade de solicitações pendentes de resolução',
            'Eventos do Mês: Agenda de compromissos para o período',
            'Campanhas Ativas: Número de ações de marketing em andamento',
            'Pesquisas em Curso: Pesquisas de opinião ativas'
          ], style: 'listItem' },
          
          { text: '1.2 Gráficos e Análises', style: 'sectionTitle' },
          { text: 'O Dashboard apresenta gráficos interativos que mostram:', style: 'paragraph' },
          { ul: [
            'Evolução do número de contatos ao longo do tempo',
            'Distribuição de demandas por categoria e status',
            'Mapa de calor com localização geográfica dos apoiadores',
            'Taxa de resolução de demandas',
            'Engajamento nas campanhas de marketing'
          ], style: 'listItem' },
          
          { text: '1.3 Acesso Rápido', style: 'sectionTitle' },
          { text: 'Utilize os cards de atalho para navegar rapidamente entre os módulos mais utilizados. Os widgets são personalizáveis de acordo com suas preferências.', style: 'paragraph' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '2. CRM / CONTATOS', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'O módulo de Contatos é o coração do Politicall, permitindo gerenciar todos os cidadãos, apoiadores e eleitores.', style: 'paragraph' },
          
          { text: '2.1 Cadastro de Contatos', style: 'sectionTitle' },
          { text: 'Para adicionar um novo contato:', style: 'paragraph' },
          { ol: [
            'Clique no botão "Novo Contato" no canto superior direito',
            'Preencha os dados pessoais: Nome, CPF, Data de Nascimento, Gênero',
            'Adicione informações de contato: Telefone, WhatsApp, E-mail',
            'Informe o endereço completo: CEP, Rua, Número, Bairro, Cidade, Estado',
            'Selecione a categoria do contato: Apoiador, Eleitor, Liderança, etc.',
            'Adicione tags para facilitar a segmentação',
            'Clique em "Salvar" para confirmar'
          ], style: 'listItem' },
          
          { text: '2.2 Campos Disponíveis', style: 'sectionTitle' },
          { ul: [
            'Dados Pessoais: Nome completo, CPF, RG, Data de nascimento, Gênero',
            'Contato: Telefone fixo, Celular/WhatsApp, E-mail, Redes sociais',
            'Endereço: CEP (preenchimento automático), Logradouro, Número, Complemento, Bairro, Cidade, Estado',
            'Político: Zona eleitoral, Seção, Partido, Cargo pretendido',
            'Classificação: Categoria, Tags, Nível de engajamento, Origem do cadastro',
            'Observações: Campo livre para anotações importantes'
          ], style: 'listItem' },
          
          { text: '2.3 Busca e Filtros', style: 'sectionTitle' },
          { text: 'Utilize a barra de pesquisa para encontrar contatos por nome, telefone, e-mail ou qualquer outro campo. Os filtros avançados permitem segmentar por:', style: 'paragraph' },
          { ul: [
            'Cidade ou bairro específico',
            'Categoria de contato',
            'Tags atribuídas',
            'Data de cadastro',
            'Origem do contato'
          ], style: 'listItem' },
          
          { text: '2.4 Exportação de Dados', style: 'sectionTitle' },
          { text: 'Para exportar contatos:', style: 'paragraph' },
          { ol: [
            'Aplique os filtros desejados (opcional)',
            'Clique no botão "Exportar"',
            'Selecione o formato: Excel (.xlsx) ou CSV',
            'Escolha os campos a serem exportados',
            'O download será iniciado automaticamente'
          ], style: 'listItem' },
          
          { text: '2.5 Importação em Massa', style: 'sectionTitle' },
          { text: 'Para importar contatos de uma planilha:', style: 'paragraph' },
          { ol: [
            'Baixe o modelo de importação clicando em "Baixar Modelo"',
            'Preencha a planilha com os dados dos contatos',
            'Clique em "Importar" e selecione o arquivo',
            'Revise os dados na tela de preview',
            'Confirme a importação'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '3. ALIANÇAS POLÍTICAS', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Gerencie suas alianças partidárias e convites para colaboração política.', style: 'paragraph' },
          
          { text: '3.1 Visão Geral das Alianças', style: 'sectionTitle' },
          { text: 'O painel de Alianças mostra todas as parcerias políticas ativas, pendentes e encerradas. Cada aliança exibe:', style: 'paragraph' },
          { ul: [
            'Partido aliado e sua sigla',
            'Data de início da aliança',
            'Status atual (Ativa, Pendente, Encerrada)',
            'Nível de colaboração',
            'Histórico de atividades conjuntas'
          ], style: 'listItem' },
          
          { text: '3.2 Criar Nova Aliança', style: 'sectionTitle' },
          { ol: [
            'Acesse o módulo "Alianças Políticas"',
            'Clique em "Nova Aliança"',
            'Selecione o partido da lista',
            'Defina o tipo de aliança: Eleitoral, Parlamentar ou Institucional',
            'Adicione observações sobre os termos acordados',
            'Envie o convite para o representante do partido'
          ], style: 'listItem' },
          
          { text: '3.3 Gerenciamento de Convites', style: 'sectionTitle' },
          { text: 'Os convites de aliança funcionam da seguinte forma:', style: 'paragraph' },
          { ul: [
            'Convites Enviados: Aguardando resposta do partido convidado',
            'Convites Recebidos: Propostas de outros partidos para aliança',
            'Aceitar ou Recusar: Utilize os botões de ação em cada convite',
            'Notificações: Receba alertas sobre mudanças no status dos convites'
          ], style: 'listItem' },
          
          { text: '3.4 Distribuição Ideológica', style: 'sectionTitle' },
          { text: 'O gráfico de pizza mostra a distribuição ideológica das suas alianças, categorizadas em: Esquerda, Centro-Esquerda, Centro, Centro-Direita e Direita.', style: 'paragraph' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '4. DEMANDAS', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Sistema completo para gerenciar solicitações de cidadãos, desde o registro até a resolução.', style: 'paragraph' },
          
          { text: '4.1 Tipos de Demandas', style: 'sectionTitle' },
          { ul: [
            'Infraestrutura: Problemas com ruas, iluminação, saneamento',
            'Saúde: Solicitações de medicamentos, consultas, internações',
            'Educação: Vagas em escolas, bolsas de estudo, transporte escolar',
            'Assistência Social: Benefícios, cestas básicas, moradia',
            'Emprego: Indicações, cursos profissionalizantes',
            'Segurança: Policiamento, iluminação, câmeras',
            'Outros: Demandas diversas não categorizadas'
          ], style: 'listItem' },
          
          { text: '4.2 Fluxo de Status', style: 'sectionTitle' },
          { text: 'Cada demanda passa pelos seguintes status:', style: 'paragraph' },
          { ol: [
            'NOVA: Demanda recém-cadastrada, aguardando triagem',
            'EM ANÁLISE: Demanda está sendo avaliada pela equipe',
            'EM ANDAMENTO: Providências estão sendo tomadas',
            'AGUARDANDO: Aguardando ação externa ou documento',
            'RESOLVIDA: Demanda atendida com sucesso',
            'CANCELADA: Demanda cancelada pelo solicitante ou gabinete'
          ], style: 'listItem' },
          
          { text: '4.3 Cadastrar Nova Demanda', style: 'sectionTitle' },
          { ol: [
            'Clique em "Nova Demanda"',
            'Vincule a um contato existente ou cadastre um novo',
            'Selecione a categoria da demanda',
            'Defina a prioridade: Baixa, Normal, Alta ou Urgente',
            'Descreva detalhadamente a solicitação',
            'Anexe documentos relevantes (fotos, ofícios, etc.)',
            'Atribua a um membro da equipe (opcional)',
            'Salve a demanda'
          ], style: 'listItem' },
          
          { text: '4.4 Sistema de Comentários', style: 'sectionTitle' },
          { text: 'Cada demanda possui um histórico de comentários onde a equipe pode:', style: 'paragraph' },
          { ul: [
            'Registrar todas as ações tomadas',
            'Adicionar observações e atualizações',
            'Anexar documentos de acompanhamento',
            'Mencionar outros membros da equipe',
            'Marcar comentários como internos (não visíveis ao cidadão)'
          ], style: 'listItem' },
          
          { text: '4.5 Prioridades e Prazos', style: 'sectionTitle' },
          { ul: [
            'URGENTE (Vermelho): Prazo de 24 horas para primeira resposta',
            'ALTA (Laranja): Prazo de 3 dias úteis',
            'NORMAL (Azul): Prazo de 7 dias úteis',
            'BAIXA (Verde): Prazo de 15 dias úteis'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '5. AGENDA / EVENTOS', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Gerencie todos os compromissos do gabinete com calendário integrado.', style: 'paragraph' },
          
          { text: '5.1 Visualizações Disponíveis', style: 'sectionTitle' },
          { ul: [
            'Lista: Todos os eventos em formato de lista cronológica',
            'Calendário Mensal: Visão do mês completo com eventos destacados',
            'Calendário Semanal: Detalhamento da semana com horários',
            'Timeline: Visualização em linha do tempo'
          ], style: 'listItem' },
          
          { text: '5.2 Criar Novo Evento', style: 'sectionTitle' },
          { ol: [
            'Clique em "Novo Evento" ou diretamente no calendário',
            'Defina título e descrição do evento',
            'Selecione data e horário de início e término',
            'Escolha a categoria: Reunião, Audiência, Visita, Evento Público, etc.',
            'Adicione localização (endereço ou link de videoconferência)',
            'Convide participantes (membros da equipe)',
            'Configure lembretes automáticos',
            'Defina se é evento recorrente'
          ], style: 'listItem' },
          
          { text: '5.3 Eventos Recorrentes', style: 'sectionTitle' },
          { text: 'Para eventos que se repetem regularmente:', style: 'paragraph' },
          { ul: [
            'Diário: Todo dia no mesmo horário',
            'Semanal: Mesmo dia da semana (ex: toda segunda-feira)',
            'Quinzenal: A cada duas semanas',
            'Mensal: Mesmo dia do mês',
            'Personalizado: Defina sua própria regra de recorrência'
          ], style: 'listItem' },
          
          { text: '5.4 Integração com Google Calendar', style: 'sectionTitle' },
          { text: 'Sincronize seus eventos com o Google Calendar:', style: 'paragraph' },
          { ol: [
            'Acesse Configurações > Integrações',
            'Clique em "Conectar Google Calendar"',
            'Autorize o acesso à sua conta Google',
            'Selecione qual calendário sincronizar',
            'Os eventos serão sincronizados automaticamente'
          ], style: 'listItem' },
          
          { text: '5.5 Lembretes e Notificações', style: 'sectionTitle' },
          { ul: [
            'Notificação 1 dia antes do evento',
            'Notificação 1 hora antes do evento',
            'Notificação 15 minutos antes do evento',
            'E-mail de lembrete (configurável)',
            'Notificação push no navegador'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '6. CAMPANHAS DE MARKETING', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Crie e gerencie campanhas de comunicação com seus contatos.', style: 'paragraph' },
          
          { text: '6.1 Tipos de Campanhas', style: 'sectionTitle' },
          { ul: [
            'E-mail Marketing: Envio de e-mails em massa',
            'WhatsApp: Mensagens via WhatsApp Business API',
            'SMS: Mensagens de texto para celular',
            'Redes Sociais: Publicações agendadas'
          ], style: 'listItem' },
          
          { text: '6.2 Criar Nova Campanha', style: 'sectionTitle' },
          { ol: [
            'Clique em "Nova Campanha"',
            'Escolha o tipo de campanha',
            'Defina o nome e objetivo da campanha',
            'Selecione os destinatários (por tags, categorias ou lista personalizada)',
            'Crie ou selecione um template de mensagem',
            'Personalize o conteúdo com variáveis dinâmicas',
            'Agende a data e horário de envio',
            'Revise e confirme'
          ], style: 'listItem' },
          
          { text: '6.3 Status das Campanhas', style: 'sectionTitle' },
          { ul: [
            'RASCUNHO: Campanha em criação',
            'PENDENTE APROVAÇÃO: Aguardando aprovação do Admin Master',
            'APROVADA: Campanha aprovada e agendada',
            'EM EXECUÇÃO: Campanha sendo enviada',
            'CONCLUÍDA: Campanha finalizada',
            'PAUSADA: Campanha pausada temporariamente',
            'REJEITADA: Campanha não aprovada (com justificativa)'
          ], style: 'listItem' },
          
          { text: '6.4 Fluxo de Aprovação', style: 'sectionTitle' },
          { text: 'As campanhas de marketing passam por aprovação do Admin Master:', style: 'paragraph' },
          { ol: [
            'Usuário cria e envia campanha para aprovação',
            'Admin Master recebe notificação',
            'Admin avalia conteúdo e destinatários',
            'Admin aprova ou rejeita (com justificativa)',
            'Usuário recebe notificação do resultado'
          ], style: 'listItem' },
          
          { text: '6.5 Relatórios de Campanha', style: 'sectionTitle' },
          { text: 'Após a execução, analise os resultados:', style: 'paragraph' },
          { ul: [
            'Taxa de entrega',
            'Taxa de abertura (e-mails)',
            'Taxa de cliques',
            'Erros de envio',
            'Lista de bounces (e-mails inválidos)'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '7. PESQUISAS DE OPINIÃO', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Crie pesquisas para conhecer a opinião dos eleitores sobre diversos temas.', style: 'paragraph' },
          
          { text: '7.1 Templates de Pesquisa', style: 'sectionTitle' },
          { text: 'O Politicall oferece templates prontos:', style: 'paragraph' },
          { ul: [
            'Intenção de Voto: Recall espontâneo de candidatos',
            'Temas Prioritários: O que importa para o eleitor',
            'Avaliação de Gestão: Nota para administração atual',
            'Problemas Locais: Principais demandas da região',
            'Perfil de Liderança: Características desejadas',
            'Personalizado: Crie sua própria pergunta'
          ], style: 'listItem' },
          
          { text: '7.2 Tipos de Perguntas', style: 'sectionTitle' },
          { ul: [
            'Resposta Aberta: Texto livre',
            'Escolha Única: Selecionar uma opção',
            'Múltipla Escolha: Selecionar várias opções',
            'Escala de Avaliação: Notas de 1 a 5 ou 1 a 10',
            'Sim/Não: Resposta binária'
          ], style: 'listItem' },
          
          { text: '7.3 Landing Pages de Pesquisa', style: 'sectionTitle' },
          { text: 'Cada pesquisa gera uma página pública personalizada:', style: 'paragraph' },
          { ul: [
            'URL única e compartilhável',
            'Design responsivo (funciona em celular)',
            'Coleta de dados demográficos',
            'Prevenção de respostas duplicadas por IP',
            'Página de agradecimento personalizada'
          ], style: 'listItem' },
          
          { text: '7.4 Criar Nova Pesquisa', style: 'sectionTitle' },
          { ol: [
            'Acesse o módulo "Pesquisas"',
            'Clique em "Nova Pesquisa"',
            'Escolha um template ou crie do zero',
            'Configure o texto da pergunta',
            'Defina as opções de resposta (se aplicável)',
            'Personalize a landing page',
            'Publique e compartilhe o link'
          ], style: 'listItem' },
          
          { text: '7.5 Análise de Resultados', style: 'sectionTitle' },
          { text: 'Visualize os resultados em tempo real:', style: 'paragraph' },
          { ul: [
            'Gráficos de distribuição de respostas',
            'Nuvem de palavras para respostas abertas',
            'Filtros por cidade, gênero, idade',
            'Exportação de dados para Excel',
            'Relatório PDF automático'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '8. ATENDIMENTO IA', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Configure inteligência artificial para responder automaticamente nas redes sociais.', style: 'paragraph' },
          
          { text: '8.1 Plataformas Suportadas', style: 'sectionTitle' },
          { ul: [
            'Facebook Messenger: Mensagens diretas e comentários',
            'Instagram Direct: Mensagens privadas',
            'WhatsApp Business: Integração via API oficial'
          ], style: 'listItem' },
          
          { text: '8.2 Configuração Inicial', style: 'sectionTitle' },
          { ol: [
            'Acesse o módulo "Atendimento IA"',
            'Selecione a plataforma desejada',
            'Clique em "Conectar" e autorize o acesso',
            'Configure o perfil da IA (tom de voz, informações)',
            'Defina horários de funcionamento',
            'Ative o atendimento automático'
          ], style: 'listItem' },
          
          { text: '8.3 Personalização da IA', style: 'sectionTitle' },
          { text: 'Configure o comportamento da IA:', style: 'paragraph' },
          { ul: [
            'Nome do Político: Como a IA deve se referir',
            'Cargo: Vereador, Deputado, Senador, etc.',
            'Tom de Voz: Formal, Informal, Técnico',
            'Informações do Gabinete: Endereço, telefone, horários',
            'Temas Prioritários: Saúde, educação, segurança, etc.',
            'Modo TSE: Ativar durante período eleitoral'
          ], style: 'listItem' },
          
          { text: '8.4 Exemplos de Treinamento', style: 'sectionTitle' },
          { text: 'Ensine a IA a responder corretamente:', style: 'paragraph' },
          { ol: [
            'Acesse "Exemplos de Treinamento"',
            'Clique em "Adicionar Exemplo"',
            'Digite uma pergunta comum',
            'Escreva a resposta ideal',
            'Salve e a IA aprenderá o padrão'
          ], style: 'listItem' },
          
          { text: '8.5 Monitoramento de Conversas', style: 'sectionTitle' },
          { text: 'Acompanhe todas as interações em tempo real:', style: 'paragraph' },
          { ul: [
            'Histórico completo de conversas',
            'Filtro por plataforma e data',
            'Intervenção manual quando necessário',
            'Relatórios de atendimento',
            'Métricas de satisfação'
          ], style: 'listItem' },
          
          { text: '8.6 Modo TSE (Período Eleitoral)', style: 'sectionTitle' },
          { text: 'Durante o período eleitoral, ative o Modo TSE para:', style: 'paragraph' },
          { ul: [
            'Evitar pedidos explícitos de voto',
            'Não fazer promessas de campanha',
            'Responder de forma neutra e informativa',
            'Cumprir as regras da legislação eleitoral'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '9. INTEGRAÇÕES', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Conecte o Politicall com outros serviços e ferramentas.', style: 'paragraph' },
          
          { text: '9.1 Integrações Disponíveis', style: 'sectionTitle' },
          { ul: [
            'WhatsApp Business API: Envio de mensagens automatizadas',
            'Facebook: Gerenciamento de página e Messenger',
            'Instagram: Direct Messages e comentários',
            'Google Calendar: Sincronização de agenda',
            'SendGrid: Envio de e-mails',
            'Twilio: SMS e voz'
          ], style: 'listItem' },
          
          { text: '9.2 API Externa', style: 'sectionTitle' },
          { text: 'O Politicall oferece uma API REST para integrações customizadas:', style: 'paragraph' },
          { ul: [
            'Autenticação via API Key',
            'Endpoints para leitura e criação de contatos',
            'Endpoints para gerenciamento de demandas',
            'Webhooks para notificações em tempo real',
            'Rate limiting de 100 requisições por minuto',
            'Documentação completa disponível'
          ], style: 'listItem' },
          
          { text: '9.3 Gerenciar API Keys', style: 'sectionTitle' },
          { ol: [
            'Acesse Configurações > Integrações > API',
            'Clique em "Gerar Nova Chave"',
            'Defina um nome para identificação',
            'Copie a chave gerada (exibida apenas uma vez)',
            'Use a chave no header Authorization: Bearer {API_KEY}'
          ], style: 'listItem' },
          
          { text: '9.4 Webhooks', style: 'sectionTitle' },
          { text: 'Configure webhooks para receber notificações:', style: 'paragraph' },
          { ul: [
            'Novo contato cadastrado',
            'Nova demanda criada',
            'Status de demanda alterado',
            'Nova resposta de pesquisa',
            'Evento criado ou atualizado'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '10. USUÁRIOS E PERMISSÕES', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Gerencie sua equipe com controle granular de acesso.', style: 'paragraph' },
          
          { text: '10.1 Papéis de Usuário', style: 'sectionTitle' },
          { ul: [
            'ADMIN: Acesso total ao sistema, pode gerenciar outros usuários',
            'COORDENADOR: Acesso amplo, pode gerenciar demandas e contatos',
            'ASSESSOR: Acesso limitado, focado em atendimento e cadastro'
          ], style: 'listItem' },
          
          { text: '10.2 Permissões por Módulo', style: 'sectionTitle' },
          { text: 'Cada papel tem permissões específicas:', style: 'paragraph' },
          { ul: [
            'Dashboard: Visualizar métricas e gráficos',
            'Contatos: Criar, editar, excluir, exportar',
            'Demandas: Criar, editar, atribuir, resolver',
            'Agenda: Criar, editar, excluir eventos',
            'Marketing: Criar campanhas, enviar para aprovação',
            'Pesquisas: Criar, publicar, visualizar resultados',
            'IA: Configurar, treinar, monitorar',
            'Usuários: Criar, editar, gerenciar permissões',
            'Configurações: Alterar configurações do gabinete'
          ], style: 'listItem' },
          
          { text: '10.3 Convidar Novo Usuário', style: 'sectionTitle' },
          { ol: [
            'Acesse Usuários > Equipe',
            'Clique em "Convidar Usuário"',
            'Preencha nome e e-mail',
            'Selecione o papel (Admin, Coordenador ou Assessor)',
            'Personalize as permissões se necessário',
            'O usuário receberá um e-mail de convite'
          ], style: 'listItem' },
          
          { text: '10.4 Gerenciar Permissões', style: 'sectionTitle' },
          { text: 'Para alterar permissões de um usuário:', style: 'paragraph' },
          { ol: [
            'Acesse Usuários > Equipe',
            'Clique no usuário desejado',
            'Vá para a aba "Permissões"',
            'Marque ou desmarque as permissões desejadas',
            'Salve as alterações'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: '11. CONFIGURAÇÕES', style: 'moduleTitle', pageBreak: 'before' },
          { text: 'Personalize o sistema de acordo com suas necessidades.', style: 'paragraph' },
          
          { text: '11.1 Perfil do Político', style: 'sectionTitle' },
          { ul: [
            'Nome completo e nome de urna',
            'Cargo atual e partido',
            'Foto de perfil e banner',
            'Biografia e histórico político',
            'Redes sociais'
          ], style: 'listItem' },
          
          { text: '11.2 Dados do Gabinete', style: 'sectionTitle' },
          { ul: [
            'Nome oficial do gabinete',
            'Endereço completo',
            'Telefones de contato',
            'E-mail oficial',
            'Horário de funcionamento'
          ], style: 'listItem' },
          
          { text: '11.3 Preferências do Sistema', style: 'sectionTitle' },
          { ul: [
            'Tema: Claro ou Escuro',
            'Idioma: Português Brasil',
            'Fuso horário',
            'Formato de data e hora',
            'Notificações por e-mail',
            'Notificações push'
          ], style: 'listItem' },
          
          { text: '11.4 Segurança', style: 'sectionTitle' },
          { ul: [
            'Alterar senha',
            'Autenticação de dois fatores (2FA)',
            'Histórico de acessos',
            'Dispositivos conectados',
            'Sessões ativas'
          ], style: 'listItem' },
          
          { text: '11.5 Conta e Assinatura', style: 'sectionTitle' },
          { ul: [
            'Plano atual e recursos',
            'Data de renovação',
            'Histórico de pagamentos',
            'Dados de faturamento',
            'Upgrade de plano'
          ], style: 'listItem' },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: 'SUPORTE TÉCNICO', style: 'subheader', pageBreak: 'before' },
          { text: 'Precisa de ajuda? Entre em contato conosco:', style: 'paragraph' },
          { ul: [
            'E-mail: suporte@politicall.com.br',
            'WhatsApp: (XX) XXXXX-XXXX',
            'Central de Ajuda: help.politicall.com.br'
          ], style: 'listItem', margin: [0, 0, 0, 20] },
          
          { text: '═══════════════════════════════════════════════════════════', alignment: 'center', color: '#40E0D0', margin: [0, 20, 0, 20] },
          
          { text: 'POLITICALL', alignment: 'center', fontSize: 16, bold: true, color: '#40E0D0' },
          { text: 'Sistema de Gestão Política Integrada', alignment: 'center', fontSize: 11, margin: [0, 5, 0, 5] },
          { text: 'www.politicall.com.br', alignment: 'center', fontSize: 10, color: '#40E0D0' },
          { text: '© 2024-2025 Politicall. Todos os direitos reservados.', alignment: 'center', fontSize: 9, color: '#888', margin: [0, 10, 0, 0] },
          { text: 'Desenvolvido por David Flores Andrade', alignment: 'center', fontSize: 9, color: '#888' }
        ],
        footer: function(currentPage: number, pageCount: number) {
          return {
            columns: [
              { text: 'Manual Politicall', alignment: 'left', fontSize: 8, color: '#888', margin: [40, 0, 0, 0] },
              { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', fontSize: 8, color: '#888', margin: [0, 0, 40, 0] }
            ],
            margin: [0, 0, 0, 20]
          };
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="Manual-Politicall.pdf"');
      
      pdfDoc.pipe(res);
      pdfDoc.end();
      
    } catch (error: any) {
      console.error('Erro ao gerar PDF do manual:', error);
      res.status(500).json({ error: 'Erro ao gerar o manual em PDF' });
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
        role: z.enum(["admin", "coordenador", "assessor", "voluntario"]),
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
      
      // Generate volunteer code if creating a volunteer
      let volunteerCode: string | undefined;
      if (validatedData.role === 'voluntario') {
        volunteerCode = await storage.generateUniqueVolunteerCode();
      }
      
      // Create user with specified role and permissions, inheriting accountId from admin
      const { ...userData } = validatedData;
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        accountId: adminUser.accountId,
        permissions: permissionsToSave,
        volunteerCode,
      } as any);

      // Don't send password to frontend
      const { password, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Erro ao criar usuário" });
    }
  });

  // Update user contract details (whatsapp, planValue, expiryDate, permissions)
  app.patch("/api/admin/users/:id/contract", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        whatsapp: z.string().optional(),
        planValue: z.string().optional(),
        expiryDate: z.string().optional(),
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

  // Impersonate user (admin master enters as another admin without password)
  app.post("/api/admin/users/:id/impersonate", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Get target user
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      
      // Only allow impersonating admin users (gabinete admins)
      if (user.role !== "admin") {
        return res.status(400).json({ error: "Só é possível entrar em contas de administradores de gabinete" });
      }
      
      // Generate JWT token for the target user
      const token = jwt.sign({ 
        userId: user.id, 
        accountId: user.accountId,
        role: user.role 
      }, JWT_SECRET, { expiresIn: "30d" });
      
      const { password, ...sanitizedUser } = user;
      
      res.json({
        token,
        user: sanitizedUser,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ==================== SYSTEM SYNC (Admin Master Only) ====================
  
  // Import system sync service dynamically to avoid circular dependencies
  const { executeSystemSync, validateSyncConfig, getSyncConfig } = await import("./services/systemSync");
  
  // Validate sync configuration
  app.get("/api/admin/system-sync/validate", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const validation = validateSyncConfig();
      res.json(validation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Execute system sync
  app.post("/api/admin/system-sync", authenticateAdminToken, async (req: AuthRequest, res) => {
    try {
      const { targetUrl, apiKey } = req.body;
      
      // Validar campos obrigatórios
      if (!targetUrl || !apiKey) {
        return res.status(400).json({ 
          error: "URL do servidor destino e chave de API são obrigatórios" 
        });
      }
      
      // Validar formato da URL
      try {
        new URL(targetUrl);
      } catch {
        return res.status(400).json({ 
          error: "URL do servidor destino inválida" 
        });
      }
      
      const config = {
        targetUrl,
        apiKey,
        includeCode: true,
        includeDatabaseDump: true,
      };
      
      const result = await executeSystemSync(config);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
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
            avatar: user.avatar,
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
        role: z.enum(["admin", "coordenador", "assessor", "voluntario"]),
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
      
      // Generate volunteer code if creating a volunteer
      let volunteerCode: string | undefined;
      if (validatedData.role === 'voluntario') {
        volunteerCode = await storage.generateUniqueVolunteerCode();
      }
      
      // Create user inheriting accountId from current admin
      const { ...userData } = validatedData;
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
        accountId: req.accountId!,
        permissions: permissionsToSave,
        volunteerCode,
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
        role: z.enum(["admin", "coordenador", "assessor", "voluntario"]).optional(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        avatar: z.string().nullable().optional(),
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
      const dataToUpdate: any = { ...validatedData };
      if (validatedData.password) {
        dataToUpdate.password = await bcrypt.hash(validatedData.password, 10);
      }
      
      // Generate volunteer code if changing role to volunteer and user doesn't have one
      if (validatedData.role === 'voluntario' && !currentUser.volunteerCode) {
        dataToUpdate.volunteerCode = await storage.generateUniqueVolunteerCode();
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
      // Get current user to check role
      const currentUser = await storage.getUser(req.userId!);
      
      // Volunteers only see contacts they registered themselves
      if (currentUser?.role === "voluntario") {
        const contacts = await storage.getContactsByUser(req.accountId!, req.userId!);
        return res.json(contacts);
      }
      
      // All other roles see all contacts
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

  // Parse PDF file and extract contact data
  app.post("/api/contacts/parse-pdf", authenticateToken, requirePermission("contacts"), upload.single('file'), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: "O arquivo deve ser um PDF" });
      }

      // Parse PDF using pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(req.file.buffer) });
      const pdf = await loadingTask.promise;
      
      const allLines: string[] = [];
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Group items by their Y position to reconstruct lines
        const itemsByY: Map<number, string[]> = new Map();
        
        for (const item of textContent.items) {
          if ('str' in item && (item as any).str.trim()) {
            const y = Math.round((item as any).transform[5]);
            if (!itemsByY.has(y)) {
              itemsByY.set(y, []);
            }
            itemsByY.get(y)!.push((item as any).str);
          }
        }
        
        // Sort by Y (descending - top to bottom) and join items
        const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);
        for (const y of sortedYs) {
          const lineText = itemsByY.get(y)!.join('\t');
          if (lineText.trim()) {
            allLines.push(lineText);
          }
        }
      }

      if (allLines.length < 2) {
        return res.status(400).json({ error: "O PDF não contém dados suficientes para importação" });
      }

      // Parse each line - split by tabs or multiple spaces
      const data = allLines.map(line => {
        if (line.includes('\t')) {
          return line.split('\t').map(v => v.trim()).filter(v => v);
        }
        return line.split(/\s{2,}/).map(v => v.trim()).filter(v => v);
      }).filter(row => row.length > 0);

      if (data.length < 2) {
        return res.status(400).json({ error: "Não foi possível extrair dados tabulares do PDF" });
      }

      res.json({ data });
    } catch (error: any) {
      console.error('Erro ao processar PDF:', error);
      res.status(500).json({ error: "Erro ao processar o PDF. Verifique se o arquivo não está corrompido." });
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

  // ==================== ALLIANCE INVITES ====================

  app.get("/api/alliance-invites", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const invites = await storage.getAllianceInvites(req.accountId!);
      res.json(invites);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertAllianceInviteSchema.parse(req.body);
      const token = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const invite = await storage.createAllianceInvite({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
        token,
      });
      
      res.json(invite);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/alliance-invites/:token/public", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const invite = await storage.getAllianceInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ error: "Convite não encontrado" });
      }
      
      if (invite.status === 'expired') {
        return res.status(410).json({ error: "Convite expirado" });
      }
      
      if (invite.status === 'accepted') {
        return res.status(410).json({ error: "Convite já foi aceito" });
      }

      const inviter = await storage.getUser(invite.userId);
      const party = await db.select().from(politicalParties).where(eq(politicalParties.id, invite.partyId));
      
      // Get account and admin info for personalization
      const [account] = await db.select().from(accounts).where(eq(accounts.id, invite.accountId));
      const admin = await storage.getAccountAdmin(invite.accountId);
      
      res.json({
        invite: {
          id: invite.id,
          status: invite.status,
          inviteeEmail: invite.inviteeEmail,
          inviteePhone: invite.inviteePhone,
          createdAt: invite.createdAt,
        },
        inviter: inviter ? {
          name: inviter.name,
          avatar: inviter.avatar,
          politicalPosition: inviter.politicalPosition,
          city: inviter.city,
          state: inviter.state,
        } : null,
        party: party.length > 0 ? {
          id: party[0].id,
          name: party[0].name,
          acronym: party[0].acronym,
          ideology: party[0].ideology,
        } : null,
        account: account ? {
          name: account.name,
        } : null,
        admin: admin ? {
          name: admin.name,
          avatar: admin.avatar,
          politicalPosition: admin.politicalPosition,
          city: admin.city,
          state: admin.state,
        } : null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites/:token/accept", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { inviteeName, inviteeEmail, inviteePhone, inviteePosition, inviteeState, inviteeCity, inviteeNotes } = req.body;
      
      if (!inviteeName || inviteeName.trim().length < 2) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }
      
      const updatedInvite = await storage.acceptAllianceInvite(token, {
        inviteeName: inviteeName.trim(),
        inviteeEmail: inviteeEmail?.trim() || undefined,
        inviteePhone: inviteePhone?.trim() || undefined,
        inviteePosition: inviteePosition?.trim() || undefined,
        inviteeState: inviteeState?.trim() || undefined,
        inviteeCity: inviteeCity?.trim() || undefined,
        inviteeNotes: inviteeNotes?.trim() || undefined,
      });
      
      res.json({ success: true, invite: updatedInvite });
    } catch (error: any) {
      if (error.message === 'Convite não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Convite já foi aceito' || error.message === 'Convite expirado') {
        return res.status(410).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/alliance-invites/:token/reject", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const updatedInvite = await storage.rejectAllianceInvite(token);
      res.json({ success: true, invite: updatedInvite });
    } catch (error: any) {
      if (error.message === 'Convite não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      if (error.message === 'Convite já foi aceito' || error.message === 'Convite já foi rejeitado') {
        return res.status(410).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/alliance-invites/:id", authenticateToken, requirePermission("alliances"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAllianceInvite(id, req.accountId!);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === 'Convite não encontrado ou acesso negado') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: error.message });
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

  // Toggle automation for platforms
  app.patch("/api/ai-config/automation", authenticateToken, requirePermission("ai"), async (req: AuthRequest, res) => {
    try {
      const { platform, enabled } = req.body;
      
      if (!platform || !['facebook', 'instagram'].includes(platform)) {
        return res.status(400).json({ error: "Plataforma inválida" });
      }

      const updateData: any = {
        userId: req.userId!,
        accountId: req.accountId!,
      };

      if (platform === 'facebook') {
        updateData.facebookAutomationEnabled = enabled;
      } else if (platform === 'instagram') {
        updateData.instagramAutomationEnabled = enabled;
      }

      const config = await storage.upsertAiConfig(updateData);
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
      
      // Auto-approve campaigns with "free" distribution type (Divulgação Livre)
      const isAutoApproved = validatedData.distributionType === "free";
      
      const campaign = await storage.createSurveyCampaign({
        ...validatedData,
        userId: req.userId!,
        accountId: req.accountId!,
        // Auto-approve free campaigns, keep under_review for google_ads
        status: isAutoApproved ? "approved" : "under_review",
        campaignStage: isAutoApproved ? "aprovado" : "aguardando",
        // Set start/end dates for auto-approved campaigns (7 days)
        startDate: isAutoApproved ? new Date() : validatedData.startDate,
        endDate: isAutoApproved ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : validatedData.endDate,
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
          customMainQuestion: campaign.customMainQuestion,
          customMainQuestionType: campaign.customMainQuestionType,
          customMainQuestionOptions: campaign.customMainQuestionOptions,
          customQuestions: campaign.customQuestions,
          demographicFields: campaign.demographicFields,
          customDemographicFields: campaign.customDemographicFields,
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
              
              // Check if Instagram automation is enabled
              if (!config.instagramAutomationEnabled) {
                console.log('⏸️ Automação Instagram desativada para account:', config.accountId);
                continue;
              }
              
              console.log('✅ Automação Instagram ativada');
              
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
              
              // Create notification for AI response
              await storage.createNotification({
                userId: config.userId,
                accountId: config.accountId,
                type: 'ai_response',
                title: 'IA respondeu no Instagram DM',
                message: `Pergunta: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}" - Resposta enviada automaticamente.`,
                priority: 'low',
                link: '/ai-attendance'
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
              
              // Check if Instagram automation is enabled
              if (!config.instagramAutomationEnabled) {
                console.log('⏸️ Automação Instagram desativada para account:', config.accountId);
                continue;
              }
              
              console.log('✅ Automação Instagram ativada para comentários');
              
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
              
              // Create notification for AI response
              await storage.createNotification({
                userId: config.userId,
                accountId: config.accountId,
                type: 'ai_response',
                title: 'IA respondeu comentário no Instagram',
                message: `Comentário: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}" - Resposta enviada automaticamente.`,
                priority: 'low',
                link: '/ai-attendance'
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
              
              // Verificar se é uma mensagem echo (enviada pela própria página)
              if (webhookEvent.message?.is_echo) {
                console.log('⏭️ Pulando echo message (mensagem da própria página)');
                continue;
              }
              
              if (!webhookEvent.message || !webhookEvent.message.text) {
                console.log('⏭️ Pulando evento não-texto');
                continue;
              }
              
              if (webhookEvent.postback || webhookEvent.delivery || webhookEvent.read || webhookEvent.standby) {
                console.log('⏭️ Pulando evento especial');
                continue;
              }
              
              const messageId = webhookEvent.message.mid;
              const senderId = webhookEvent.sender?.id;
              const recipientId = webhookEvent.recipient?.id;
              const messageText = webhookEvent.message.text;
              
              if (!senderId || !messageText) {
                console.log('⏭️ Faltando senderId ou messageText');
                continue;
              }
              
              // Verificar se a mensagem já foi processada (evitar duplicatas)
              if (messageId && isMessageProcessed(messageId)) {
                console.log(`⏭️ Mensagem ${messageId} já processada, pulando...`);
                continue;
              }
              
              // Marcar mensagem como processada
              if (messageId) {
                markMessageAsProcessed(messageId);
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
              
              // Check if Facebook automation is enabled
              if (!config.facebookAutomationEnabled) {
                console.log('⏸️ Automação Facebook desativada para account:', config.accountId);
                continue;
              }
              
              console.log('✅ Automação Facebook ativada');
              
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
              
              // Check if Facebook API returned an error
              if (!sendResponse.ok || sendResult.error) {
                const errorMsg = sendResult.error?.message || sendResult.error?.error_user_msg || 'Erro desconhecido';
                const errorCode = sendResult.error?.code || 'N/A';
                const errorType = sendResult.error?.type || 'N/A';
                
                console.error('❌ ERRO ao enviar mensagem no Facebook Messenger!');
                console.error(`   Código: ${errorCode}`);
                console.error(`   Tipo: ${errorType}`);
                console.error(`   Mensagem: ${errorMsg}`);
                console.error('   Verifique se o token tem as permissões: pages_messaging');
                
                // Create error notification so user knows there's a problem
                await storage.createNotification({
                  userId: config.userId,
                  accountId: config.accountId,
                  type: 'ai_response',
                  title: 'Erro ao enviar mensagem no Messenger',
                  message: `Erro: ${errorMsg.substring(0, 100)}. Verifique as permissões do token.`,
                  priority: 'high',
                  link: '/ai-attendance'
                });
                
                continue;
              }
              
              // SUCCESS - Message was sent
              console.log('✅ Mensagem enviada no Messenger com sucesso! ID:', sendResult.message_id);
              
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
              
              // Create success notification for AI response
              await storage.createNotification({
                userId: config.userId,
                accountId: config.accountId,
                type: 'ai_response',
                title: 'IA respondeu no Facebook Messenger',
                message: `Pergunta: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}" - Resposta enviada automaticamente.`,
                priority: 'low',
                link: '/ai-attendance'
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
              
              // Verificar se o comentário já foi processado (evitar duplicatas)
              if (isMessageProcessed(commentId)) {
                console.log(`⏭️ Comentário ${commentId} já processado, pulando...`);
                continue;
              }
              
              // Marcar comentário como processado
              markMessageAsProcessed(commentId);
              
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
              
              // Check if Facebook automation is enabled
              if (!config.facebookAutomationEnabled) {
                console.log('⏸️ Automação Facebook desativada para account:', config.accountId);
                continue;
              }
              
              console.log('✅ Automação Facebook ativada para comentários');
              
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
              // O comment_id pode vir como postId_commentId, precisamos extrair o commentId
              const actualCommentId = commentId.includes('_') ? commentId.split('_')[1] : commentId;
              console.log(`📝 Comment ID original: ${commentId}, usando: ${actualCommentId}`);
              
              const replyResponse = await fetch(
                `https://graph.facebook.com/v21.0/${actualCommentId}/comments`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    message: aiResponse,
                    access_token: accessToken
                  })
                }
              );
              
              const replyResult = await replyResponse.json();
              console.log('📤 Facebook Comment Reply API response:', JSON.stringify(replyResult, null, 2));
              
              // Check if Facebook API returned an error
              if (!replyResponse.ok || replyResult.error) {
                const errorMsg = replyResult.error?.message || replyResult.error?.error_user_msg || 'Erro desconhecido';
                const errorCode = replyResult.error?.code || 'N/A';
                const errorType = replyResult.error?.type || 'N/A';
                
                console.error('❌ ERRO ao responder comentário no Facebook!');
                console.error(`   Código: ${errorCode}`);
                console.error(`   Tipo: ${errorType}`);
                console.error(`   Mensagem: ${errorMsg}`);
                console.error('   Verifique se o token tem as permissões: pages_manage_engagement, pages_read_engagement, pages_manage_posts');
                
                // Create error notification so user knows there's a problem
                await storage.createNotification({
                  userId: config.userId,
                  accountId: config.accountId,
                  type: 'ai_response',
                  title: 'Erro ao responder comentário no Facebook',
                  message: `Erro: ${errorMsg.substring(0, 100)}. Verifique as permissões do token.`,
                  priority: 'high',
                  link: '/ai-attendance'
                });
                
                continue;
              }
              
              // SUCCESS - Reply was posted to Facebook
              console.log('✅ Resposta postada no Facebook com sucesso! ID:', replyResult.id);
              
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
              
              // Create success notification for AI response
              await storage.createNotification({
                userId: config.userId,
                accountId: config.accountId,
                type: 'ai_response',
                title: 'IA respondeu comentário no Facebook',
                message: `Comentário: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}" - Resposta enviada automaticamente.`,
                priority: 'low',
                link: '/ai-attendance'
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
  app.post("/api/webhook/twitter", async (req, res) => {
    const body = req.body;
    
    console.log('🔔 ========== TWITTER WEBHOOK POST CHAMADO ==========');
    console.log('📦 Body completo:', JSON.stringify(body, null, 2));
    console.log('======================================================');
    
    // Respond immediately
    res.status(200).send('EVENT_RECEIVED');
    
    // Process asynchronously
    (async () => {
      try {
        // PROCESS DIRECT MESSAGES
        if (body.direct_message_events && body.direct_message_events.length > 0) {
          console.log('📥 Processando', body.direct_message_events.length, 'DMs do Twitter');
          
          for (const event of body.direct_message_events) {
            // Skip if it's a message we sent
            if (event.type !== 'message_create') continue;
            
            const messageData = event.message_create;
            const senderId = messageData?.sender_id;
            const recipientId = messageData?.target?.recipient_id;
            const messageText = messageData?.message_data?.text;
            
            if (!senderId || !messageText) continue;
            
            console.log(`📩 Twitter DM de ${senderId}: "${messageText}"`);
            
            // Find config by Twitter username
            const configs = await db.select().from(aiConfigurations);
            const config = configs.find(c => c.twitterUsername);
            
            if (!config) {
              console.log('❌ Configuração Twitter não encontrada');
              continue;
            }
            
            // Skip if message is from ourselves
            if (senderId === recipientId) continue;
            
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
            
            // Send DM via Twitter API (requires OAuth 1.0a)
            // Note: Twitter DM API requires special setup
            const bearerToken = config.twitterBearerToken;
            if (!bearerToken) {
              console.log('❌ Twitter Bearer Token não configurado');
              continue;
            }
            
            // Save conversation
            await storage.createAiConversation({
              userId: config.userId,
              accountId: config.accountId,
              platform: 'twitter',
              postContent: null,
              userMessage: messageText,
              aiResponse: aiResponse,
              mode: config.mode || 'compliance'
            });
            
            console.log('💾 Conversa Twitter DM salva no banco');
          }
        }
        
        // PROCESS TWEET MENTIONS (replies to tweets / mentions)
        if (body.tweet_create_events && body.tweet_create_events.length > 0) {
          console.log('📥 Processando', body.tweet_create_events.length, 'tweets/menções');
          
          for (const tweet of body.tweet_create_events) {
            const tweetId = tweet.id_str;
            const tweetText = tweet.text;
            const userId = tweet.user?.id_str;
            const userName = tweet.user?.screen_name;
            const inReplyToTweetId = tweet.in_reply_to_status_id_str;
            const inReplyToUserId = tweet.in_reply_to_user_id_str;
            
            // Check if this is a mention or reply
            const isMention = tweet.entities?.user_mentions?.some((m: any) => m.screen_name);
            
            if (!tweetId || !tweetText || !userId) continue;
            
            console.log(`💬 Twitter menção/reply de @${userName}: "${tweetText}"`);
            
            // Find config
            const configs = await db.select().from(aiConfigurations);
            const config = configs.find(c => c.twitterUsername);
            
            if (!config) {
              console.log('❌ Configuração Twitter não encontrada');
              continue;
            }
            
            // Skip if tweet is from ourselves
            if (userName?.toLowerCase() === config.twitterUsername?.toLowerCase()) {
              console.log('⏭️ Pulando tweet do próprio perfil');
              continue;
            }
            
            console.log('✅ Configuração encontrada para account:', config.accountId);
            
            // Generate AI response for the mention/reply
            const aiResponse = await generateAiResponse(
              tweetText,
              `Menção/Reply no Twitter de @${userName}`,
              config.mode || 'compliance',
              config.userId,
              {
                systemPrompt: config.systemPrompt,
                personalityTraits: config.personalityTraits,
                politicalInfo: config.politicalInfo,
                responseGuidelines: config.responseGuidelines
              }
            );
            
            console.log('🤖 Resposta IA para tweet:', aiResponse);
            
            // Note: Replying to tweets via API requires OAuth 1.0a or OAuth 2.0 with user context
            // This would need special implementation with Twitter API v2
            
            // Save conversation
            await storage.createAiConversation({
              userId: config.userId,
              accountId: config.accountId,
              platform: 'twitter_mention',
              postContent: `Tweet ID: ${tweetId}, Reply to: ${inReplyToTweetId || 'N/A'}`,
              userMessage: tweetText,
              aiResponse: aiResponse,
              mode: config.mode || 'compliance'
            });
            
            console.log('💾 Resposta a tweet salva no banco');
          }
        }
      } catch (error) {
        console.error('❌ Erro no processamento Twitter:', error);
      }
    })();
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

  // Create public supporter with volunteer code (PUBLIC - no auth required)
  app.post("/api/public/support/:slug/:volunteerCode", async (req, res) => {
    try {
      const { slug, volunteerCode } = req.params;
      const validatedData = insertContactSchema.parse(req.body);
      
      const supporter = await storage.createPublicSupporter(slug, validatedData, volunteerCode);
      
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
      const isConfigured = !!integration.clientId && !!integration.clientSecret;
      const isAuthorized = !!integration.accessToken;
      
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
        configured: isConfigured,
        authorized: isAuthorized,
        isConfigured: isConfigured,
        isAuthorized: isAuthorized,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      };
      
      console.log('[Google Calendar] GET returning:', {
        autoCreateMeet: safeIntegration.autoCreateMeet,
        syncReminders: safeIntegration.syncReminders,
        syncDirection: safeIntegration.syncDirection
      });
      
      res.json(safeIntegration);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/google-calendar - Save/update Google Calendar OAuth credentials
  app.post("/api/google-calendar", authenticateToken, requirePermission("settings"), async (req: AuthRequest, res) => {
    try {
      const { clientId, clientSecret, redirectUri, syncDirection, autoCreateMeet, syncReminders } = req.body;
      
      console.log('[Google Calendar] POST received:', {
        clientId: clientId ? '***' : 'empty',
        clientSecret: clientSecret ? '***' : 'empty',
        redirectUri,
        syncDirection,
        autoCreateMeet,
        syncReminders,
        autoCreateMeetType: typeof autoCreateMeet
      });
      
      // Get existing integration to preserve clientSecret if not provided
      const existingIntegration = await storage.getGoogleCalendarIntegration(req.accountId!);
      
      // If no clientSecret provided and we have an existing one, keep it
      let finalClientSecret: string | undefined;
      if (clientSecret && clientSecret.trim() !== '') {
        // New clientSecret provided - encrypt it
        finalClientSecret = encryptApiKey(clientSecret);
      } else if (existingIntegration?.clientSecret) {
        // No new clientSecret but existing one exists - keep it
        finalClientSecret = existingIntegration.clientSecret;
      }
      
      // Validate required fields
      if (!clientId || !redirectUri) {
        return res.status(400).json({ error: "Client ID e Redirect URI são obrigatórios" });
      }
      
      // For new integrations, clientSecret is required
      if (!finalClientSecret) {
        return res.status(400).json({ error: "Client Secret é obrigatório para novas configurações" });
      }
      
      const integration = await storage.upsertGoogleCalendarIntegration({
        clientId,
        clientSecret: finalClientSecret,
        redirectUri,
        syncDirection: syncDirection || "both",
        autoCreateMeet: autoCreateMeet || false,
        syncReminders: syncReminders !== false, // default true
        syncEnabled: true,
        userId: req.userId!,
        accountId: req.accountId!,
        // Preserve existing tokens and email if updating
        accessToken: existingIntegration?.accessToken,
        refreshToken: existingIntegration?.refreshToken,
        tokenExpiryDate: existingIntegration?.tokenExpiryDate,
        email: existingIntegration?.email,
        calendarId: existingIntegration?.calendarId
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
      const { code, state: accountId, error: oauthError } = req.query;
      
      console.log('[Google Calendar] OAuth callback received:', { 
        hasCode: !!code, 
        accountId,
        oauthError,
        fullQuery: req.query
      });
      
      // Handle OAuth errors from Google
      if (oauthError) {
        console.error('[Google Calendar] OAuth error from Google:', oauthError);
        return res.redirect('/settings?tab=google-calendar&error=' + encodeURIComponent('Erro do Google: ' + oauthError));
      }
      
      if (!code || !accountId) {
        console.error('[Google Calendar] Missing code or accountId');
        return res.status(400).send("Missing authorization code or account ID");
      }
      
      // Get the integration for this account
      console.log('[Google Calendar] Fetching integration for account:', accountId);
      const integration = await storage.getGoogleCalendarIntegration(accountId as string);
      
      if (!integration) {
        console.error('[Google Calendar] No integration found for account:', accountId);
        return res.status(400).send("Integration not found for this account");
      }
      
      if (!integration.clientId || !integration.clientSecret) {
        console.error('[Google Calendar] Missing credentials:', { 
          hasClientId: !!integration.clientId, 
          hasClientSecret: !!integration.clientSecret 
        });
        return res.status(400).send("Integration not configured - missing credentials");
      }
      
      // Decrypt the client secret
      console.log('[Google Calendar] Decrypting client secret...');
      const decryptedClientSecret = decryptApiKey(integration.clientSecret);
      
      // Exchange code for tokens
      console.log('[Google Calendar] Creating OAuth2 client with redirect URI:', integration.redirectUri);
      const oauth2Client = new google.auth.OAuth2(
        integration.clientId,
        decryptedClientSecret,
        integration.redirectUri
      );
      
      console.log('[Google Calendar] Exchanging code for tokens...');
      let tokens;
      try {
        const tokenResponse = await oauth2Client.getToken(code as string);
        tokens = tokenResponse.tokens;
        console.log('[Google Calendar] Token exchange successful:', {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiryDate: tokens.expiry_date
        });
      } catch (tokenError: any) {
        console.error('[Google Calendar] Token exchange failed:', tokenError.message);
        console.error('[Google Calendar] Token error details:', tokenError.response?.data || tokenError);
        return res.redirect('/settings?tab=google-calendar&error=' + encodeURIComponent('Erro ao trocar código por token: ' + tokenError.message));
      }
      
      oauth2Client.setCredentials(tokens);
      
      // Get user email
      console.log('[Google Calendar] Fetching user email...');
      let email = null;
      try {
        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const userInfo = await oauth2.userinfo.get();
        email = userInfo.data.email;
        console.log('[Google Calendar] User email:', email);
      } catch (emailError: any) {
        console.error('[Google Calendar] Failed to get user email:', emailError.message);
        // Continue without email - not critical
      }
      
      // Encrypt tokens before storing
      console.log('[Google Calendar] Encrypting tokens...');
      const encryptedAccessToken = encryptApiKey(tokens.access_token!);
      const encryptedRefreshToken = tokens.refresh_token ? encryptApiKey(tokens.refresh_token) : null;
      
      // Update integration with tokens and email
      console.log('[Google Calendar] Saving tokens to database...');
      try {
        await storage.upsertGoogleCalendarIntegration({
          ...integration,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          email: email || undefined,
          calendarId: 'primary',
          userId: integration.userId,
          accountId: accountId as string
        });
        console.log('[Google Calendar] Tokens saved successfully!');
      } catch (dbError: any) {
        console.error('[Google Calendar] Database save failed:', dbError.message);
        return res.redirect('/settings?tab=google-calendar&error=' + encodeURIComponent('Erro ao salvar tokens: ' + dbError.message));
      }
      
      // Redirect to settings page with success message
      console.log('[Google Calendar] OAuth flow completed successfully');
      res.redirect('/settings?tab=google-calendar&status=connected');
    } catch (error: any) {
      console.error('[Google Calendar] OAuth callback unexpected error:', error);
      console.error('[Google Calendar] Error stack:', error.stack);
      res.redirect('/settings?tab=google-calendar&error=' + encodeURIComponent('Erro inesperado: ' + error.message));
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
      
      console.log('[Google Calendar Sync] Starting sync...');
      console.log('[Google Calendar Sync] Sync direction:', integration.syncDirection);
      
      // Sync logic based on direction
      const syncDirection = integration.syncDirection || 'both';
      let importedEvents = 0;
      let exportedEvents = 0;
      let skippedEvents = 0;
      
      // Get existing local events for mapping
      const existingEvents = await storage.getEvents(req.accountId!);
      const googleEventIds = new Set(existingEvents.filter(e => e.googleEventId).map(e => e.googleEventId));
      console.log('[Google Calendar Sync] Existing local events:', existingEvents.length);
      console.log('[Google Calendar Sync] Events already synced from Google:', googleEventIds.size);
      
      if (syncDirection === 'from_google' || syncDirection === 'both') {
        // Fetch events from Google Calendar (next 3 months)
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        
        console.log('[Google Calendar Sync] Fetching events from Google Calendar...');
        console.log('[Google Calendar Sync] Calendar ID:', integration.calendarId || 'primary');
        console.log('[Google Calendar Sync] Time range:', new Date().toISOString(), 'to', threeMonthsFromNow.toISOString());
        
        const response = await calendar.events.list({
          calendarId: integration.calendarId || 'primary',
          timeMin: new Date().toISOString(),
          timeMax: threeMonthsFromNow.toISOString(),
          maxResults: 250,
          singleEvents: true,
          orderBy: 'startTime'
        });
        
        const googleEvents = response.data.items || [];
        console.log('[Google Calendar Sync] Found', googleEvents.length, 'events in Google Calendar');
        
        // Import Google events to our system
        for (const googleEvent of googleEvents) {
          // Log each event for debugging
          console.log('[Google Calendar Sync] Processing event:', {
            id: googleEvent.id,
            summary: googleEvent.summary,
            start: googleEvent.start,
            end: googleEvent.end,
            eventType: (googleEvent as any).eventType,
            transparency: googleEvent.transparency
          });
          
          if (!googleEvent.id) {
            console.log('[Google Calendar Sync] Skipping - no event ID');
            skippedEvents++;
            continue;
          }
          
          // Skip birthday events, holidays, and other automatic events
          const eventType = (googleEvent as any).eventType;
          if (eventType === 'birthday' || eventType === 'fromGmail' || eventType === 'outOfOffice') {
            console.log('[Google Calendar Sync] Skipping - automatic event type:', eventType);
            skippedEvents++;
            continue;
          }
          
          // Skip transparent events (events that don't block time, like birthdays)
          if (googleEvent.transparency === 'transparent') {
            console.log('[Google Calendar Sync] Skipping - transparent event (birthday/reminder):', googleEvent.summary);
            skippedEvents++;
            continue;
          }
          
          // Check if already imported
          if (googleEventIds.has(googleEvent.id)) {
            // Event already exists - check if we need to update the Meet link or color
            const existingEvent = existingEvents.find(e => e.googleEventId === googleEvent.id);
            
            // Extract Google Meet link
            let meetLink: string | null = null;
            if (googleEvent.hangoutLink) {
              meetLink = googleEvent.hangoutLink;
            } else if (googleEvent.conferenceData?.entryPoints) {
              const videoEntry = googleEvent.conferenceData.entryPoints.find(
                (ep: any) => ep.entryPointType === 'video'
              );
              if (videoEntry?.uri) {
                meetLink = videoEntry.uri;
              }
            }
            
            // Map Google Calendar colorId to hex color
            const googleColorMapExisting: { [key: string]: string } = {
              '1': '#7986cb',  // Lavender
              '2': '#33b679',  // Sage
              '3': '#8e24aa',  // Grape
              '4': '#e67c73',  // Flamingo
              '5': '#f6bf26',  // Banana
              '6': '#f4511e',  // Tangerine
              '7': '#039be5',  // Peacock
              '8': '#616161',  // Graphite
              '9': '#3f51b5',  // Blueberry
              '10': '#0b8043', // Basil
              '11': '#d50000', // Tomato
            };
            const googleColor = googleEvent.colorId ? googleColorMapExisting[googleEvent.colorId] : null;
            
            // Check what needs updating
            const needsMeetUpdate = meetLink && !(existingEvent as any).googleMeetLink;
            const needsColorUpdate = googleColor && existingEvent?.borderColor !== googleColor;
            
            if (existingEvent && (needsMeetUpdate || needsColorUpdate)) {
              const updateData: any = {};
              if (needsMeetUpdate) updateData.googleMeetLink = meetLink;
              if (needsColorUpdate) updateData.borderColor = googleColor;
              
              console.log('[Google Calendar Sync] Updating existing event:', googleEvent.id, updateData);
              await storage.updateEvent(existingEvent.id, req.accountId!, updateData);
              importedEvents++; // Count as updated
            } else {
              console.log('[Google Calendar Sync] Skipping - already imported:', googleEvent.id);
              skippedEvents++;
            }
            continue;
          }
          
          // Parse start and end dates
          const startDate = googleEvent.start?.dateTime 
            ? new Date(googleEvent.start.dateTime) 
            : googleEvent.start?.date 
              ? new Date(googleEvent.start.date) 
              : null;
          
          const endDate = googleEvent.end?.dateTime 
            ? new Date(googleEvent.end.dateTime) 
            : googleEvent.end?.date 
              ? new Date(googleEvent.end.date) 
              : null;
          
          if (!startDate || !endDate) {
            console.log('[Google Calendar Sync] Skipping - no valid dates:', googleEvent.id);
            skippedEvents++;
            continue;
          }
          
          // Create event in our system (use summary or "Sem título" if empty)
          const eventTitle = googleEvent.summary || '(Sem título)';
          
          // Extract Google Meet link from hangoutLink or conferenceData
          let meetLink: string | null = null;
          if (googleEvent.hangoutLink) {
            meetLink = googleEvent.hangoutLink;
          } else if (googleEvent.conferenceData?.entryPoints) {
            const videoEntry = googleEvent.conferenceData.entryPoints.find(
              (ep: any) => ep.entryPointType === 'video'
            );
            if (videoEntry?.uri) {
              meetLink = videoEntry.uri;
            }
          }
          
          // Map Google Calendar colorId to hex color
          const googleColorMap: { [key: string]: string } = {
            '1': '#7986cb',  // Lavender
            '2': '#33b679',  // Sage
            '3': '#8e24aa',  // Grape
            '4': '#e67c73',  // Flamingo
            '5': '#f6bf26',  // Banana
            '6': '#f4511e',  // Tangerine
            '7': '#039be5',  // Peacock
            '8': '#616161',  // Graphite
            '9': '#3f51b5',  // Blueberry
            '10': '#0b8043', // Basil
            '11': '#d50000', // Tomato
          };
          const borderColor = googleEvent.colorId ? googleColorMap[googleEvent.colorId] || '#3b82f6' : '#3b82f6';
          
          console.log('[Google Calendar Sync] Creating event:', eventTitle, 'at', startDate, 'meetLink:', meetLink, 'color:', borderColor);
          
          try {
            await storage.createEvent({
              accountId: req.accountId!,
              userId: req.userId!,
              title: eventTitle,
              description: googleEvent.description || null,
              startDate,
              endDate,
              location: googleEvent.location || null,
              category: 'event',
              googleEventId: googleEvent.id,
              googleMeetLink: meetLink,
              borderColor: borderColor,
              reminder: false,
            });
            
            importedEvents++;
            console.log('[Google Calendar Sync] Event created successfully');
          } catch (createError: any) {
            console.error('[Google Calendar Sync] Error creating event:', createError.message);
          }
        }
        
        console.log('[Google Calendar Sync] Import complete. Imported:', importedEvents, 'Skipped:', skippedEvents);
      }
      
      if (syncDirection === 'to_google' || syncDirection === 'both') {
        // Get local events that don't have googleEventId (not yet synced to Google)
        const localEventsToSync = existingEvents.filter(e => !e.googleEventId);
        
        for (const localEvent of localEventsToSync) {
          try {
            // Build request body
            const requestBody: any = {
              summary: localEvent.title,
              description: localEvent.description || undefined,
              location: localEvent.location || undefined,
              start: { 
                dateTime: new Date(localEvent.startDate).toISOString(),
                timeZone: 'America/Sao_Paulo'
              },
              end: { 
                dateTime: new Date(localEvent.endDate).toISOString(),
                timeZone: 'America/Sao_Paulo'
              },
            };
            
            // Add Google Meet if autoCreateMeet is enabled
            if (integration.autoCreateMeet) {
              requestBody.conferenceData = {
                createRequest: {
                  requestId: `politicall-${localEvent.id}-${Date.now()}`,
                  conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                  }
                }
              };
            }
            
            // Create event in Google Calendar
            const googleEvent = await calendar.events.insert({
              calendarId: integration.calendarId || 'primary',
              conferenceDataVersion: integration.autoCreateMeet ? 1 : 0,
              requestBody
            });
            
            // Update local event with Google Event ID and Meet link
            if (googleEvent.data.id) {
              const updateData: any = {
                googleEventId: googleEvent.data.id
              };
              
              // Save Meet link if created
              if (googleEvent.data.hangoutLink) {
                updateData.googleMeetLink = googleEvent.data.hangoutLink;
              }
              
              await storage.updateEvent(localEvent.id, req.accountId!, updateData);
              exportedEvents++;
              
              console.log('[Google Calendar Sync] Event exported:', localEvent.title, 
                'Meet link:', googleEvent.data.hangoutLink || 'none');
            }
          } catch (insertError) {
            console.error('Error syncing event to Google:', insertError);
          }
        }
      }
      
      // Update last sync time
      await storage.upsertGoogleCalendarIntegration({
        ...integration,
        lastSyncAt: new Date(),
        userId: integration.userId,
        accountId: req.accountId!
      });
      
      const totalSynced = importedEvents + exportedEvents;
      let message = 'Sincronização concluída. ';
      if (importedEvents > 0) message += `${importedEvents} eventos importados do Google. `;
      if (exportedEvents > 0) message += `${exportedEvents} eventos exportados para o Google. `;
      if (totalSynced === 0) message += 'Nenhum evento novo para sincronizar.';
      
      res.json({ 
        success: true, 
        message: message.trim(),
        importedEvents,
        exportedEvents,
        synced: totalSynced,
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

  // Generic Privacy Policy Page
  app.get("/privacy", (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidade - Politicall</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; background: #f9f9f9; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #40E0D0; border-bottom: 2px solid #40E0D0; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .section { margin: 20px 0; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Política de Privacidade</h1>
    <p><strong>Plataforma:</strong> Politicall</p>
    <p><strong>Última Atualização:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

    <div class="section">
      <h2>1. Introdução</h2>
      <p>A Politicall ("nós", "nosso" ou "plataforma") está comprometida em proteger a privacidade dos usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais.</p>
    </div>

    <div class="section">
      <h2>2. Dados Coletados</h2>
      <p>Podemos coletar os seguintes tipos de dados:</p>
      <ul>
        <li><strong>Dados de Cadastro:</strong> Nome, e-mail, telefone, cargo</li>
        <li><strong>Dados de Redes Sociais:</strong> Mensagens, comentários e interações via Facebook, Instagram e Twitter/X</li>
        <li><strong>Dados de Uso:</strong> Informações sobre como você utiliza a plataforma</li>
        <li><strong>Dados de Contatos:</strong> Informações de eleitores e apoiadores cadastrados</li>
      </ul>
    </div>

    <div class="section">
      <h2>3. Uso dos Dados</h2>
      <p>Utilizamos seus dados para:</p>
      <ul>
        <li>Fornecer e melhorar nossos serviços</li>
        <li>Processar atendimento automatizado via IA</li>
        <li>Gerenciar relacionamento com eleitores</li>
        <li>Enviar comunicações relevantes</li>
        <li>Cumprir obrigações legais</li>
      </ul>
    </div>

    <div class="section">
      <h2>4. Compartilhamento de Dados</h2>
      <p>Seus dados podem ser compartilhados com:</p>
      <ul>
        <li>Plataformas de redes sociais (Meta, Twitter) para integrações</li>
        <li>Provedores de serviços de IA (OpenAI) para processamento de mensagens</li>
        <li>Autoridades legais quando exigido por lei</li>
      </ul>
      <p>Não vendemos seus dados pessoais a terceiros.</p>
    </div>

    <div class="section">
      <h2>5. Segurança</h2>
      <p>Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados, incluindo:</p>
      <ul>
        <li>Criptografia de dados em trânsito e em repouso</li>
        <li>Controle de acesso baseado em funções</li>
        <li>Monitoramento contínuo de segurança</li>
        <li>Backups regulares</li>
      </ul>
    </div>

    <div class="section">
      <h2>6. Seus Direitos</h2>
      <p>Você tem direito a:</p>
      <ul>
        <li>Acessar seus dados pessoais</li>
        <li>Corrigir dados incorretos</li>
        <li>Solicitar exclusão de dados</li>
        <li>Revogar consentimento</li>
        <li>Portabilidade de dados</li>
      </ul>
    </div>

    <div class="section">
      <h2>7. Retenção de Dados</h2>
      <p>Mantemos seus dados pelo tempo necessário para fornecer nossos serviços ou conforme exigido por lei. Dados de mensagens são retidos por até 2 anos.</p>
    </div>

    <div class="section">
      <h2>8. Contato</h2>
      <p>Para questões sobre privacidade, entre em contato:</p>
      <p>E-mail: <a href="mailto:privacidade@politicall.com.br">privacidade@politicall.com.br</a></p>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Politicall. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Generic Terms of Service Page
  app.get("/terms", (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Termos de Serviço - Politicall</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; background: #f9f9f9; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #40E0D0; border-bottom: 2px solid #40E0D0; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .section { margin: 20px 0; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Termos de Serviço</h1>
    <p><strong>Plataforma:</strong> Politicall</p>
    <p><strong>Última Atualização:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

    <div class="section">
      <h2>1. Aceitação dos Termos</h2>
      <p>Ao acessar e usar a plataforma Politicall, você concorda com estes Termos de Serviço. Se não concordar, não utilize nossos serviços.</p>
    </div>

    <div class="section">
      <h2>2. Descrição do Serviço</h2>
      <p>A Politicall é uma plataforma de gestão política que oferece:</p>
      <ul>
        <li>Gerenciamento de contatos e eleitores (CRM)</li>
        <li>Atendimento automatizado via IA em redes sociais</li>
        <li>Gestão de demandas e eventos</li>
        <li>Campanhas de pesquisa</li>
        <li>Alianças políticas</li>
      </ul>
    </div>

    <div class="section">
      <h2>3. Elegibilidade</h2>
      <p>Para usar a Politicall, você deve:</p>
      <ul>
        <li>Ter pelo menos 18 anos de idade</li>
        <li>Ter capacidade legal para celebrar contratos</li>
        <li>Fornecer informações verdadeiras e atualizadas</li>
      </ul>
    </div>

    <div class="section">
      <h2>4. Uso Aceitável</h2>
      <p>Você concorda em não:</p>
      <ul>
        <li>Violar leis ou regulamentos aplicáveis</li>
        <li>Disseminar conteúdo ilegal, ofensivo ou difamatório</li>
        <li>Interferir no funcionamento da plataforma</li>
        <li>Tentar acessar dados de outros usuários sem autorização</li>
        <li>Usar a plataforma para spam ou assédio</li>
      </ul>
    </div>

    <div class="section">
      <h2>5. Propriedade Intelectual</h2>
      <p>Todo o conteúdo da plataforma, incluindo código, design, textos e marcas, é propriedade da Politicall ou de seus licenciadores. É proibida a reprodução sem autorização.</p>
    </div>

    <div class="section">
      <h2>6. Limitação de Responsabilidade</h2>
      <p>A Politicall não se responsabiliza por:</p>
      <ul>
        <li>Danos indiretos ou consequenciais</li>
        <li>Interrupções de serviço fora de nosso controle</li>
        <li>Conteúdo gerado por IA que possa ser impreciso</li>
        <li>Ações de terceiros nas redes sociais</li>
      </ul>
    </div>

    <div class="section">
      <h2>7. Rescisão</h2>
      <p>Podemos suspender ou encerrar sua conta a qualquer momento por violação destes termos. Você pode encerrar sua conta a qualquer momento entrando em contato conosco.</p>
    </div>

    <div class="section">
      <h2>8. Alterações</h2>
      <p>Reservamo-nos o direito de modificar estes termos a qualquer momento. Alterações significativas serão comunicadas por e-mail ou através da plataforma.</p>
    </div>

    <div class="section">
      <h2>9. Lei Aplicável</h2>
      <p>Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será resolvida nos tribunais de São Paulo, SP.</p>
    </div>

    <div class="section">
      <h2>10. Contato</h2>
      <p>Para questões sobre estes termos:</p>
      <p>E-mail: <a href="mailto:contato@politicall.com.br">contato@politicall.com.br</a></p>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Politicall. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
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
