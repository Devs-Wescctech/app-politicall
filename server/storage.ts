// Storage implementation using blueprint javascript_database
import { 
  accounts, users, contacts, politicalParties, politicalAlliances, demands, demandComments, events,
  aiConfigurations, aiConversations, aiTrainingExamples, aiResponseTemplates, 
  marketingCampaigns, notifications, integrations, surveyTemplates, surveyCampaigns, surveyLandingPages, surveyResponses, leads,
  apiKeys, apiKeyUsage,
  type Account, type User, type InsertUser, type Contact, type InsertContact,
  type PoliticalParty, type PoliticalAlliance, type InsertPoliticalAlliance,
  type Demand, type InsertDemand, type DemandComment, type InsertDemandComment,
  type Event, type InsertEvent, type AiConfiguration, type InsertAiConfiguration,
  type AiConversation, type AiTrainingExample, type InsertAiTrainingExample,
  type AiResponseTemplate, type InsertAiResponseTemplate,
  type MarketingCampaign, type InsertMarketingCampaign,
  type Notification, type InsertNotification,
  type Integration, type InsertIntegration,
  type SurveyTemplate, type InsertSurveyTemplate,
  type SurveyCampaign, type InsertSurveyCampaign,
  type SurveyLandingPage, type InsertSurveyLandingPage,
  type SurveyResponse, type InsertSurveyResponse,
  type Lead, type InsertLead,
  type ApiKey, type InsertApiKey,
  type ApiKeyUsage, type InsertApiKeyUsage
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, inArray } from "drizzle-orm";
import { encryptApiKey, decryptApiKey } from "./crypto";
import bcrypt from "bcrypt";
import crypto from "crypto";

export interface IStorage {
  // Accounts
  createAccount(account: { name: string }): Promise<Account>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(accountId: string): Promise<User[]>;
  updateUser(id: string, accountId: string, user: Partial<Omit<User, "id" | "password" | "createdAt">>): Promise<User>;
  deleteUser(id: string, accountId: string): Promise<void>;

  // Contacts
  getContacts(accountId: string): Promise<Contact[]>;
  getContact(id: string, accountId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact & { userId: string; accountId: string }): Promise<Contact>;
  updateContact(id: string, accountId: string, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: string, accountId: string): Promise<void>;
  
  // Public Support (no authentication required)
  getCandidateBySlug(slug: string): Promise<{ id: string; accountId: string; name: string; email: string; avatar: string | null; politicalPosition: string | null; electionNumber: string | null; slug: string | null; party: PoliticalParty | null } | undefined>;
  createPublicSupporter(slug: string, contact: InsertContact): Promise<Contact>;

  // Political Parties
  getAllParties(): Promise<PoliticalParty[]>;
  createParty(party: Omit<PoliticalParty, "id">): Promise<PoliticalParty>;

  // Political Alliances
  getAlliances(accountId: string): Promise<PoliticalAlliance[]>;
  createAlliance(alliance: InsertPoliticalAlliance & { userId: string; accountId: string }): Promise<PoliticalAlliance>;
  updateAlliance(id: string, accountId: string, alliance: Partial<InsertPoliticalAlliance>): Promise<PoliticalAlliance>;
  deleteAlliance(id: string, accountId: string): Promise<void>;

  // Demands
  getDemands(accountId: string): Promise<Demand[]>;
  getDemand(id: string, accountId: string): Promise<Demand | undefined>;
  createDemand(demand: InsertDemand & { userId: string; accountId: string }): Promise<Demand>;
  updateDemand(id: string, accountId: string, demand: Partial<InsertDemand>): Promise<Demand>;
  deleteDemand(id: string, accountId: string): Promise<void>;

  // Demand Comments
  getDemandComments(demandId: string, accountId: string): Promise<(DemandComment & { userName: string })[]>;
  createDemandComment(comment: InsertDemandComment & { userId: string; accountId: string }): Promise<DemandComment>;

  // Events
  getEvents(accountId: string): Promise<Event[]>;
  getEvent(id: string, accountId: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent & { userId: string; accountId: string }): Promise<Event>;
  updateEvent(id: string, accountId: string, event: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: string, accountId: string): Promise<void>;

  // AI Configuration
  getAiConfig(userId: string, accountId: string): Promise<AiConfiguration | undefined>;
  upsertAiConfig(config: InsertAiConfiguration & { userId: string; accountId: string }): Promise<AiConfiguration>;
  setOpenAiApiKey(userId: string, apiKey: string): Promise<void>;
  getDecryptedApiKey(userId: string): Promise<string | null>;
  deleteOpenAiApiKey(userId: string): Promise<void>;
  updateOpenAiApiStatus(userId: string, status: string, message?: string | null, checkedAt?: Date): Promise<void>;

