import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - Custom authentication with email/password
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("assessor"), // admin, coordenador, assessor
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contacts table
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  partyId: varchar("party_id").notNull().references(() => politicalParties.id, { onDelete: "cascade" }),
  allyName: text("ally_name").notNull(),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Demands - CRM for office demands
export const demands = pgTable("demands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, cancelled
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  assignee: text("assignee"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Demand comments
export const demandComments = pgTable("demand_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  demandId: varchar("demand_id").notNull().references(() => demands.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Events - Agenda system
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  category: text("category"), // meeting, event, deadline, personal
  location: text("location"),
  reminder: boolean("reminder").default(false),
  reminderMinutes: integer("reminder_minutes"), // minutes before event
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Configuration - Social media automation settings
export const aiConfigurations = pgTable("ai_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("compliance"), // compliance, formal
  facebookToken: text("facebook_token"),
  facebookPageId: text("facebook_page_id"),
  instagramToken: text("instagram_token"),
  instagramAccountId: text("instagram_account_id"),
  twitterToken: text("twitter_token"),
  twitterTokenSecret: text("twitter_token_secret"),
  whatsappToken: text("whatsapp_token"),
  whatsappPhoneId: text("whatsapp_phone_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// AI Conversations - Track conversations for context
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // facebook, instagram, twitter, whatsapp
  postContent: text("post_content"),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  mode: text("mode").notNull(), // compliance, formal
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Marketing campaigns
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // demand_urgent, demand_comment, event_reminder, campaign_sent, etc
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"), // low, medium, high
  isRead: boolean("is_read").notNull().default(false),
  link: text("link"), // Optional link to navigate when clicked
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  contacts: many(contacts),
  alliances: many(politicalAlliances),
  demands: many(demands),
  events: many(events),
  campaigns: many(marketingCampaigns),
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

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  role: true,
}).extend({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  role: z.enum(["admin", "coordenador", "assessor"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertPoliticalAllianceSchema = createInsertSchema(politicalAlliances).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertDemandSchema = createInsertSchema(demands).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDemandCommentSchema = createInsertSchema(demandComments).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertAiConfigurationSchema = createInsertSchema(aiConfigurations).omit({
  id: true,
  userId: true,
  updatedAt: true,
});

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({
  id: true,
  userId: true,
  sentAt: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  userId: true,
  createdAt: true,
});

// TypeScript types
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

export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
