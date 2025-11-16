// Storage implementation using blueprint javascript_database
import { 
  users, contacts, politicalParties, politicalAlliances, demands, demandComments, events,
  aiConfigurations, aiConversations, marketingCampaigns, notifications,
  type User, type InsertUser, type Contact, type InsertContact,
  type PoliticalParty, type PoliticalAlliance, type InsertPoliticalAlliance,
  type Demand, type InsertDemand, type DemandComment, type InsertDemandComment,
  type Event, type InsertEvent, type AiConfiguration, type InsertAiConfiguration,
  type AiConversation, type MarketingCampaign, type InsertMarketingCampaign,
  type Notification, type InsertNotification
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, user: Partial<Omit<User, "id" | "password" | "createdAt">>): Promise<User>;

  // Contacts
  getContacts(userId: string): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact & { userId: string }): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: string): Promise<void>;

  // Political Parties
  getAllParties(): Promise<PoliticalParty[]>;
  createParty(party: Omit<PoliticalParty, "id">): Promise<PoliticalParty>;

  // Political Alliances
  getAlliances(userId: string): Promise<PoliticalAlliance[]>;
  createAlliance(alliance: InsertPoliticalAlliance & { userId: string }): Promise<PoliticalAlliance>;
  updateAlliance(id: string, alliance: Partial<InsertPoliticalAlliance>): Promise<PoliticalAlliance>;
  deleteAlliance(id: string): Promise<void>;

  // Demands
  getDemands(userId: string): Promise<Demand[]>;
  getDemand(id: string): Promise<Demand | undefined>;
  createDemand(demand: InsertDemand & { userId: string }): Promise<Demand>;
  updateDemand(id: string, demand: Partial<InsertDemand>): Promise<Demand>;
  deleteDemand(id: string): Promise<void>;

  // Demand Comments
  getDemandComments(demandId: string): Promise<(DemandComment & { userName: string })[]>;
  createDemandComment(comment: InsertDemandComment & { userId: string }): Promise<DemandComment>;

  // Events
  getEvents(userId: string): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  createEvent(event: InsertEvent & { userId: string }): Promise<Event>;
  updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: string): Promise<void>;

  // AI Configuration
  getAiConfig(userId: string): Promise<AiConfiguration | undefined>;
  upsertAiConfig(config: InsertAiConfiguration & { userId: string }): Promise<AiConfiguration>;

  // AI Conversations
  getAiConversations(userId: string): Promise<AiConversation[]>;
  createAiConversation(conversation: Omit<AiConversation, "id" | "createdAt">): Promise<AiConversation>;

  // Marketing Campaigns
  getCampaigns(userId: string): Promise<MarketingCampaign[]>;
  getCampaign(id: string): Promise<MarketingCampaign | undefined>;
  createCampaign(campaign: InsertMarketingCampaign & { userId: string }): Promise<MarketingCampaign>;
  updateCampaign(id: string, campaign: Partial<InsertMarketingCampaign> & { sentAt?: Date }): Promise<MarketingCampaign>;

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification & { userId: string }): Promise<Notification>;
  markAsRead(id: string, userId: string): Promise<Notification | null>;
  markAllAsRead(userId: string): Promise<void>;
  deleteNotification(id: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
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

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, userData: Partial<Omit<User, "id" | "password" | "createdAt">>): Promise<User> {
    const [updated] = await db.update(users).set(userData).where(eq(users.id, id)).returning();
    return updated;
  }

  // Contacts
  async getContacts(userId: string): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.userId, userId)).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact || undefined;
  }

  async createContact(contact: InsertContact & { userId: string }): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact> {
    const [updated] = await db.update(contacts).set(contact).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
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
  async getAlliances(userId: string): Promise<PoliticalAlliance[]> {
    return await db.select().from(politicalAlliances).where(eq(politicalAlliances.userId, userId)).orderBy(desc(politicalAlliances.createdAt));
  }

  async createAlliance(alliance: InsertPoliticalAlliance & { userId: string }): Promise<PoliticalAlliance> {
    const [newAlliance] = await db.insert(politicalAlliances).values(alliance).returning();
    return newAlliance;
  }

  async updateAlliance(id: string, alliance: Partial<InsertPoliticalAlliance>): Promise<PoliticalAlliance> {
    const [updated] = await db.update(politicalAlliances).set(alliance).where(eq(politicalAlliances.id, id)).returning();
    return updated;
  }

  async deleteAlliance(id: string): Promise<void> {
    await db.delete(politicalAlliances).where(eq(politicalAlliances.id, id));
  }

  // Demands
  async getDemands(userId: string): Promise<Demand[]> {
    return await db.select().from(demands).where(eq(demands.userId, userId)).orderBy(desc(demands.createdAt));
  }

  async getDemand(id: string): Promise<Demand | undefined> {
    const [demand] = await db.select().from(demands).where(eq(demands.id, id));
    return demand || undefined;
  }

  async createDemand(demand: InsertDemand & { userId: string }): Promise<Demand> {
    // Convert dueDate string to Date if it exists
    const demandData = {
      ...demand,
      dueDate: demand.dueDate ? new Date(demand.dueDate) : null,
    };
    const [newDemand] = await db.insert(demands).values(demandData).returning();
    return newDemand;
  }

  async updateDemand(id: string, demand: Partial<InsertDemand>): Promise<Demand> {
    // Convert dueDate string to Date if it exists
    const updateData = {
      ...demand,
      dueDate: demand.dueDate ? new Date(demand.dueDate) : demand.dueDate === null ? null : undefined,
      updatedAt: new Date()
    };
    const [updated] = await db.update(demands).set(updateData).where(eq(demands.id, id)).returning();
    return updated;
  }

  async deleteDemand(id: string): Promise<void> {
    await db.delete(demands).where(eq(demands.id, id));
  }

  // Demand Comments
  async getDemandComments(demandId: string): Promise<(DemandComment & { userName: string })[]> {
    const results = await db
      .select({
        id: demandComments.id,
        demandId: demandComments.demandId,
        userId: demandComments.userId,
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

  async createDemandComment(comment: InsertDemandComment & { userId: string }): Promise<DemandComment> {
    const [newComment] = await db.insert(demandComments).values(comment).returning();
    return newComment;
  }

  // Events
  async getEvents(userId: string): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.userId, userId)).orderBy(events.startDate);
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async createEvent(event: InsertEvent & { userId: string }): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: string, event: Partial<InsertEvent>): Promise<Event> {
    const [updated] = await db.update(events).set(event).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  // AI Configuration
  async getAiConfig(userId: string): Promise<AiConfiguration | undefined> {
    const [config] = await db.select().from(aiConfigurations).where(eq(aiConfigurations.userId, userId));
    return config || undefined;
  }

  async upsertAiConfig(config: InsertAiConfiguration & { userId: string }): Promise<AiConfiguration> {
    const existing = await this.getAiConfig(config.userId);
    
    if (existing) {
      const [updated] = await db.update(aiConfigurations)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(aiConfigurations.userId, config.userId))
        .returning();
      return updated;
    } else {
      const [newConfig] = await db.insert(aiConfigurations).values(config).returning();
      return newConfig;
    }
  }

  // AI Conversations
  async getAiConversations(userId: string): Promise<AiConversation[]> {
    return await db.select().from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.createdAt)).limit(50);
  }

  async createAiConversation(conversation: Omit<AiConversation, "id" | "createdAt">): Promise<AiConversation> {
    const [newConversation] = await db.insert(aiConversations).values(conversation).returning();
    return newConversation;
  }

  // Marketing Campaigns
  async getCampaigns(userId: string): Promise<MarketingCampaign[]> {
    return await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.userId, userId)).orderBy(desc(marketingCampaigns.createdAt));
  }

  async getCampaign(id: string): Promise<MarketingCampaign | undefined> {
    const [campaign] = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, id));
    return campaign || undefined;
  }

  async createCampaign(campaign: InsertMarketingCampaign & { userId: string }): Promise<MarketingCampaign> {
    const [newCampaign] = await db.insert(marketingCampaigns).values(campaign).returning();
    return newCampaign;
  }

  async updateCampaign(id: string, campaign: Partial<InsertMarketingCampaign> & { sentAt?: Date }): Promise<MarketingCampaign> {
    const [updated] = await db.update(marketingCampaigns).set(campaign).where(eq(marketingCampaigns.id, id)).returning();
    return updated;
  }

  // Notifications
  async getNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    return await db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async createNotification(notification: InsertNotification & { userId: string }): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ))
      .returning();
    return updated || null;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