  // AI Conversations
  getAiConversations(accountId: string): Promise<AiConversation[]>;
  createAiConversation(conversation: Omit<AiConversation, "id" | "createdAt">): Promise<AiConversation>;

  // AI Training Examples
  getAiTrainingExamples(accountId: string): Promise<AiTrainingExample[]>;
  getTrainingExamples(accountId: string): Promise<AiTrainingExample[]>;
  getTrainingExample(id: string, accountId: string): Promise<AiTrainingExample | undefined>;
  createTrainingExample(example: InsertAiTrainingExample & { userId: string; accountId: string }): Promise<AiTrainingExample>;
  updateTrainingExample(id: string, accountId: string, example: Partial<InsertAiTrainingExample>): Promise<AiTrainingExample>;
  deleteTrainingExample(id: string, accountId: string): Promise<void>;

  // AI Response Templates
  getResponseTemplates(accountId: string): Promise<AiResponseTemplate[]>;
  getResponseTemplate(id: string, accountId: string): Promise<AiResponseTemplate | undefined>;
  createResponseTemplate(template: InsertAiResponseTemplate & { userId: string; accountId: string }): Promise<AiResponseTemplate>;
  updateResponseTemplate(id: string, accountId: string, template: Partial<InsertAiResponseTemplate>): Promise<AiResponseTemplate>;
  deleteResponseTemplate(id: string, accountId: string): Promise<void>;

  // Marketing Campaigns
  getCampaigns(accountId: string): Promise<MarketingCampaign[]>;
  getCampaign(id: string, accountId: string): Promise<MarketingCampaign | undefined>;
  createCampaign(campaign: InsertMarketingCampaign & { userId: string; accountId: string }): Promise<MarketingCampaign>;
  updateCampaign(id: string, accountId: string, campaign: Partial<InsertMarketingCampaign> & { sentAt?: Date }): Promise<MarketingCampaign>;

  // Notifications
  getNotifications(userId: string, accountId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string, accountId: string): Promise<number>;
  createNotification(notification: InsertNotification & { userId: string }): Promise<Notification>;
  markAsRead(id: string, userId: string, accountId: string): Promise<Notification | null>;
  markAllAsRead(userId: string, accountId: string): Promise<void>;
  deleteNotification(id: string, userId: string, accountId: string): Promise<boolean>;

  // Integrations
  getIntegrations(userId: string, accountId: string): Promise<Integration[]>;
  getIntegration(userId: string, accountId: string, service: string): Promise<Integration | null>;
  upsertIntegration(integration: InsertIntegration & { userId: string; accountId: string }): Promise<Integration>;
  deleteIntegration(id: string, userId: string, accountId: string): Promise<void>;

  // Survey Templates
  getSurveyTemplates(): Promise<SurveyTemplate[]>;
  getSurveyTemplate(id: string): Promise<SurveyTemplate | undefined>;

  // Survey Campaigns
  getSurveyCampaigns(accountId: string): Promise<SurveyCampaign[]>;
  getAllSurveyCampaigns(): Promise<SurveyCampaign[]>;
  getSurveyCampaign(id: string, accountId: string): Promise<SurveyCampaign | undefined>;
  getSurveyCampaignBySlug(slug: string): Promise<SurveyCampaign | undefined>;
  createSurveyCampaign(campaign: InsertSurveyCampaign & { userId: string; accountId: string }): Promise<SurveyCampaign>;
  updateSurveyCampaign(id: string, accountId: string, campaign: Partial<InsertSurveyCampaign>): Promise<SurveyCampaign>;
  deleteSurveyCampaign(id: string, accountId: string): Promise<void>;

  // Survey Landing Pages
  getSurveyLandingPage(campaignId: string, accountId: string): Promise<SurveyLandingPage | undefined>;
  createSurveyLandingPage(landingPage: InsertSurveyLandingPage): Promise<SurveyLandingPage>;
  updateSurveyLandingPage(id: string, accountId: string, landingPage: Partial<InsertSurveyLandingPage>): Promise<SurveyLandingPage>;

  // Survey Responses
  getSurveyResponses(campaignId: string): Promise<SurveyResponse[]>;
  createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse>;

  // Leads
  createLead(lead: InsertLead): Promise<Lead>;
  getLeads(): Promise<Lead[]>;
  deleteLead(id: string): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;

