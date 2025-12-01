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

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, numeric, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Accounts table - Each account represents a political office/cabinet
export const accounts = pgTable("accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Nome do gabinete/escritório político
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Permissions Type
export type UserPermissions = {
  dashboard: boolean;
  contacts: boolean;
  alliances: boolean;
  demands: boolean;
  agenda: boolean;
  ai: boolean;
  marketing: boolean;
  petitions: boolean;
  users: boolean;
  settings: boolean;
};

// Default permissions by role
export const DEFAULT_PERMISSIONS = {
  admin: {
    dashboard: true,
    contacts: true,
    alliances: true,
    demands: true,
    agenda: true,
    ai: true,
    marketing: true,
    petitions: true,
    users: true,
    settings: true
  },
  coordenador: {
    dashboard: true,
    contacts: true,
    alliances: true,
    demands: true,
    agenda: true,
    ai: true,
    marketing: true,
    petitions: true,
    users: false,  // Coordenador NÃO gerencia usuários
    settings: true
  },
  assessor: {
    dashboard: true,
    contacts: true,
    alliances: false,   // Assessor NÃO acessa alianças políticas
    demands: true,
    agenda: true,
    ai: false,          // Assessor NÃO usa IA
    marketing: false,   // Assessor NÃO faz marketing
    petitions: false,   // Assessor NÃO acessa petições
    users: false,       // Assessor NÃO gerencia usuários
    settings: false     // Assessor NÃO acessa configurações
  }
} as const;

// Political positions available in Brazil
export const POLITICAL_POSITIONS = [
  "Vereador",
  "Prefeito",
  "Vice-Prefeito",
  "Deputado Estadual",
  "Deputado Federal",
  "Senador",
  "Governador",
  "Vice-Governador",
  "Presidente",
  "Vice-Presidente",
  "Candidato",
  "Pré-Candidato",
  "Outro"
] as const;

// Users table - Custom authentication with email/password
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("assessor"), // admin, coordenador, assessor
  permissions: jsonb("permissions").$type<UserPermissions>(),
  phone: text("phone"),
  avatar: text("avatar"), // Base64 encoded image or URL
  slug: text("slug").unique(), // URL slug for public supporter page (e.g., "joao-silva")
  partyId: varchar("party_id").references(() => politicalParties.id),
  politicalPosition: text("political_position"),
  electionNumber: text("election_number"), // Número de eleição (ex: 12345)
  lastElectionVotes: integer("last_election_votes"),
  state: text("state"),
  city: text("city"),
  whatsapp: text("whatsapp"), // WhatsApp number for contact
  planValue: text("plan_value"), // Plan value (stored as formatted string)
  expiryDate: text("expiry_date"), // Expiry date (stored as DD/MM/YYYY)
  paymentStatus: text("payment_status"), // "pago", "atrasado", or null
  lastPaymentDate: text("last_payment_date"), // Last payment date (stored as DD/MM/YYYY)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contact interests/hobbies - Important for politicians to know
export const CONTACT_INTERESTS = [
  "Religião Católica",
  "Religião Evangélica",
  "Religião Espírita",
  "Religião Umbanda/Candomblé",
  "Outras Religiões",
  "Futebol",
  "Vôlei",
  "Basquete",
  "Natação",
  "Artes Marciais",
  "Corrida/Atletismo",
  "Ciclismo",
  "Crossfit/Academia",
  "Yoga/Pilates",
  "Esportes Radicais",
  "Gastronomia",
  "Culinária Vegana/Vegetariana",
  "Vinhos",
  "Cervejas Artesanais",
  "Café Especial",
  "Música Sertaneja",
  "Música Gospel",
  "MPB",
  "Rock",
  "Música Clássica",
  "Pagode/Samba",
  "Funk",
  "Música Eletrônica",
  "Jazz",
  "Cinema",
  "Teatro",
  "Literatura",
  "Artes Plásticas",
  "Fotografia",
  "Dança",
  "Artesanato",
  "Jardinagem",
  "Pets/Animais de Estimação",
  "Meio Ambiente",
  "Sustentabilidade",
  "Reciclagem",
  "Educação",
  "Tecnologia",
  "Games/E-sports",
  "Empreendedorismo",
  "Voluntariado",
  "Causas Sociais",
  "Direitos Humanos",
  "Feminismo",
  "LGBTQIA+",
  "Movimento Negro",
  "Terceira Idade",
  "Juventude",
  "Infância",
  "Saúde Mental",
  "Saúde e Bem-Estar",
  "Nutrição",
  "Moda",
  "Beleza",
  "Turismo",
  "Viagens",
  "Camping/Trilhas",
  "Pesca",
  "Caça",
  "Agricultura Familiar",
  "Pecuária",
  "Agronegócio",
  "Comércio Local",
  "Indústria",
  "Serviços",
  "Transporte Público",
  "Mobilidade Urbana",
  "Segurança Pública",
  "Defesa Civil",
  "Bombeiros",
  "Política Partidária",
  "Movimentos Sociais",
  "Sindicatos",
  "Associações de Classe",
  "Moradia Popular",
  "Saneamento Básico",
  "Iluminação Pública",
  "Pavimentação",
  "Saúde Pública",
  "Hospitais",
  "Postos de Saúde",
  "Escolas Públicas",
  "Universidades",
  "Creches",
  "Cultura Popular",
  "Festas Tradicionais",
  "Carnaval",
  "Festas Juninas",
  "Rodeios",
  "Feiras e Exposições",
] as const;

// Contact sources - How the contact was registered
export const CONTACT_SOURCES = [
  "Evento Político",
  "Palestra",
  "Indicação",
  "Facebook",
  "Instagram",
  "Rede Social X",
  "LinkedIn",
  "YouTube",
  "WhatsApp",
  "Importação",
  "Politicall",
  "Outros"
] as const;

export const GENDER_OPTIONS = [
  "Masculino",
  "Feminino",
  "Não-binário",
  "Outro",
  "Prefiro não responder"
] as const;

// Contacts table
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"), // For deduplication
  email: text("email"),
  phone: text("phone"),
  age: integer("age"),
  gender: text("gender"),
  state: text("state"),
  city: text("city"),
  interests: text("interests").array(),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Political parties - All 29 Brazilian parties from 2025
export const politicalParties = pgTable("political_parties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  acronym: text("acronym").notNull().unique(),
  ideology: text("ideology").notNull(), // Esquerda, Centro-Esquerda, Centro, Centro-Direita, Direita
  description: text("description"),
});