  // API Keys
  getApiKeys(accountId: string): Promise<ApiKey[]>;
  getApiKey(id: string, accountId: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey & { accountId: string }): Promise<{ apiKey: ApiKey; plainKey: string }>;
  deleteApiKey(id: string, accountId: string): Promise<void>;
  validateApiKey(key: string): Promise<ApiKey | null>;
  updateApiKeyUsage(apiKeyId: string, usage: Omit<InsertApiKeyUsage, "apiKeyId">): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Accounts
  async createAccount(account: { name: string }): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();
    return newAccount;
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(accountId: string): Promise<User[]> {
    return await db.select()
      .from(users)
      .where(eq(users.accountId, accountId))
      .orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, accountId: string, userData: Partial<Omit<User, "id" | "password" | "createdAt">>): Promise<User> {
    const [updated] = await db.update(users)
      .set(userData)
      .where(and(
        eq(users.id, id),
        eq(users.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('User not found or access denied');
    return updated;
  }

  async deleteUser(id: string, accountId: string): Promise<void> {
    const result = await db.delete(users)
      .where(and(
        eq(users.id, id),
        eq(users.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('User not found or access denied');
  }

  // Contacts
  async getContacts(accountId: string): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.accountId, accountId)).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: string, accountId: string): Promise<Contact | undefined> {
    const [contact] = await db.select()
      .from(contacts)
      .where(and(
        eq(contacts.id, id),
        eq(contacts.accountId, accountId)
      ));
    return contact || undefined;
  }

  async createContact(contact: InsertContact & { userId: string; accountId: string }): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: string, accountId: string, contact: Partial<InsertContact>): Promise<Contact> {
    const [updated] = await db.update(contacts)
      .set(contact)
      .where(and(
        eq(contacts.id, id),
        eq(contacts.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Contact not found or access denied');
    return updated;
  }

  async deleteContact(id: string, accountId: string): Promise<void> {
    const result = await db.delete(contacts)
      .where(and(
        eq(contacts.id, id),
        eq(contacts.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Contact not found or access denied');
  }

  // Public Support (no authentication required)
  async getCandidateBySlug(slug: string): Promise<{ id: string; accountId: string; name: string; email: string; avatar: string | null; politicalPosition: string | null; electionNumber: string | null; slug: string | null; party: PoliticalParty | null } | undefined> {
    const result = await db.select({
      id: users.id,
      accountId: users.accountId,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      politicalPosition: users.politicalPosition,
      electionNumber: users.electionNumber,
      slug: users.slug,
      party: politicalParties
    })
      .from(users)
      .leftJoin(politicalParties, eq(users.partyId, politicalParties.id))
      .where(eq(users.slug, slug))
      .limit(1);
    
    return result[0] || undefined;
  }

  async createPublicSupporter(slug: string, contact: InsertContact): Promise<Contact> {
    // First, get the candidate by slug to get userId and accountId
    const candidate = await this.getCandidateBySlug(slug);
    if (!candidate) {
      throw new Error('Candidate not found');
    }
    
    // Create contact with automatic source "Politicall"
    const contactData = {
      ...contact,
      userId: candidate.id,
      accountId: candidate.accountId,
      source: "Politicall"
    };
    
    const [newContact] = await db.insert(contacts).values(contactData).returning();
    return newContact;
  }

  // Political Parties
  async getAllParties(): Promise<PoliticalParty[]> {
    return await db.select().from(politicalParties).orderBy(politicalParties.acronym);
  }

  async createParty(party: Omit<PoliticalParty, "id">): Promise<PoliticalParty> {
    const [newParty] = await db.insert(politicalParties).values(party).returning();
    return newParty;
  }

  // Political Alliances
  async getAlliances(accountId: string): Promise<PoliticalAlliance[]> {
    return await db.select().from(politicalAlliances).where(eq(politicalAlliances.accountId, accountId)).orderBy(desc(politicalAlliances.createdAt));
  }

  async createAlliance(alliance: InsertPoliticalAlliance & { userId: string; accountId: string }): Promise<PoliticalAlliance> {
    const [newAlliance] = await db.insert(politicalAlliances).values(alliance).returning();
    return newAlliance;
  }

  async updateAlliance(id: string, accountId: string, alliance: Partial<InsertPoliticalAlliance>): Promise<PoliticalAlliance> {
    const [updated] = await db.update(politicalAlliances)
      .set(alliance)
      .where(and(
        eq(politicalAlliances.id, id),
        eq(politicalAlliances.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Alliance not found or access denied');
    return updated;
  }

  async deleteAlliance(id: string, accountId: string): Promise<void> {
    const result = await db.delete(politicalAlliances)
      .where(and(
        eq(politicalAlliances.id, id),
        eq(politicalAlliances.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Alliance not found or access denied');
  }

  // Demands
  async getDemands(accountId: string): Promise<Demand[]> {
    return await db.select().from(demands).where(eq(demands.accountId, accountId)).orderBy(desc(demands.createdAt));
  }

  async getDemand(id: string, accountId: string): Promise<Demand | undefined> {
    const [demand] = await db.select()
      .from(demands)
      .where(and(
        eq(demands.id, id),
        eq(demands.accountId, accountId)
      ));
    return demand || undefined;
  }

  async createDemand(demand: InsertDemand & { userId: string; accountId: string }): Promise<Demand> {
    // Convert dueDate string to Date if it exists
    const demandData = {
      ...demand,
      dueDate: demand.dueDate ? new Date(demand.dueDate) : null,
    };
    const [newDemand] = await db.insert(demands).values(demandData).returning();
    return newDemand;
  }

  async updateDemand(id: string, accountId: string, demand: Partial<InsertDemand>): Promise<Demand> {
    // Convert dueDate string to Date if it exists
    const updateData = {
      ...demand,
      dueDate: demand.dueDate ? new Date(demand.dueDate) : demand.dueDate === null ? null : undefined,
      updatedAt: new Date()
    };
    const [updated] = await db.update(demands)
      .set(updateData)
      .where(and(
        eq(demands.id, id),
        eq(demands.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Demand not found or access denied');
    return updated;
  }

  async deleteDemand(id: string, accountId: string): Promise<void> {
    const result = await db.delete(demands)
      .where(and(
        eq(demands.id, id),
        eq(demands.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Demand not found or access denied');
  }

  // Demand Comments
  async getDemandComments(demandId: string, accountId: string): Promise<(DemandComment & { userName: string })[]> {
    // First verify if demand belongs to the accountId
    const [demand] = await db.select().from(demands)
      .where(and(
        eq(demands.id, demandId),
        eq(demands.accountId, accountId)
      ));
    
    if (!demand) throw new Error('Demand not found or access denied');
    
    const results = await db
      .select({
        id: demandComments.id,
        demandId: demandComments.demandId,
        userId: demandComments.userId,
        accountId: demandComments.accountId,
        comment: demandComments.comment,
        createdAt: demandComments.createdAt,
        userName: users.name,
      })
      .from(demandComments)
      .leftJoin(users, eq(demandComments.userId, users.id))
      .where(eq(demandComments.demandId, demandId))
      .orderBy(desc(demandComments.createdAt));
    
    return results.map((r) => ({
      ...r,
      userName: r.userName || "Usuário Desconhecido"
    }));
  }

  async createDemandComment(comment: InsertDemandComment & { userId: string; accountId: string }): Promise<DemandComment> {
    const [newComment] = await db.insert(demandComments).values(comment).returning();
    return newComment;
  }

  // Events
  async getEvents(accountId: string): Promise<Event[]> {
    const baseEvents = await db.select().from(events).where(eq(events.accountId, accountId)).orderBy(events.startDate);
    
    // Expandir eventos recorrentes
    const expandedEvents: Event[] = [];
    const today = new Date();
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3); // Gerar eventos até 3 meses no futuro
    
    for (const event of baseEvents) {
      // Adicionar o evento original
      expandedEvents.push(event);
      
      // Se tem recorrência, gerar ocorrências
      if (event.recurrence && event.recurrence !== 'none') {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        const duration = endDate.getTime() - startDate.getTime();
        
        let currentDate = new Date(startDate);
        let occurrenceCount = 0;
        const maxOccurrences = 90; // Limitar a 90 ocorrências para evitar loops infinitos
        
        while (currentDate <= maxDate && occurrenceCount < maxOccurrences) {
          // Avançar para a próxima ocorrência
          switch (event.recurrence) {
            case 'daily':
              currentDate.setDate(currentDate.getDate() + 1);
              break;
            case 'weekly':
              currentDate.setDate(currentDate.getDate() + 7);
              break;
            case 'monthly':
              currentDate.setMonth(currentDate.getMonth() + 1);
              break;
          }
          
          if (currentDate <= maxDate) {
            const occurrenceStart = new Date(currentDate);
            const occurrenceEnd = new Date(currentDate.getTime() + duration);
            
            // Criar uma ocorrência do evento (com um ID único baseado no original + índice)
            expandedEvents.push({
              ...event,
              id: `${event.id}_recurrence_${occurrenceCount}`,
              startDate: occurrenceStart,
              endDate: occurrenceEnd,
            });
            
            occurrenceCount++;
          }
        }
      }
    }
    
    // Ordenar todos os eventos por data de início
    return expandedEvents.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  async getEvent(id: string, accountId: string): Promise<Event | undefined> {
    const [event] = await db.select()
      .from(events)
      .where(and(
        eq(events.id, id),
        eq(events.accountId, accountId)
      ));
    return event || undefined;
  }

  async createEvent(event: InsertEvent & { userId: string; accountId: string }): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: string, accountId: string, event: Partial<InsertEvent>): Promise<Event> {
    const [updated] = await db.update(events)
      .set(event)
      .where(and(
        eq(events.id, id),
        eq(events.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Event not found or access denied');
    return updated;
  }

  async deleteEvent(id: string, accountId: string): Promise<void> {
    const result = await db.delete(events)
      .where(and(
        eq(events.id, id),
        eq(events.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Event not found or access denied');
  }

  // AI Configuration
  async getAiConfig(userId: string, accountId: string): Promise<AiConfiguration | undefined> {
    const [config] = await db.select()
      .from(aiConfigurations)
      .where(and(
        eq(aiConfigurations.userId, userId),
        eq(aiConfigurations.accountId, accountId)
      ));
    return config || undefined;
  }

  async upsertAiConfig(config: InsertAiConfiguration & { userId: string; accountId: string }): Promise<AiConfiguration> {
    const existing = await this.getAiConfig(config.userId, config.accountId);
    
    if (existing) {
      const [updated] = await db.update(aiConfigurations)
        .set({ ...config, updatedAt: new Date() })
        .where(and(
          eq(aiConfigurations.userId, config.userId),
          eq(aiConfigurations.accountId, config.accountId)
        ))
        .returning();
      return updated;
    } else {
      const [newConfig] = await db.insert(aiConfigurations).values(config).returning();
      return newConfig;
    }
  }

  async setOpenAiApiKey(userId: string, apiKey: string): Promise<void> {
    // Encrypt the API key
    const encryptedKey = encryptApiKey(apiKey);
    
    // Get last 4 characters for display
    const last4 = apiKey.length >= 4 ? apiKey.slice(-4) : apiKey;
    
    // Get user to find accountId
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    
    // Update or insert configuration
    const existing = await this.getAiConfig(userId, user.accountId);
    
    if (existing) {
      await db.update(aiConfigurations)
        .set({ 
          openaiApiKey: encryptedKey,
          openaiApiKeyLast4: last4,
          openaiApiKeyUpdatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(aiConfigurations.userId, userId),
          eq(aiConfigurations.accountId, user.accountId)
        ));
    } else {
      await db.insert(aiConfigurations)
        .values({
          accountId: user.accountId,
          userId,
          mode: 'compliance',
          openaiApiKey: encryptedKey,
          openaiApiKeyLast4: last4,
          openaiApiKeyUpdatedAt: new Date()
        });
    }
  }

  async getDecryptedApiKey(userId: string): Promise<string | null> {
    const user = await this.getUser(userId);
    if (!user) return null;
    
    const config = await this.getAiConfig(userId, user.accountId);
    
    if (!config || !config.openaiApiKey) {
      return null;
    }
    
    try {
      return decryptApiKey(config.openaiApiKey);
    } catch (error) {
      console.error('Error decrypting API key:', error);
      return null;
    }
  }

  async deleteOpenAiApiKey(userId: string): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;
    
    const existing = await this.getAiConfig(userId, user.accountId);
    
    if (existing) {
      await db.update(aiConfigurations)
        .set({ 
          openaiApiKey: null,
          openaiApiKeyLast4: null,
          openaiApiKeyUpdatedAt: null,
          updatedAt: new Date()
        })
        .where(and(
          eq(aiConfigurations.userId, userId),
          eq(aiConfigurations.accountId, user.accountId)
        ));
    }
  }

  async updateOpenAiApiStatus(userId: string, status: string, message?: string | null, checkedAt?: Date): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    
    const existing = await this.getAiConfig(userId, user.accountId);
    
    if (existing) {
      await db.update(aiConfigurations)
        .set({
          openaiApiStatus: status,
          openaiApiStatusMessage: message || null,
          openaiApiStatusCheckedAt: checkedAt || new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(aiConfigurations.userId, userId),
          eq(aiConfigurations.accountId, user.accountId)
        ));
    } else {
      await db.insert(aiConfigurations)
        .values({
          accountId: user.accountId,
          userId,
          mode: "compliance",
          openaiApiStatus: status,
          openaiApiStatusMessage: message || null,
          openaiApiStatusCheckedAt: checkedAt || new Date()
        });
    }
  }

  // AI Conversations
  async getAiConversations(accountId: string): Promise<AiConversation[]> {
    return await db.select().from(aiConversations).where(eq(aiConversations.accountId, accountId)).orderBy(desc(aiConversations.createdAt)).limit(50);
  }

  async createAiConversation(conversation: Omit<AiConversation, "id" | "createdAt">): Promise<AiConversation> {
    const [newConversation] = await db.insert(aiConversations).values(conversation).returning();
    return newConversation;
  }

  // AI Training Examples
  async getAiTrainingExamples(accountId: string): Promise<AiTrainingExample[]> {
    return await db.select().from(aiTrainingExamples).where(eq(aiTrainingExamples.accountId, accountId)).orderBy(desc(aiTrainingExamples.createdAt));
  }

  async getTrainingExamples(accountId: string): Promise<AiTrainingExample[]> {
    return await db.select().from(aiTrainingExamples).where(eq(aiTrainingExamples.accountId, accountId)).orderBy(desc(aiTrainingExamples.createdAt));
  }

  async getTrainingExample(id: string, accountId: string): Promise<AiTrainingExample | undefined> {
    const [example] = await db.select()
      .from(aiTrainingExamples)
      .where(and(
        eq(aiTrainingExamples.id, id),
        eq(aiTrainingExamples.accountId, accountId)
      ));
    return example || undefined;
  }

  async createTrainingExample(example: InsertAiTrainingExample & { userId: string; accountId: string }): Promise<AiTrainingExample> {
    const [newExample] = await db.insert(aiTrainingExamples).values(example).returning();
    return newExample;
  }

  async updateTrainingExample(id: string, accountId: string, example: Partial<InsertAiTrainingExample>): Promise<AiTrainingExample> {
    const [updated] = await db.update(aiTrainingExamples)
      .set(example)
      .where(and(
        eq(aiTrainingExamples.id, id),
        eq(aiTrainingExamples.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Training example not found or access denied');
    return updated;
  }

  async deleteTrainingExample(id: string, accountId: string): Promise<void> {
    const result = await db.delete(aiTrainingExamples)
      .where(and(
        eq(aiTrainingExamples.id, id),
        eq(aiTrainingExamples.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Training example not found or access denied');
  }

  // AI Response Templates
  async getResponseTemplates(accountId: string): Promise<AiResponseTemplate[]> {
    return await db.select().from(aiResponseTemplates).where(eq(aiResponseTemplates.accountId, accountId)).orderBy(desc(aiResponseTemplates.createdAt));
  }

  async getResponseTemplate(id: string, accountId: string): Promise<AiResponseTemplate | undefined> {
    const [template] = await db.select()
      .from(aiResponseTemplates)
      .where(and(
        eq(aiResponseTemplates.id, id),
        eq(aiResponseTemplates.accountId, accountId)
      ));
    return template || undefined;
  }

  async createResponseTemplate(template: InsertAiResponseTemplate & { userId: string; accountId: string }): Promise<AiResponseTemplate> {
    const [newTemplate] = await db.insert(aiResponseTemplates).values(template).returning();
    return newTemplate;
  }

  async updateResponseTemplate(id: string, accountId: string, template: Partial<InsertAiResponseTemplate>): Promise<AiResponseTemplate> {
    const [updated] = await db.update(aiResponseTemplates)
      .set(template)
      .where(and(
        eq(aiResponseTemplates.id, id),
        eq(aiResponseTemplates.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Response template not found or access denied');
    return updated;
  }

  async deleteResponseTemplate(id: string, accountId: string): Promise<void> {
    const result = await db.delete(aiResponseTemplates)
      .where(and(
        eq(aiResponseTemplates.id, id),
        eq(aiResponseTemplates.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Response template not found or access denied');
  }

  // Marketing Campaigns
  async getCampaigns(accountId: string): Promise<MarketingCampaign[]> {
    return await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.accountId, accountId)).orderBy(desc(marketingCampaigns.createdAt));
  }

  async getCampaign(id: string, accountId: string): Promise<MarketingCampaign | undefined> {
    const [campaign] = await db.select()
      .from(marketingCampaigns)
      .where(and(
        eq(marketingCampaigns.id, id),
        eq(marketingCampaigns.accountId, accountId)
      ));
    return campaign || undefined;
  }

  async createCampaign(campaign: InsertMarketingCampaign & { userId: string; accountId: string }): Promise<MarketingCampaign> {
    const [newCampaign] = await db.insert(marketingCampaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateCampaign(id: string, accountId: string, campaign: Partial<InsertMarketingCampaign> & { sentAt?: Date }): Promise<MarketingCampaign> {
    const [updated] = await db.update(marketingCampaigns)
      .set(campaign)
      .where(and(
        eq(marketingCampaigns.id, id),
        eq(marketingCampaigns.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Campaign not found or access denied');
    return updated;
  }

  // Notifications
  async getNotifications(userId: string, accountId: string, limit: number = 50): Promise<Notification[]> {
    return await db.select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.accountId, accountId)
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount(userId: string, accountId: string): Promise<number> {
    const result = await db.select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.accountId, accountId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async createNotification(notification: InsertNotification & { userId: string }): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markAsRead(id: string, userId: string, accountId: string): Promise<Notification | null> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.accountId, accountId)
      ))
      .returning();
    return updated || null;
  }

  async markAllAsRead(userId: string, accountId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.accountId, accountId),
        eq(notifications.isRead, false)
      ));
  }

  async deleteNotification(id: string, userId: string, accountId: string): Promise<boolean> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.accountId, accountId)
      ))
      .returning();
    return result.length > 0;
  }

  // Integrations
  async getIntegrations(userId: string, accountId: string): Promise<Integration[]> {
    return await db.select()
      .from(integrations)
      .where(and(
        eq(integrations.userId, userId),
        eq(integrations.accountId, accountId)
      ))
      .orderBy(integrations.service);
  }

  async getIntegration(userId: string, accountId: string, service: string): Promise<Integration | null> {
    const [integration] = await db.select()
      .from(integrations)
      .where(and(
        eq(integrations.userId, userId),
        eq(integrations.accountId, accountId),
        eq(integrations.service, service)
      ));
    return integration || null;
  }

  async upsertIntegration(integration: InsertIntegration & { userId: string; accountId: string }): Promise<Integration> {
    // Check if integration exists
    const existing = await this.getIntegration(integration.userId, integration.accountId, integration.service);
    
    if (existing) {
      // Update existing
      const [updated] = await db.update(integrations)
        .set({
          ...integration,
          updatedAt: new Date()
        })
        .where(eq(integrations.id, existing.id))
        .returning();
      return updated;
    } else {
      // Insert new
      const [newIntegration] = await db.insert(integrations)
        .values(integration)
        .returning();
      return newIntegration;
    }
  }

  async deleteIntegration(id: string, userId: string, accountId: string): Promise<void> {
    await db.delete(integrations)
      .where(and(
        eq(integrations.id, id),
        eq(integrations.userId, userId),
        eq(integrations.accountId, accountId)
      ));
  }

  // Survey Templates
  async getSurveyTemplates(): Promise<SurveyTemplate[]> {
    return await db.select()
      .from(surveyTemplates)
      .orderBy(surveyTemplates.order);
  }

  async getSurveyTemplate(id: string): Promise<SurveyTemplate | undefined> {
    const [template] = await db.select()
      .from(surveyTemplates)
      .where(eq(surveyTemplates.id, id));
    return template || undefined;
  }

  // Survey Campaigns
  async getSurveyCampaigns(accountId: string): Promise<SurveyCampaign[]> {
    return await db.select()
      .from(surveyCampaigns)
      .where(eq(surveyCampaigns.accountId, accountId))
      .orderBy(desc(surveyCampaigns.createdAt));
  }

  async getAllSurveyCampaigns(): Promise<SurveyCampaign[]> {
    return await db.select()
      .from(surveyCampaigns)
      .orderBy(desc(surveyCampaigns.createdAt));
  }

  async getSurveyCampaign(id: string, accountId: string): Promise<SurveyCampaign | undefined> {
    const [campaign] = await db.select()
      .from(surveyCampaigns)
      .where(and(
        eq(surveyCampaigns.id, id),
        eq(surveyCampaigns.accountId, accountId)
      ));
    return campaign || undefined;
  }

  async getSurveyCampaignBySlug(slug: string): Promise<SurveyCampaign | undefined> {
    const [campaign] = await db.select()
      .from(surveyCampaigns)
      .where(eq(surveyCampaigns.slug, slug));
    return campaign || undefined;
  }

  async createSurveyCampaign(campaign: InsertSurveyCampaign & { userId: string; accountId: string }): Promise<SurveyCampaign> {
    const values = {
      ...campaign,
      startDate: campaign.startDate ? (typeof campaign.startDate === 'string' ? new Date(campaign.startDate) : campaign.startDate) : null,
      endDate: campaign.endDate ? (typeof campaign.endDate === 'string' ? new Date(campaign.endDate) : campaign.endDate) : null,
    };

    const [newCampaign] = await db.insert(surveyCampaigns)
      .values(values)
      .returning();
    return newCampaign;
  }

  async updateSurveyCampaign(id: string, accountId: string, campaign: Partial<InsertSurveyCampaign>): Promise<SurveyCampaign> {
    const values: any = {
      ...campaign,
      updatedAt: new Date()
    };

    if (campaign.startDate !== undefined) {
      values.startDate = campaign.startDate ? (typeof campaign.startDate === 'string' ? new Date(campaign.startDate) : campaign.startDate) : null;
    }
    if (campaign.endDate !== undefined) {
      values.endDate = campaign.endDate ? (typeof campaign.endDate === 'string' ? new Date(campaign.endDate) : campaign.endDate) : null;
    }

    const [updated] = await db.update(surveyCampaigns)
      .set(values)
      .where(and(
        eq(surveyCampaigns.id, id),
        eq(surveyCampaigns.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Survey campaign not found or access denied');
    return updated;
  }

  async deleteSurveyCampaign(id: string, accountId: string): Promise<void> {
    const result = await db.delete(surveyCampaigns)
      .where(and(
        eq(surveyCampaigns.id, id),
        eq(surveyCampaigns.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Survey campaign not found or access denied');
  }

  // Survey Landing Pages
  async getSurveyLandingPage(campaignId: string, accountId: string): Promise<SurveyLandingPage | undefined> {
    // First verify that campaign belongs to the accountId
    const [campaign] = await db.select()
      .from(surveyCampaigns)
      .where(and(
        eq(surveyCampaigns.id, campaignId),
        eq(surveyCampaigns.accountId, accountId)
      ));
    
    if (!campaign) {
      throw new Error('Campaign not found or access denied');
    }
    
    const [landingPage] = await db.select()
      .from(surveyLandingPages)
      .where(eq(surveyLandingPages.campaignId, campaignId));
    return landingPage || undefined;
  }

  async createSurveyLandingPage(landingPage: InsertSurveyLandingPage): Promise<SurveyLandingPage> {
    const [newLandingPage] = await db.insert(surveyLandingPages)
      .values(landingPage)
      .returning();
    return newLandingPage;
  }

  async updateSurveyLandingPage(id: string, accountId: string, landingPage: Partial<InsertSurveyLandingPage>): Promise<SurveyLandingPage> {
    // First fetch to validate accountId via campaign
    const [existing] = await db.select({
      id: surveyLandingPages.id,
      campaignId: surveyLandingPages.campaignId,
      accountId: surveyCampaigns.accountId,
    })
    .from(surveyLandingPages)
    .leftJoin(surveyCampaigns, eq(surveyLandingPages.campaignId, surveyCampaigns.id))
    .where(eq(surveyLandingPages.id, id));
    
    if (!existing || existing.accountId !== accountId) {
      throw new Error('Survey landing page not found or access denied');
    }
    
    const [updated] = await db.update(surveyLandingPages)
      .set(landingPage)
      .where(eq(surveyLandingPages.id, id))
      .returning();
    
    if (!updated) throw new Error('Update failed');
    return updated;
  }

  // Survey Responses
  async getSurveyResponses(campaignId: string): Promise<SurveyResponse[]> {
    return await db.select()
      .from(surveyResponses)
      .where(eq(surveyResponses.campaignId, campaignId))
      .orderBy(desc(surveyResponses.submittedAt));
  }

  async createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse> {
    const [newResponse] = await db.insert(surveyResponses)
      .values(response)
      .returning();
    return newResponse;
  }

  // Leads
  async createLead(lead: InsertLead): Promise<Lead> {
    const [newLead] = await db.insert(leads)
      .values(lead)
      .returning();
    return newLead;
  }

  async getLeads(): Promise<Lead[]> {
    return await db.select()
      .from(leads)
      .orderBy(desc(leads.createdAt));
  }

  async deleteLead(id: string): Promise<void> {
    const result = await db.delete(leads)
      .where(eq(leads.id, id))
      .returning();
    if (result.length === 0) throw new Error('Lead not found');
  }

  async deleteLeads(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(leads)
      .where(inArray(leads.id, ids));
  }

  // API Keys
  private generateApiKey(): string {
    // Generate a secure random API key with prefix "pk_" (production key)
    const randomBytes = crypto.randomBytes(32);
    const key = randomBytes.toString('base64url');
    return `pk_${key}`;
  }

  async getApiKeys(accountId: string): Promise<ApiKey[]> {
    return await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.accountId, accountId),
        eq(apiKeys.isActive, true)
      ))
      .orderBy(desc(apiKeys.createdAt));
  }

  async getApiKey(id: string, accountId: string): Promise<ApiKey | undefined> {
    const [key] = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, id),
        eq(apiKeys.accountId, accountId)
      ));
    return key;
  }

  async createApiKey(key: InsertApiKey & { accountId: string }): Promise<{ apiKey: ApiKey; plainKey: string }> {
    // Generate the full API key
    const plainKey = this.generateApiKey();
    
    // Hash the key for storage
    const hashedKey = await bcrypt.hash(plainKey, 10);
    
    // Extract prefix for display (first 8 chars after "pk_")
    const keyPrefix = plainKey.substring(0, 11) + "...";
    
    // Create expiration date (1 year from now by default)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    const [newKey] = await db.insert(apiKeys)
      .values({
        ...key,
        keyPrefix,
        hashedKey,
        expiresAt,
      })
      .returning();
    
    return { apiKey: newKey, plainKey };
  }

  async deleteApiKey(id: string, accountId: string): Promise<void> {
    const result = await db.update(apiKeys)
      .set({ isActive: false })
      .where(and(
        eq(apiKeys.id, id),
        eq(apiKeys.accountId, accountId)
      ))
      .returning();
    
    if (result.length === 0) {
      throw new Error('API key not found or access denied');
    }
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    // Get all active API keys
    const activeKeys = await db.select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.isActive, true)
      ));
    
    // Check each key
    for (const apiKey of activeKeys) {
      const isValid = await bcrypt.compare(key, apiKey.hashedKey);
      if (isValid) {
        // Check if expired
        if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
          return null;
        }
        
        // Update last used timestamp
        await db.update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, apiKey.id));
        
        return apiKey;
      }
    }
    
    return null;
  }

  async updateApiKeyUsage(apiKeyId: string, usage: Omit<InsertApiKeyUsage, "apiKeyId">): Promise<void> {
    await db.insert(apiKeyUsage)
      .values({
        ...usage,
        apiKeyId,
      });
  }
}

export const storage = new DatabaseStorage();