// Political alliances - User's political allies
export const politicalAlliances = pgTable("political_alliances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  partyId: varchar("party_id").notNull().references(() => politicalParties.id, { onDelete: "cascade" }),
  allyName: text("ally_name").notNull(),
  position: text("position"),
  state: text("state"),
  city: text("city"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Demands - CRM for office demands
export const demands = pgTable("demands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, cancelled
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  assignee: text("assignee"),
  collaborators: text("collaborators").array(), // optional list of collaborators
  dueDate: timestamp("due_date"),
  recurrence: text("recurrence").default("none"), // none, daily, weekly, monthly
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Demand comments
export const demandComments = pgTable("demand_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  demandId: varchar("demand_id").notNull().references(() => demands.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Events - Agenda system
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  category: text("category"), // meeting, event, deadline, personal
  borderColor: text("border_color"), // cor customizada da borda do card
  location: text("location"),
  recurrence: text("recurrence"), // none, daily, weekly, monthly
  reminder: boolean("reminder").default(false),
  reminderMinutes: integer("reminder_minutes"), // minutes before event
  googleEventId: text("google_event_id"), // Google Calendar event ID for synced events
  googleMeetLink: text("google_meet_link"), // Google Meet video conference link
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Configuration - Social media automation settings
export const aiConfigurations = pgTable("ai_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("compliance"), // compliance, formal
  // AI Personality and Training
  systemPrompt: text("system_prompt"),
  personalityTraits: text("personality_traits"),
  politicalInfo: text("political_info"),
  responseGuidelines: text("response_guidelines"),
  // Facebook complete integration
  facebookAppId: text("facebook_app_id"),
  facebookAppSecret: text("facebook_app_secret"),
  facebookPageAccessToken: text("facebook_page_access_token"),
  facebookPageId: text("facebook_page_id"),
  facebookWebhookVerifyToken: text("facebook_webhook_verify_token"),
  facebookPageName: text("facebook_page_name"),
  facebookAutomationEnabled: boolean("facebook_automation_enabled").default(false),
  // Instagram complete integration  
  instagramAppId: text("instagram_app_id"),
  instagramAppSecret: text("instagram_app_secret"),
  instagramAccessToken: text("instagram_access_token"),
  instagramBusinessAccountId: text("instagram_business_account_id"),
  instagramFacebookPageId: text("instagram_facebook_page_id"),
  instagramUsername: text("instagram_username"),
  instagramWebhookVerifyToken: text("instagram_webhook_verify_token"),
  instagramAutomationEnabled: boolean("instagram_automation_enabled").default(false),
  // Twitter/X complete integration
  twitterApiKey: text("twitter_api_key"),
  twitterApiSecretKey: text("twitter_api_secret_key"),
  twitterBearerToken: text("twitter_bearer_token"),
  twitterAccessToken: text("twitter_access_token"),
  twitterAccessTokenSecret: text("twitter_access_token_secret"),
  twitterClientId: text("twitter_client_id"),
  twitterClientSecret: text("twitter_client_secret"),
  twitterUsername: text("twitter_username"),
  // WhatsApp complete integration
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  whatsappBusinessAccountId: text("whatsapp_business_account_id"),
  whatsappAccessToken: text("whatsapp_access_token"),
  whatsappAppId: text("whatsapp_app_id"),
  whatsappAppSecret: text("whatsapp_app_secret"),
  whatsappWebhookVerifyToken: text("whatsapp_webhook_verify_token"),
  whatsappPhoneNumber: text("whatsapp_phone_number"),
  whatsappBusinessName: text("whatsapp_business_name"),
  // OpenAI API Key configuration
  openaiApiKey: text("openai_api_key"),
  openaiApiKeyLast4: text("openai_api_key_last4"),
  openaiApiKeyUpdatedAt: timestamp("openai_api_key_updated_at"),
  // OpenAI API status fields
  openaiApiStatus: text("openai_api_status").default("unknown"), // unknown, active, error
  openaiApiStatusMessage: text("openai_api_status_message"), // error message if status is error
  openaiApiStatusCheckedAt: timestamp("openai_api_status_checked_at"), // last check timestamp
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Conversations - Track conversations for context
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // facebook, instagram, twitter, whatsapp
  postContent: text("post_content"),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  mode: text("mode").notNull(), // compliance, formal
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Training Examples - Questions and answers for training
export const aiTrainingExamples = pgTable("ai_training_examples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"), // proposals, biography, contact, general
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Response Templates - Pre-defined responses
export const aiResponseTemplates = pgTable("ai_response_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(), // keywords that trigger this template
  response: text("response").notNull(),
  platform: text("platform"), // null = all platforms
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Marketing campaigns
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // email, whatsapp
  subject: text("subject"),
  message: text("message").notNull(),
  recipients: jsonb("recipients").notNull(), // array of email/phone numbers
  scheduledFor: timestamp("scheduled_for"),
  status: text("status").notNull().default("draft"), // draft, scheduled, sent, failed
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Notifications - In-app notifications for important events
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // demand_urgent, demand_comment, event_reminder, campaign_sent, etc
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"), // low, medium, high
  isRead: boolean("is_read").notNull().default(false),
  link: text("link"), // Optional link to navigate when clicked
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Integrations - Email and WhatsApp service configurations
export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  service: text("service").notNull(), // 'sendgrid' or 'twilio'
  enabled: boolean("enabled").default(false).notNull(),
  
  // SendGrid fields
  sendgridApiKey: text("sendgrid_api_key"),
  fromEmail: text("from_email"),
  fromName: text("from_name"),
  
  // Twilio fields  
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"), // Format: whatsapp:+5511999999999
  
  testMode: boolean("test_mode").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Google Calendar Integration - OAuth credentials and tokens per account
export const googleCalendarIntegrations = pgTable("google_calendar_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().unique().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // User who set up the integration
  
  // OAuth Credentials (provided by admin in settings)
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  redirectUri: text("redirect_uri"),
  
  // OAuth Tokens (received from Google after authorization)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiryDate: timestamp("token_expiry_date"),
  
  // Integration settings
  email: text("email"), // Google account email connected
  calendarId: text("calendar_id"), // Which calendar to sync with (default: primary)
  syncEnabled: boolean("sync_enabled").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  
  // Sync preferences
  syncDirection: text("sync_direction").default("both").notNull(), // "to_google", "from_google", "both"
  autoCreateMeet: boolean("auto_create_meet").default(false).notNull(), // Auto-create Google Meet links
  syncReminders: boolean("sync_reminders").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Survey Templates - Predefined survey types
export const surveyTemplates = pgTable("survey_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Intenção de voto", "Temas prioritários", etc
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  questionText: text("question_text").notNull(), // The survey question
  questionType: text("question_type").notNull(), // "open_text", "single_choice", "multiple_choice", "rating"
  options: jsonb("options").$type<string[]>(), // Array of answer options (for choice questions)
  order: integer("order").notNull(), // Display order
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Custom Question type for survey campaigns
export interface CustomQuestion {
  id: string;
  questionText: string;
  questionType: "open_text" | "single_choice" | "multiple_choice";
  options?: string[];
  required: boolean;
}

// Survey Campaigns - User-created survey instances
export const surveyCampaigns = pgTable("survey_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => surveyTemplates.id),
  campaignName: text("campaign_name").notNull(),
  slug: text("slug").notNull().unique(), // URL slug for landing page
  status: text("status").notNull().default("under_review"), // under_review, approved, rejected, active, paused, completed
  campaignStage: text("campaign_stage").notNull().default("aguardando"), // aguardando, aprovado, em_producao, finalizado
  productionStartDate: timestamp("production_start_date"), // Date when campaign enters "em_producao" stage
  adminReviewerId: varchar("admin_reviewer_id").references(() => users.id),
  adminNotes: text("admin_notes"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  region: text("region"), // Region where the survey will be conducted (city, state, etc)
  targetAudience: text("target_audience"), // Optional description of target
  customMainQuestion: text("custom_main_question"), // Custom main question (overrides template if set)
  customMainQuestionType: text("custom_main_question_type"), // Custom main question type (open_text, single_choice, multiple_choice)
  customMainQuestionOptions: jsonb("custom_main_question_options").$type<string[]>(), // Custom main question options
  customQuestions: jsonb("custom_questions").$type<CustomQuestion[]>(), // Additional custom questions
  viewCount: integer("view_count").default(0).notNull(), // Track landing page views
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Survey Landing Pages - Generated HTML for each campaign
export const surveyLandingPages = pgTable("survey_landing_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").notNull().unique().references(() => surveyCampaigns.id, { onDelete: "cascade" }),
  htmlContent: text("html_content").notNull(), // Pre-rendered HTML for compliance
  version: integer("version").notNull().default(1), // For tracking changes
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

// Survey Responses - Collected answers
export const surveyResponses = pgTable("survey_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  campaignId: varchar("campaign_id").notNull().references(() => surveyCampaigns.id, { onDelete: "cascade" }),
  responseData: jsonb("response_data").notNull(), // { answer: "text" } or { answers: ["option1", "option2"] }
  
  // Demographic data (mandatory for all surveys)
  gender: text("gender").notNull(), // masculino, feminino, outro, prefiro_nao_dizer
  ageRange: text("age_range").notNull(), // menos_35, mais_35
  employmentType: text("employment_type").notNull(), // carteira_assinada, autonomo, desempregado, aposentado, outro
  housingType: text("housing_type").notNull(), // casa_propria, aluguel, cedido, outro
  hasChildren: text("has_children").notNull(), // sim, nao
  politicalIdeology: text("political_ideology").notNull(), // direita, centro, esquerda, prefiro_nao_comentar
  
  respondentIp: text("respondent_ip"), // For duplicate prevention
  respondentMetadata: jsonb("respondent_metadata").$type<Record<string, any>>(), // Optional: location, device, etc
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  contacts: many(contacts),
  alliances: many(politicalAlliances),
  demands: many(demands),
  events: many(events),
  campaigns: many(marketingCampaigns),
  surveyCampaigns: many(surveyCampaigns),
  notifications: many(notifications),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, {
    fields: [contacts.userId],
    references: [users.id],
  }),
}));

export const politicalAlliancesRelations = relations(politicalAlliances, ({ one }) => ({
  user: one(users, {
    fields: [politicalAlliances.userId],
    references: [users.id],
  }),
  party: one(politicalParties, {
    fields: [politicalAlliances.partyId],
    references: [politicalParties.id],
  }),
}));

export const demandsRelations = relations(demands, ({ one, many }) => ({
  user: one(users, {
    fields: [demands.userId],
    references: [users.id],
  }),
  comments: many(demandComments),
}));

export const demandCommentsRelations = relations(demandComments, ({ one }) => ({
  demand: one(demands, {
    fields: [demandComments.demandId],
    references: [demands.id],
  }),
  user: one(users, {
    fields: [demandComments.userId],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
}));

export const surveyTemplatesRelations = relations(surveyTemplates, ({ many }) => ({
  campaigns: many(surveyCampaigns),
}));

export const surveyCampaignsRelations = relations(surveyCampaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [surveyCampaigns.userId],
    references: [users.id],
  }),
  template: one(surveyTemplates, {
    fields: [surveyCampaigns.templateId],
    references: [surveyTemplates.id],
  }),
  adminReviewer: one(users, {
    fields: [surveyCampaigns.adminReviewerId],
    references: [users.id],
  }),
  landingPage: one(surveyLandingPages),
  responses: many(surveyResponses),
}));

export const surveyLandingPagesRelations = relations(surveyLandingPages, ({ one }) => ({
  campaign: one(surveyCampaigns, {
    fields: [surveyLandingPages.campaignId],
    references: [surveyCampaigns.id],
  }),
}));

export const surveyResponsesRelations = relations(surveyResponses, ({ one }) => ({
  campaign: one(surveyCampaigns, {
    fields: [surveyResponses.campaignId],
    references: [surveyCampaigns.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  role: true,
  permissions: true,
  phone: true,
  avatar: true,
  partyId: true,
  politicalPosition: true,
  electionNumber: true,
  lastElectionVotes: true,
}).extend({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  role: z.enum(["admin", "coordenador", "assessor"]).optional(),
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
  phone: z.string().optional(),
  avatar: z.string().optional(),
  partyId: z.string().optional(),
  politicalPosition: z.string().optional(),
  electionNumber: z.string().optional(),
  lastElectionVotes: z.number().int().nonnegative().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
}).extend({
  age: z.number().int().positive().max(120).optional(),
  gender: z.enum(["Masculino", "Feminino", "Não-binário", "Outro", "Prefiro não responder"]).optional(),
});

export const insertPoliticalAllianceSchema = createInsertSchema(politicalAlliances).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertDemandSchema = createInsertSchema(demands).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string({ required_error: "Título é obrigatório" }).min(1, "Título é obrigatório"),
  description: z.string().nullable().optional(),
  status: z.string().default("pending"),
  priority: z.string().default("medium"),
  assignee: z.string().nullable().optional(),
  collaborators: z.array(z.string()).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
});

export const insertDemandCommentSchema = createInsertSchema(demandComments).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertAiConfigurationSchema = createInsertSchema(aiConfigurations).omit({
  id: true,
  userId: true,
  accountId: true,
  updatedAt: true,
});

export const insertAiTrainingExampleSchema = createInsertSchema(aiTrainingExamples).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertAiResponseTemplateSchema = createInsertSchema(aiResponseTemplates).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({
  id: true,
  userId: true,
  accountId: true,
  sentAt: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGoogleCalendarIntegrationSchema = createInsertSchema(googleCalendarIntegrations).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSurveyTemplateSchema = createInsertSchema(surveyTemplates).omit({
  id: true,
  createdAt: true,
});

// Zod schema for custom questions
export const customQuestionSchema = z.object({
  id: z.string(),
  questionText: z.string().min(5, "Pergunta deve ter no mínimo 5 caracteres"),
  questionType: z.enum(["open_text", "single_choice", "multiple_choice"]),
  options: z.array(z.string()).optional(),
  required: z.boolean()
});

export const insertSurveyCampaignSchema = createInsertSchema(surveyCampaigns).omit({
  id: true,
  userId: true,
  accountId: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
}).extend({
  campaignName: z.string().min(3, "Nome da campanha deve ter no mínimo 3 caracteres"),
  slug: z.string().min(3, "Slug deve ter no mínimo 3 caracteres"),
  status: z.string().default("under_review"),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  customMainQuestion: z.string().nullable().optional(),
  customMainQuestionType: z.string().nullable().optional(),
  customMainQuestionOptions: z.array(z.string()).nullable().optional(),
  customQuestions: z.array(customQuestionSchema).nullable().optional(),
});

export const insertSurveyLandingPageSchema = createInsertSchema(surveyLandingPages).omit({
  id: true,
  generatedAt: true,
});

export const insertSurveyResponseSchema = createInsertSchema(surveyResponses).omit({
  id: true,
  submittedAt: true,
}).extend({
  gender: z.enum(["masculino", "feminino", "outro", "prefiro_nao_dizer"]),
  ageRange: z.enum(["menos_35", "mais_35"]),
  employmentType: z.enum(["carteira_assinada", "autonomo", "desempregado", "aposentado", "outro"]),
  housingType: z.enum(["casa_propria", "aluguel", "cedido", "outro"]),
  hasChildren: z.enum(["sim", "nao"]),
  politicalIdeology: z.enum(["direita", "centro", "esquerda", "prefiro_nao_comentar"]),
});

// API Keys - External API integration
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  keyPrefix: text("key_prefix").notNull(), // First 8 chars to help identify the key
  hashedKey: text("hashed_key").notNull().unique(), // bcrypt hash of the full key
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const apiKeyUsage = pgTable("api_key_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Leads - Landing page lead capture (global, não precisa de accountId pois é landing pública)
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  position: text("position").notNull(),
  state: text("state").notNull(),
  city: text("city").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys, {
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
}).omit({ 
  id: true, 
  keyPrefix: true, // Will be generated from the key
  hashedKey: true, // Will be generated on the server
  lastUsedAt: true,
  createdAt: true 
});

export const insertApiKeyUsageSchema = createInsertSchema(apiKeyUsage).omit({
  id: true,
  createdAt: true
});

export const insertLeadSchema = createInsertSchema(leads, {
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  position: z.string().min(1, "Selecione um cargo"),
  state: z.string().min(2, "Selecione um estado"),
  city: z.string().min(2, "Digite a cidade"),
  message: z.string().optional(),
}).omit({ id: true, createdAt: true });

// TypeScript types
export type Account = typeof accounts.$inferSelect;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginUser = z.infer<typeof loginSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type PoliticalParty = typeof politicalParties.$inferSelect;

export type PoliticalAlliance = typeof politicalAlliances.$inferSelect;
export type InsertPoliticalAlliance = z.infer<typeof insertPoliticalAllianceSchema>;

export type Demand = typeof demands.$inferSelect;
export type InsertDemand = z.infer<typeof insertDemandSchema>;

export type DemandComment = typeof demandComments.$inferSelect;
export type InsertDemandComment = z.infer<typeof insertDemandCommentSchema>;

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type InsertAiConfiguration = z.infer<typeof insertAiConfigurationSchema>;

export type AiConversation = typeof aiConversations.$inferSelect;

export type AiTrainingExample = typeof aiTrainingExamples.$inferSelect;
export type InsertAiTrainingExample = z.infer<typeof insertAiTrainingExampleSchema>;

export type AiResponseTemplate = typeof aiResponseTemplates.$inferSelect;
export type InsertAiResponseTemplate = z.infer<typeof insertAiResponseTemplateSchema>;

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type GoogleCalendarIntegration = typeof googleCalendarIntegrations.$inferSelect;
export type InsertGoogleCalendarIntegration = z.infer<typeof insertGoogleCalendarIntegrationSchema>;

export type SurveyTemplate = typeof surveyTemplates.$inferSelect;
export type InsertSurveyTemplate = z.infer<typeof insertSurveyTemplateSchema>;

export type SurveyCampaign = typeof surveyCampaigns.$inferSelect;
export type InsertSurveyCampaign = z.infer<typeof insertSurveyCampaignSchema>;

export type SurveyLandingPage = typeof surveyLandingPages.$inferSelect;
export type InsertSurveyLandingPage = z.infer<typeof insertSurveyLandingPageSchema>;

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type ApiKeyUsage = typeof apiKeyUsage.$inferSelect;
export type InsertApiKeyUsage = z.infer<typeof insertApiKeyUsageSchema>;

export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
