// Storage implementation using blueprint javascript_database
import {
  accounts, users, contacts, politicalParties, politicalAlliances, allianceInvites, demands, demandComments, events,
  aiConfigurations, aiConversations, aiTrainingExamples, aiResponseTemplates, 
  marketingCampaigns, campaignRecipients, campaignEvents, notifications, integrations, googleCalendarIntegrations, surveyTemplates, surveyCampaigns, surveyLandingPages, surveyResponses, leads,
  apiKeys, apiKeyUsage, contactLists, contactListMembers, messageTemplates, campaignExports,
  type Account, type User, type InsertUser, type Contact, type InsertContact,
  type PoliticalParty, type PoliticalAlliance, type InsertPoliticalAlliance,
  type AllianceInvite, type InsertAllianceInvite,
  type Demand, type InsertDemand, type DemandComment, type InsertDemandComment,
  type Event, type InsertEvent, type AiConfiguration, type InsertAiConfiguration,
  type AiConversation, type AiTrainingExample, type InsertAiTrainingExample,
  type AiResponseTemplate, type InsertAiResponseTemplate,
  type MarketingCampaign, type InsertMarketingCampaign,
  type CampaignRecipient, type InsertCampaignRecipient,
  type CampaignEvent, type InsertCampaignEvent,
  type Notification, type InsertNotification,
  type Integration, type InsertIntegration,
  type GoogleCalendarIntegration, type InsertGoogleCalendarIntegration,
  type SurveyTemplate, type InsertSurveyTemplate,
  type SurveyCampaign, type InsertSurveyCampaign,
  type SurveyLandingPage, type InsertSurveyLandingPage,
  type SurveyResponse, type InsertSurveyResponse,
  type Lead, type InsertLead,
  type ApiKey, type InsertApiKey,
  type ApiKeyUsage, type InsertApiKeyUsage,
  type ContactList, type InsertContactList,
  type ContactListMember, type InsertContactListMember,
  type MessageTemplate, type InsertMessageTemplate,
  type CampaignExport, type InsertCampaignExport,
  petitions, petitionSignatures, petitionCampaigns, petitionCampaignLogs,
  petitionMessageTemplates, linkBioPages, linkTreePages,
  channelConnections, attConversations, attMessages, attAttachments,
  quickReplies, attSectors, sectorMembers, attQueues, attQueueMembers, attNotes, attAutomation, attLabels, attContactLabels, attConversationLabels, attImportJobs, integrationLogs, attConversationEvents, attTransfers,
  type Petition, type InsertPetition,
  type PetitionSignature, type InsertPetitionSignature,
  type PetitionCampaign, type InsertPetitionCampaign,
  type PetitionCampaignLog, type InsertPetitionCampaignLog,
  type PetitionMessageTemplate, type InsertPetitionMessageTemplate,
  type LinkBioPage, type InsertLinkBioPage,
  type LinkTreePage, type InsertLinkTreePage,
  type ChannelConnection, type InsertChannelConnection,
  type AttConversation, type InsertAttConversation,
  type AttMessage, type InsertAttMessage,
  type AttAttachment, type InsertAttAttachment,
  type QuickReply, type InsertQuickReply,
  type AttSector, type InsertAttSector,
  type AttQueue, type InsertAttQueue,
  type AttQueueMember, type InsertAttQueueMember,
  type AttNote, type InsertAttNote,
  type AttAutomation, type InsertAttAutomation,
  type AttLabel, type InsertAttLabel,
  type AttImportJob, type InsertAttImportJob,
  type IntegrationLog, type InsertIntegrationLog,
  type AttConversationEvent, type InsertAttConversationEvent,
  type AttTransfer, type InsertAttTransfer
} from "@shared/schema";
import { ensureAttendanceMessageCreatedAt } from "./services/attendance-message-timestamp";
import { decryptAiConfigProviderSecrets, encryptAiConfigProviderSecrets } from "./services/ai-config-secrets";
import { db } from "./db";
import { eq, desc, and, count, inArray, sql, or, ilike, gte, lte, lt, asc, notInArray } from "drizzle-orm";
import type { PaginationParams } from "@shared/pagination";
import { encryptApiKey, decryptApiKey } from "./crypto";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { normalizeText } from "@shared/text-normalization";

export type CampaignReportFilters = {
  from?: Date;
  to?: Date;
  channel?: string;
  status?: string;
  creatorId?: string;
};

export interface IStorage {
  // Accounts
  createAccount(account: { name: string; salesperson?: string | null; planValue?: string | null }): Promise<Account>;
  getAllAccounts(): Promise<Account[]>;
  updateAccountPaymentStatus(id: string, paymentStatus: string, commissionPaid: boolean): Promise<Account>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAccountAdmin(accountId: string): Promise<User | undefined>;
  createUser(user: InsertUser & { accountId: string }): Promise<User>;
  getAllUsers(accountId: string): Promise<User[]>;
  updateUser(id: string, accountId: string, user: Partial<Omit<User, "id" | "password" | "createdAt">>): Promise<User>;
  deleteUser(id: string, accountId: string): Promise<void>;

  // Contacts
  getContacts(accountId: string): Promise<Contact[]>;
  getContactsByUser(accountId: string, userId: string): Promise<Contact[]>;
  getContact(id: string, accountId: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact & { userId: string; accountId: string }): Promise<Contact>;
  updateContact(id: string, accountId: string, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: string, accountId: string): Promise<void>;
  
  // Public Support (no authentication required)
  getCandidateBySlug(slug: string): Promise<{ id: string; accountId: string; name: string; email: string; avatar: string | null; landingBackground: string | null; politicalPosition: string | null; electionNumber: string | null; slug: string | null; party: PoliticalParty | null } | undefined>;
  createPublicSupporter(slug: string, contact: InsertContact): Promise<Contact>;
  findAvailableSlug(baseSlug: string): Promise<string>;

  // Political Parties
  getAllParties(): Promise<PoliticalParty[]>;
  createParty(party: Omit<PoliticalParty, "id">): Promise<PoliticalParty>;

  // Political Alliances
  getAlliances(accountId: string): Promise<PoliticalAlliance[]>;
  createAlliance(alliance: InsertPoliticalAlliance & { userId: string; accountId: string }): Promise<PoliticalAlliance>;
  updateAlliance(id: string, accountId: string, alliance: Partial<InsertPoliticalAlliance>): Promise<PoliticalAlliance>;
  deleteAlliance(id: string, accountId: string): Promise<void>;

  // Alliance Invites
  getAllianceInvites(accountId: string): Promise<AllianceInvite[]>;
  createAllianceInvite(invite: InsertAllianceInvite & { userId: string; accountId: string; token: string }): Promise<AllianceInvite>;
  getAllianceInviteByToken(token: string): Promise<AllianceInvite | undefined>;
  acceptAllianceInvite(token: string, data: { inviteeName: string; inviteeEmail?: string; inviteePhone?: string; inviteePosition?: string; inviteeState?: string; inviteeCity?: string; inviteeNotes?: string }): Promise<AllianceInvite>;
  rejectAllianceInvite(token: string): Promise<AllianceInvite>;
  deleteAllianceInvite(id: string, accountId: string): Promise<void>;

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

  // Paginated list queries
  getCampaignsPaginated(accountId: string, params: PaginationParams & { search?: string; type?: string; allowedTypes?: string[] }): Promise<{ data: MarketingCampaign[]; total: number }>;
  getCampaignStatusCounts(accountId: string, params: { search?: string; type?: string; allowedTypes?: string[] }): Promise<{ status: string; count: number }[]>;
  getCampaignRecipientsPaginated(campaignId: string, accountId: string, params: PaginationParams & { statuses?: string[] }): Promise<{ data: CampaignRecipient[]; total: number }>;
  getContactsPaginated(accountId: string, params: PaginationParams & { search?: string; userId?: string }): Promise<{ data: Contact[]; total: number }>;
  getAllUsersPaginated(accountId: string, params: PaginationParams & { search?: string }): Promise<{ data: User[]; total: number }>;

  // Marketing Campaigns
  getCampaigns(accountId: string): Promise<MarketingCampaign[]>;
  getCampaign(id: string, accountId: string): Promise<MarketingCampaign | undefined>;
  createCampaign(campaign: InsertMarketingCampaign & { userId: string; accountId: string }): Promise<MarketingCampaign>;
  updateCampaign(id: string, accountId: string, campaign: Partial<InsertMarketingCampaign> & { sentAt?: Date }): Promise<MarketingCampaign>;
  deleteCampaign(id: string, accountId: string): Promise<void>;

  // Campaign recipients (per-recipient tracking)
  createCampaignRecipients(recipients: (InsertCampaignRecipient & { accountId: string; campaignId: string })[]): Promise<CampaignRecipient[]>;
  getCampaignRecipients(campaignId: string, accountId: string): Promise<CampaignRecipient[]>;
  getCampaignRecipientByProviderMessageId(providerMessageId: string): Promise<CampaignRecipient | undefined>;
  updateCampaignRecipient(id: string, accountId: string, data: Partial<InsertCampaignRecipient> & { sentAt?: Date; deliveredAt?: Date }): Promise<CampaignRecipient>;
  deleteCampaignRecipients(campaignId: string, accountId: string): Promise<void>;

  // Campaign audit events (immutable)
  createCampaignEvent(event: InsertCampaignEvent & { accountId: string; campaignId: string }): Promise<CampaignEvent>;
  getCampaignEvents(campaignId: string, accountId: string): Promise<CampaignEvent[]>;
  getActiveCampaigns(): Promise<MarketingCampaign[]>;
  getCampaignProgress(accountId: string): Promise<Record<string, { total: number; sent: number; failed: number; pending: number; cancelled: number }>>;

  // Phase 5 — reports & exports
  getCampaignsReportSummary(accountId: string, filters?: CampaignReportFilters): Promise<{ campaigns: MarketingCampaign[]; recipients: CampaignRecipient[] }>;
  getCampaignReportData(campaignId: string, accountId: string): Promise<{ campaign: MarketingCampaign; recipients: CampaignRecipient[]; events: CampaignEvent[] } | undefined>;
  getRecipientsForExport(campaignId: string, accountId: string, opts?: { status?: string; channel?: string }): Promise<CampaignRecipient[]>;
  createCampaignExport(data: InsertCampaignExport & { accountId: string }): Promise<CampaignExport>;
  getCampaignExports(accountId: string, campaignId?: string): Promise<CampaignExport[]>;

  // Contact lists (audience segmentation — fixed & dynamic)
  getContactLists(accountId: string): Promise<ContactList[]>;
  getContactList(id: string, accountId: string): Promise<ContactList | undefined>;
  createContactList(list: InsertContactList & { accountId: string; userId: string }): Promise<ContactList>;
  updateContactList(id: string, accountId: string, data: Partial<InsertContactList>): Promise<ContactList>;
  deleteContactList(id: string, accountId: string): Promise<void>;
  getContactListMembers(listId: string, accountId: string): Promise<ContactListMember[]>;
  setContactListMembers(listId: string, accountId: string, contactIds: string[]): Promise<ContactListMember[]>;

  // Message templates (saved SMS/email/WhatsApp models)
  getMessageTemplates(accountId: string, channel?: string): Promise<MessageTemplate[]>;
  getMessageTemplate(id: string, accountId: string): Promise<MessageTemplate | undefined>;
  createMessageTemplate(tpl: InsertMessageTemplate & { accountId: string; userId: string }): Promise<MessageTemplate>;
  updateMessageTemplate(id: string, accountId: string, data: Partial<InsertMessageTemplate>): Promise<MessageTemplate>;
  deleteMessageTemplate(id: string, accountId: string): Promise<void>;

  // Notifications
  getNotifications(userId: string, accountId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string, accountId: string): Promise<number>;
  createNotification(notification: InsertNotification & { userId: string; accountId: string }): Promise<Notification>;
  markAsRead(id: string, userId: string, accountId: string): Promise<Notification | null>;
  markAllAsRead(userId: string, accountId: string): Promise<void>;
  deleteNotification(id: string, userId: string, accountId: string): Promise<boolean>;

  // Integrations
  getIntegrations(userId: string, accountId: string): Promise<Integration[]>;
  getIntegration(userId: string, accountId: string, service: string): Promise<Integration | null>;
  upsertIntegration(integration: InsertIntegration & { userId: string; accountId: string }): Promise<Integration>;
  deleteIntegration(id: string, userId: string, accountId: string): Promise<void>;
  
  // Google Calendar Integration
  getGoogleCalendarIntegration(accountId: string): Promise<GoogleCalendarIntegration | null>;
  upsertGoogleCalendarIntegration(integration: InsertGoogleCalendarIntegration & { userId: string; accountId: string }): Promise<GoogleCalendarIntegration>;
  deleteGoogleCalendarIntegration(accountId: string): Promise<void>;

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
  getUnreadLeadsCount(): Promise<number>;
  markLeadsAsRead(): Promise<void>;
  deleteLead(id: string): Promise<void>;
  deleteLeads(ids: string[]): Promise<void>;

  // API Keys
  getApiKeys(accountId: string): Promise<ApiKey[]>;
  getApiKey(id: string, accountId: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey & { accountId: string }): Promise<{ apiKey: ApiKey; plainKey: string }>;
  deleteApiKey(id: string, accountId: string): Promise<void>;
  validateApiKey(key: string): Promise<ApiKey | null>;
  updateApiKeyUsage(apiKeyId: string, usage: Omit<InsertApiKeyUsage, "apiKeyId">): Promise<void>;

  // Petitions
  getPetitions(accountId: string): Promise<Petition[]>;
  getPetition(id: string, accountId: string): Promise<Petition | undefined>;
  getPetitionBySlug(slug: string): Promise<Petition | undefined>;
  createPetition(petition: InsertPetition & { userId: string; accountId: string }): Promise<Petition>;
  updatePetition(id: string, accountId: string, petition: Partial<InsertPetition>): Promise<Petition>;
  deletePetition(id: string, accountId: string): Promise<void>;
  incrementPetitionViews(id: string): Promise<void>;

  // Petition Signatures
  getPetitionSignatures(petitionId: string, accountId: string): Promise<PetitionSignature[]>;
  getPetitionSignatureCount(petitionId: string): Promise<number>;
  getPetitionSignatureByEmail(petitionId: string, email: string): Promise<PetitionSignature | undefined>;
  getPetitionSignatureByCpf(petitionId: string, cpf: string): Promise<PetitionSignature | undefined>;
  createPetitionSignature(signature: InsertPetitionSignature & { ipAddress?: string | null }): Promise<PetitionSignature>;
  deletePetitionSignature(id: string, accountId: string): Promise<void>;

  // Petition Campaigns
  getPetitionCampaigns(accountId: string): Promise<PetitionCampaign[]>;
  getPetitionCampaign(id: string, accountId: string): Promise<PetitionCampaign | undefined>;
  createPetitionCampaign(campaign: InsertPetitionCampaign & { userId: string; accountId: string }): Promise<PetitionCampaign>;
  updatePetitionCampaign(id: string, accountId: string, campaign: Partial<InsertPetitionCampaign>): Promise<PetitionCampaign>;
  deletePetitionCampaign(id: string, accountId: string): Promise<void>;

  // Petition Campaign Logs
  getPetitionCampaignLogs(campaignId: string, accountId: string): Promise<PetitionCampaignLog[]>;
  createPetitionCampaignLog(log: InsertPetitionCampaignLog & { accountId: string }): Promise<PetitionCampaignLog>;

  // Petition Message Templates
  getPetitionMessageTemplates(accountId: string): Promise<PetitionMessageTemplate[]>;
  getPetitionMessageTemplate(id: string, accountId: string): Promise<PetitionMessageTemplate | undefined>;
  createPetitionMessageTemplate(template: InsertPetitionMessageTemplate & { userId: string; accountId: string }): Promise<PetitionMessageTemplate>;
  updatePetitionMessageTemplate(id: string, accountId: string, template: Partial<InsertPetitionMessageTemplate>): Promise<PetitionMessageTemplate>;
  deletePetitionMessageTemplate(id: string, accountId: string): Promise<void>;

  // Link Bio Pages
  getLinkBioPages(accountId: string): Promise<LinkBioPage[]>;
  getLinkBioPage(id: string, accountId: string): Promise<LinkBioPage | undefined>;
  getLinkBioPageBySlug(slug: string): Promise<LinkBioPage | undefined>;
  createLinkBioPage(page: InsertLinkBioPage & { userId: string; accountId: string }): Promise<LinkBioPage>;
  updateLinkBioPage(id: string, accountId: string, page: Partial<InsertLinkBioPage>): Promise<LinkBioPage>;
  deleteLinkBioPage(id: string, accountId: string): Promise<void>;
  incrementLinkBioViews(id: string): Promise<void>;

  // Link Tree Pages
  getLinkTreePages(accountId: string): Promise<LinkTreePage[]>;
  getLinkTreePage(id: string, accountId: string): Promise<LinkTreePage | undefined>;
  getLinkTreePageBySlug(slug: string): Promise<LinkTreePage | undefined>;
  createLinkTreePage(page: InsertLinkTreePage & { userId: string; accountId: string }): Promise<LinkTreePage>;
  updateLinkTreePage(id: string, accountId: string, page: Partial<InsertLinkTreePage>): Promise<LinkTreePage>;
  deleteLinkTreePage(id: string, accountId: string): Promise<void>;
  incrementLinkTreeViews(id: string): Promise<void>;

  // Attendance — Channel Connections
  getChannelConnections(accountId: string): Promise<ChannelConnection[]>;
  getChannelConnection(id: string, accountId: string | undefined): Promise<ChannelConnection | null>;
  createChannelConnection(data: InsertChannelConnection & { accountId: string }): Promise<ChannelConnection>;
  updateChannelConnection(id: string, accountId: string, data: Partial<ChannelConnection>): Promise<ChannelConnection>;
  deleteChannelConnection(id: string, accountId: string): Promise<void>;
  getIntegrationByAccount(accountId: string, service: string): Promise<Integration | null>;

  // Attendance — Conversations
  getConversations(accountId: string, filters?: {
    channel?: string;
    status?: string;
    search?: string;
    assignedUserId?: string;
    sectorId?: string;
    queueId?: string;
    mode?: string;
    priority?: string;
    from?: string;
    to?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AttConversation[]>;
  getConversation(id: string, accountId: string): Promise<AttConversation | null>;
  getConversationByExternal(accountId: string, externalThreadId: string): Promise<AttConversation | null>;
  createConversation(data: Partial<InsertAttConversation> & { accountId: string; channel: string }): Promise<AttConversation>;
  updateConversation(id: string, accountId: string, data: Partial<AttConversation>): Promise<AttConversation>;
  assumeConversation(id: string, accountId: string, userId: string, assignedByUserId: string): Promise<{ conversation: AttConversation | null; conflict: AttConversation | null }>;
  releaseConversation(id: string, accountId: string, data?: { status?: string; metadata?: Record<string, any> }): Promise<AttConversation>;
  getOpenConversationCounts(accountId: string, userIds: string[]): Promise<Record<string, number>>;

  // Attendance — Messages
  getMessages(conversationId: string, accountId: string): Promise<AttMessage[]>;
  getMessagesPage(conversationId: string, accountId: string, options?: { before?: Date; limit?: number }): Promise<{ data: AttMessage[]; hasMore: boolean; nextCursor: string | null }>;
  createMessage(data: Partial<InsertAttMessage> & { accountId: string; conversationId: string; direction: string }): Promise<AttMessage>;
  getMessageByExternalId(externalId: string, accountId: string): Promise<AttMessage | null>;
  searchMessages(accountId: string, filters?: { q?: string; conversationId?: string; from?: string; to?: string; limit?: number }): Promise<AttMessage[]>;

  // Attendance — Attachments
  createAttachment(data: Partial<InsertAttAttachment> & { accountId: string; conversationId: string; fileName: string; url: string }): Promise<AttAttachment>;

  // Attendance — Quick Replies
  getQuickReplies(accountId: string): Promise<QuickReply[]>;
  createQuickReply(data: InsertQuickReply & { accountId: string; userId: string }): Promise<QuickReply>;
  updateQuickReply(id: string, accountId: string, data: Partial<QuickReply>): Promise<QuickReply>;
  deleteQuickReply(id: string, accountId: string): Promise<void>;

  // Attendance — Sectors
  getSectors(accountId: string): Promise<AttSector[]>;
  createSector(data: InsertAttSector & { accountId: string }): Promise<AttSector>;
  updateSector(id: string, accountId: string, data: Partial<AttSector>): Promise<AttSector>;
  deleteSector(id: string, accountId: string): Promise<void>;

  // Attendance — Queues
  getQueues(accountId: string): Promise<AttQueue[]>;
  getQueue(id: string, accountId: string): Promise<AttQueue | null>;
  createQueue(data: InsertAttQueue & { accountId: string }): Promise<AttQueue>;
  updateQueue(id: string, accountId: string, data: Partial<AttQueue>): Promise<AttQueue>;
  deleteQueue(id: string, accountId: string): Promise<void>;
  getQueueMembers(queueId: string, accountId: string): Promise<AttQueueMember[]>;
  createQueueMember(data: InsertAttQueueMember & { accountId: string }): Promise<AttQueueMember>;
  deleteQueueMember(id: string, accountId: string): Promise<void>;

  // Attendance — Notes
  getNotes(conversationId: string, accountId: string): Promise<AttNote[]>;
  createNote(data: InsertAttNote & { accountId: string; userId: string }): Promise<AttNote>;

  // Attendance — Permanent Events / Audit Trail
  createAttendanceEvent(data: Partial<InsertAttConversationEvent> & { accountId: string; action: string }): Promise<AttConversationEvent>;
  getAttendanceEvents(accountId: string, filters?: { conversationId?: string; userId?: string; action?: string; from?: string; to?: string; limit?: number }): Promise<AttConversationEvent[]>;
  createTransfer(data: Partial<InsertAttTransfer> & { accountId: string; conversationId: string }): Promise<AttTransfer>;
  getTransfers(conversationId: string, accountId: string): Promise<AttTransfer[]>;
  getLabels(accountId: string): Promise<AttLabel[]>;
  upsertLabel(accountId: string, data: Partial<InsertAttLabel> & { name: string }): Promise<AttLabel>;
  updateLabel(id: string, accountId: string, data: Partial<AttLabel>): Promise<AttLabel>;
  deleteLabel(id: string, accountId: string): Promise<void>;
  setConversationLabels(accountId: string, conversationId: string, labelNames: string[]): Promise<AttLabel[]>;
  setContactLabels(accountId: string, contactId: string, labelNames: string[]): Promise<AttLabel[]>;
  getConversationLabelNames(accountId: string, conversationId: string): Promise<string[]>;
  getContactLabelNames(accountId: string, contactId: string): Promise<string[]>;
  createImportJob(data: Partial<InsertAttImportJob> & { accountId: string; userId?: string | null }): Promise<AttImportJob>;
  updateImportJob(id: string, accountId: string, data: Partial<AttImportJob>): Promise<AttImportJob>;
  getImportJob(id: string, accountId: string): Promise<AttImportJob | null>;
  createIntegrationLog(data: Partial<InsertIntegrationLog> & { accountId: string; service: string; action: string; status: string; userId?: string | null }): Promise<IntegrationLog>;

  // Attendance — Automation
  getAutomation(accountId: string): Promise<AttAutomation | null>;
  upsertAutomation(data: Partial<InsertAttAutomation> & { accountId: string }): Promise<AttAutomation>;

  // Attendance — Reports
  getAttendanceReport(accountId: string, filters?: { channel?: string; from?: string; to?: string }): Promise<Record<string, any>>;
  getAttendanceSupervision(accountId: string): Promise<Record<string, any>>;
}

function buildAttendanceCode(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const random = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  return `ATD-${y}${m}${d}-${random}`;
}

export class DatabaseStorage implements IStorage {
  // Accounts
  async createAccount(account: { name: string; salesperson?: string | null; planValue?: string | null }): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();
    return newAccount;
  }

  async getAllAccounts(): Promise<Account[]> {
    return await db.select().from(accounts).orderBy(desc(accounts.createdAt));
  }

  async updateAccountPaymentStatus(id: string, paymentStatus: string, commissionPaid: boolean): Promise<Account> {
    const [updated] = await db.update(accounts)
      .set({ paymentStatus, commissionPaid })
      .where(eq(accounts.id, id))
      .returning();
    return updated;
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

  async getAccountAdmin(accountId: string): Promise<User | undefined> {
    const [admin] = await db.select()
      .from(users)
      .where(and(
        eq(users.accountId, accountId),
        eq(users.role, "admin")
      ));
    return admin || undefined;
  }

  async createUser(insertUser: InsertUser & { accountId: string }): Promise<User> {
    const [user] = await db.insert(users).values([insertUser]).returning();
    return user;
  }

  async getAllUsers(accountId: string): Promise<User[]> {
    return await db.select()
      .from(users)
      .where(eq(users.accountId, accountId))
      .orderBy(desc(users.createdAt));
  }

  // ─── Paginated queries ────────────────────────────────────────────────────

  async getCampaignsPaginated(
    accountId: string,
    params: PaginationParams & { search?: string; type?: string; allowedTypes?: string[] },
  ): Promise<{ data: MarketingCampaign[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const conds: any[] = [eq(marketingCampaigns.accountId, accountId)];
    if (params.search) conds.push(ilike(marketingCampaigns.name, `%${params.search}%`));
    if (params.type) {
      // "whatsapp" tab includes both whatsapp and whatsapp_oficial
      if (params.type === "whatsapp") {
        conds.push(or(eq(marketingCampaigns.type, "whatsapp"), eq(marketingCampaigns.type, "whatsapp_oficial")));
      } else {
        conds.push(eq(marketingCampaigns.type, params.type));
      }
    }
    if (params.allowedTypes && params.allowedTypes.length > 0) {
      conds.push(inArray(marketingCampaigns.type, params.allowedTypes));
    }
    const where = and(...conds);
    const [{ total }] = await db.select({ total: count() }).from(marketingCampaigns).where(where);
    const data = await db.select().from(marketingCampaigns).where(where)
      .orderBy(desc(marketingCampaigns.createdAt)).limit(params.pageSize).offset(offset);
    return { data, total: Number(total) };
  }

  // Aggregate status counts across ALL campaigns matching the same filters as
  // getCampaignsPaginated. Lightweight GROUP BY (no recipients loaded) so the
  // stat cards reflect account-wide totals, not just the current page.
  async getCampaignStatusCounts(
    accountId: string,
    params: { search?: string; type?: string; allowedTypes?: string[] },
  ): Promise<{ status: string; count: number }[]> {
    const conds: any[] = [eq(marketingCampaigns.accountId, accountId)];
    if (params.search) conds.push(ilike(marketingCampaigns.name, `%${params.search}%`));
    if (params.type) {
      if (params.type === "whatsapp") {
        conds.push(or(eq(marketingCampaigns.type, "whatsapp"), eq(marketingCampaigns.type, "whatsapp_oficial")));
      } else {
        conds.push(eq(marketingCampaigns.type, params.type));
      }
    }
    if (params.allowedTypes && params.allowedTypes.length > 0) {
      conds.push(inArray(marketingCampaigns.type, params.allowedTypes));
    }
    const rows = await db
      .select({ status: marketingCampaigns.status, count: count() })
      .from(marketingCampaigns)
      .where(and(...conds))
      .groupBy(marketingCampaigns.status);
    return rows.map((r: { status: string | null; count: number }) => ({ status: r.status as string, count: Number(r.count) }));
  }

  async getCampaignRecipientsPaginated(
    campaignId: string,
    accountId: string,
    params: PaginationParams & { statuses?: string[] },
  ): Promise<{ data: CampaignRecipient[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const conds: any[] = [
      eq(campaignRecipients.campaignId, campaignId),
      eq(campaignRecipients.accountId, accountId),
    ];
    if (params.statuses && params.statuses.length > 0) {
      conds.push(inArray(campaignRecipients.status, params.statuses as any[]));
    }
    const where = and(...conds);
    const [{ total }] = await db.select({ total: count() }).from(campaignRecipients).where(where);
    const data = await db.select().from(campaignRecipients).where(where)
      .orderBy(desc(campaignRecipients.createdAt)).limit(params.pageSize).offset(offset);
    return { data, total: Number(total) };
  }

  async getContactsPaginated(
    accountId: string,
    params: PaginationParams & { search?: string; userId?: string },
  ): Promise<{ data: Contact[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const conds: any[] = [eq(contacts.accountId, accountId)];
    if (params.userId) conds.push(eq(contacts.userId, params.userId));
    if (params.search) {
      conds.push(or(
        ilike(contacts.name, `%${params.search}%`),
        ilike(contacts.phone, `%${params.search}%`),
        ilike(contacts.email, `%${params.search}%`),
        ilike(contacts.city, `%${params.search}%`),
      ));
    }
    const where = and(...conds);
    const [{ total }] = await db.select({ total: count() }).from(contacts).where(where);
    const data = await db.select().from(contacts).where(where)
      .orderBy(desc(contacts.createdAt)).limit(params.pageSize).offset(offset);
    return { data, total: Number(total) };
  }

  async getAllUsersPaginated(
    accountId: string,
    params: PaginationParams & { search?: string },
  ): Promise<{ data: User[]; total: number }> {
    const offset = (params.page - 1) * params.pageSize;
    const conds: any[] = [eq(users.accountId, accountId)];
    if (params.search) {
      conds.push(or(
        ilike(users.name, `%${params.search}%`),
        ilike(users.email, `%${params.search}%`),
      ));
    }
    const where = and(...conds);
    const [{ total }] = await db.select({ total: count() }).from(users).where(where);
    const data = await db.select().from(users).where(where)
      .orderBy(desc(users.createdAt)).limit(params.pageSize).offset(offset);
    return { data, total: Number(total) };
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

  async getContactsByUser(accountId: string, userId: string): Promise<Contact[]> {
    return await db.select().from(contacts)
      .where(and(
        eq(contacts.accountId, accountId),
        eq(contacts.userId, userId)
      ))
      .orderBy(desc(contacts.createdAt));
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
    // Normalize the contact name for deduplication
    const normalized = normalizeText(contact.name);
    
    // Use transaction to ensure atomicity
    const result = await db.transaction(async (tx: any) => {
      // Check if a contact with the same normalized name already exists
      const existing = await tx.select()
        .from(contacts)
        .where(and(
          eq(contacts.accountId, contact.accountId),
          eq(contacts.normalizedName, normalized)
        ))
        .limit(1);
      
      // If exists, delete the old one (keeping only the newest)
      if (existing.length > 0) {
        await tx.delete(contacts)
          .where(eq(contacts.id, existing[0].id));
        console.log(`Deduplicação: Removido contato duplicado "${existing[0].name}" (ID: ${existing[0].id})`);
      }
      
      // Create the new contact with normalized name
      const [newContact] = await tx.insert(contacts)
        .values({
          ...contact,
          normalizedName: normalized
        })
        .returning();
      
      return newContact;
    });
    
    return result;
  }

  async updateContact(id: string, accountId: string, contact: Partial<InsertContact>): Promise<Contact> {
    // If updating the name, also update the normalizedName
    const updateData = { ...contact };
    if (contact.name) {
      updateData.normalizedName = normalizeText(contact.name);
    }
    
    const [updated] = await db.update(contacts)
      .set(updateData)
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
  async getCandidateBySlug(slug: string): Promise<{ id: string; accountId: string; name: string; email: string; avatar: string | null; landingBackground: string | null; politicalPosition: string | null; electionNumber: string | null; slug: string | null; party: PoliticalParty | null } | undefined> {
    const result = await db.select({
      id: users.id,
      accountId: users.accountId,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      landingBackground: users.landingBackground,
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

  async getVolunteerByCode(volunteerCode: string): Promise<{ id: string; name: string; accountId: string; avatar: string | null } | undefined> {
    const [volunteer] = await db.select({
      id: users.id,
      name: users.name,
      accountId: users.accountId,
      avatar: users.avatar
    })
      .from(users)
      .where(eq(users.volunteerCode, volunteerCode))
      .limit(1);
    
    return volunteer || undefined;
  }

  async generateUniqueVolunteerCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    let attempts = 0;
    
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
      
      const existing = await this.getVolunteerByCode(code);
      if (!existing) {
        return code;
      }
    } while (attempts < 100);
    
    throw new Error('Could not generate unique volunteer code');
  }

  async createPublicSupporter(slug: string, contact: InsertContact, volunteerCode?: string): Promise<Contact> {
    // First, get the candidate by slug to get userId and accountId
    const candidate = await this.getCandidateBySlug(slug);
    if (!candidate) {
      throw new Error('Candidate not found');
    }
    
    // Normalize the contact name for deduplication
    const normalized = normalizeText(contact.name);
    
    // Determine source based on volunteer code
    let source = "Politicall";
    let creatorUserId = candidate.id;
    
    if (volunteerCode) {
      const volunteer = await this.getVolunteerByCode(volunteerCode);
      if (volunteer && volunteer.accountId === candidate.accountId) {
        source = `Vol. ${volunteer.name}`;
        creatorUserId = volunteer.id;
      }
    }
    
    // Create contact with automatic source
    const contactData = {
      ...contact,
      userId: creatorUserId,
      accountId: candidate.accountId,
      source: source
    };
    
    // Use transaction to ensure atomicity and handle deduplication
    const result = await db.transaction(async (tx: any) => {
      // Check if a contact with the same normalized name already exists
      const existing = await tx.select()
        .from(contacts)
        .where(and(
          eq(contacts.accountId, candidate.accountId),
          eq(contacts.normalizedName, normalized)
        ))
        .limit(1);
      
      // If exists, delete the old one (keeping only the newest)
      if (existing.length > 0) {
        await tx.delete(contacts)
          .where(eq(contacts.id, existing[0].id));
        console.log(`Deduplicação (público): Removido contato duplicado "${existing[0].name}" (ID: ${existing[0].id})`);
      }
      
      // Create the new contact with normalized name
      const [newContact] = await tx.insert(contacts)
        .values({
          ...contactData,
          normalizedName: normalized
        })
        .returning();
      
      return newContact;
    });
    
    return result;
  }

  async findAvailableSlug(baseSlug: string): Promise<string> {
    // Try the original slug first
    let candidateSlug = baseSlug;
    let counter = 1;
    
    // Keep trying until we find an available slug
    while (true) {
      const existing = await this.getCandidateBySlug(candidateSlug);
      if (!existing) {
        // This slug is available
        return candidateSlug;
      }
      
      // Slug exists, try the next number
      counter++;
      candidateSlug = `${baseSlug}${counter}`;
    }
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

  // Alliance Invites
  async getAllianceInvites(accountId: string): Promise<AllianceInvite[]> {
    return await db.select().from(allianceInvites).where(eq(allianceInvites.accountId, accountId)).orderBy(desc(allianceInvites.createdAt));
  }

  async createAllianceInvite(invite: InsertAllianceInvite & { userId: string; accountId: string; token: string }): Promise<AllianceInvite> {
    const [newInvite] = await db.insert(allianceInvites).values(invite).returning();
    return newInvite;
  }

  async getAllianceInviteByToken(token: string): Promise<AllianceInvite | undefined> {
    const [invite] = await db.select().from(allianceInvites).where(eq(allianceInvites.token, token));
    return invite || undefined;
  }

  async acceptAllianceInvite(token: string, data: { inviteeName: string; inviteeEmail?: string; inviteePhone?: string; inviteePosition?: string; inviteeState?: string; inviteeCity?: string; inviteeNotes?: string }): Promise<AllianceInvite> {
    const invite = await this.getAllianceInviteByToken(token);
    if (!invite) throw new Error('Convite não encontrado');
    if (invite.status === 'accepted') throw new Error('Convite já foi aceito');
    if (invite.status === 'expired') throw new Error('Convite expirado');

    const [updated] = await db.update(allianceInvites)
      .set({
        status: 'accepted',
        inviteeName: data.inviteeName,
        inviteeEmail: data.inviteeEmail || invite.inviteeEmail,
        inviteePhone: data.inviteePhone || invite.inviteePhone,
        inviteePosition: data.inviteePosition,
        inviteeState: data.inviteeState,
        inviteeCity: data.inviteeCity,
        inviteeNotes: data.inviteeNotes,
        acceptedAt: new Date()
      })
      .where(eq(allianceInvites.token, token))
      .returning();

    await db.insert(politicalAlliances).values({
      accountId: invite.accountId,
      userId: invite.userId,
      partyId: invite.partyId,
      allyName: data.inviteeName,
      position: data.inviteePosition || null,
      state: data.inviteeState || null,
      city: data.inviteeCity || null,
      phone: data.inviteePhone || invite.inviteePhone || null,
      email: data.inviteeEmail || invite.inviteeEmail || null,
      notes: data.inviteeNotes || null,
    });

    return updated;
  }

  async rejectAllianceInvite(token: string): Promise<AllianceInvite> {
    const invite = await this.getAllianceInviteByToken(token);
    if (!invite) throw new Error('Convite não encontrado');
    if (invite.status === 'accepted') throw new Error('Convite já foi aceito');
    if (invite.status === 'rejected') throw new Error('Convite já foi rejeitado');

    const [updated] = await db.update(allianceInvites)
      .set({ status: 'rejected' })
      .where(eq(allianceInvites.token, token))
      .returning();

    return updated;
  }

  async deleteAllianceInvite(id: string, accountId: string): Promise<void> {
    const result = await db.delete(allianceInvites)
      .where(and(
        eq(allianceInvites.id, id),
        eq(allianceInvites.accountId, accountId)
      ))
      .returning();
    if (result.length === 0) throw new Error('Convite não encontrado ou acesso negado');
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
    
    return results.map((r: any) => ({
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
    return config ? decryptAiConfigProviderSecrets(config) : undefined;
  }

  async upsertAiConfig(config: InsertAiConfiguration & { userId: string; accountId: string }): Promise<AiConfiguration> {
    const existing = await this.getAiConfig(config.userId, config.accountId);
    const encryptedConfig = encryptAiConfigProviderSecrets(config);
    
    if (existing) {
      const [updated] = await db.update(aiConfigurations)
        .set({ ...encryptedConfig, updatedAt: new Date() })
        .where(and(
          eq(aiConfigurations.userId, config.userId),
          eq(aiConfigurations.accountId, config.accountId)
        ))
        .returning();
      return decryptAiConfigProviderSecrets(updated);
    } else {
      const [newConfig] = await db.insert(aiConfigurations).values(encryptedConfig).returning();
      return decryptAiConfigProviderSecrets(newConfig);
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

  async deleteCampaign(id: string, accountId: string): Promise<void> {
    await db.delete(marketingCampaigns).where(and(
      eq(marketingCampaigns.id, id),
      eq(marketingCampaigns.accountId, accountId)
    ));
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

  // Campaign recipients (per-recipient tracking)
  async createCampaignRecipients(recipients: (InsertCampaignRecipient & { accountId: string; campaignId: string })[]): Promise<CampaignRecipient[]> {
    if (recipients.length === 0) return [];
    return await db.insert(campaignRecipients).values(recipients).returning();
  }

  async getCampaignRecipients(campaignId: string, accountId: string): Promise<CampaignRecipient[]> {
    return await db.select()
      .from(campaignRecipients)
      .where(and(
        eq(campaignRecipients.campaignId, campaignId),
        eq(campaignRecipients.accountId, accountId)
      ))
      .orderBy(desc(campaignRecipients.createdAt));
  }

  async getCampaignRecipientByProviderMessageId(providerMessageId: string): Promise<CampaignRecipient | undefined> {
    // Provider webhooks (e.g. WhatsApp status receipts) don't carry an accountId,
    // so this lookup is intentionally by the globally-unique provider message id.
    const [row] = await db.select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.providerMessageId, providerMessageId))
      .limit(1);
    return row;
  }

  async updateCampaignRecipient(id: string, accountId: string, data: Partial<InsertCampaignRecipient> & { sentAt?: Date; deliveredAt?: Date }): Promise<CampaignRecipient> {
    const [updated] = await db.update(campaignRecipients)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(campaignRecipients.id, id),
        eq(campaignRecipients.accountId, accountId)
      ))
      .returning();
    if (!updated) throw new Error('Campaign recipient not found or access denied');
    return updated;
  }

  async deleteCampaignRecipients(campaignId: string, accountId: string): Promise<void> {
    await db.delete(campaignRecipients).where(and(
      eq(campaignRecipients.campaignId, campaignId),
      eq(campaignRecipients.accountId, accountId)
    ));
  }

  // Campaign audit events (immutable — no delete/update by design)
  async createCampaignEvent(event: InsertCampaignEvent & { accountId: string; campaignId: string }): Promise<CampaignEvent> {
    const [created] = await db.insert(campaignEvents).values(event).returning();
    return created;
  }

  async getCampaignEvents(campaignId: string, accountId: string): Promise<CampaignEvent[]> {
    return await db.select()
      .from(campaignEvents)
      .where(and(
        eq(campaignEvents.campaignId, campaignId),
        eq(campaignEvents.accountId, accountId)
      ))
      .orderBy(desc(campaignEvents.createdAt));
  }

  // Phase 4 — campaigns the scheduler must consider across all accounts
  // (in flight or scheduled/pending; includes legacy English statuses).
  async getActiveCampaigns(): Promise<MarketingCampaign[]> {
    return await db.select()
      .from(marketingCampaigns)
      .where(inArray(marketingCampaigns.status, [
        "em_envio", "sending", "agendada", "scheduled",
      ]))
      .orderBy(desc(marketingCampaigns.createdAt));
  }

  // Phase 4 — per-recipient progress counts grouped by campaign for one account.
  async getCampaignProgress(accountId: string): Promise<Record<string, { total: number; sent: number; failed: number; pending: number; cancelled: number }>> {
    const rows = await db
      .select({
        campaignId: campaignRecipients.campaignId,
        status: campaignRecipients.status,
        c: count(),
      })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.accountId, accountId))
      .groupBy(campaignRecipients.campaignId, campaignRecipients.status);
    const out: Record<string, { total: number; sent: number; failed: number; pending: number; cancelled: number }> = {};
    for (const r of rows as any[]) {
      const id = r.campaignId as string;
      const n = Number(r.c) || 0;
      const bucket = out[id] ?? (out[id] = { total: 0, sent: 0, failed: 0, pending: 0, cancelled: 0 });
      bucket.total += n;
      const s = String(r.status);
      if (s === "sent" || s === "delivered" || s === "read" || s === "responded") bucket.sent += n;
      else if (s === "failed" || s === "invalid") bucket.failed += n;
      else if (s === "cancelled") bucket.cancelled += n;
      else bucket.pending += n;
    }
    return out;
  }

  // Phase 5 — reports & exports
  async getCampaignsReportSummary(accountId: string, filters?: CampaignReportFilters): Promise<{ campaigns: MarketingCampaign[]; recipients: CampaignRecipient[] }> {
    const conds = [eq(marketingCampaigns.accountId, accountId)];
    if (filters?.status) conds.push(eq(marketingCampaigns.status, filters.status));
    if (filters?.creatorId) conds.push(eq(marketingCampaigns.userId, filters.creatorId));
    if (filters?.from) conds.push(gte(marketingCampaigns.createdAt, filters.from));
    if (filters?.to) conds.push(lte(marketingCampaigns.createdAt, filters.to));
    const campaigns = await db.select()
      .from(marketingCampaigns)
      .where(and(...conds))
      .orderBy(desc(marketingCampaigns.createdAt));

    if (campaigns.length === 0) return { campaigns: [], recipients: [] };

    const ids = campaigns.map((c: MarketingCampaign) => c.id);
    const recConds = [
      eq(campaignRecipients.accountId, accountId),
      inArray(campaignRecipients.campaignId, ids),
    ];
    if (filters?.channel) recConds.push(eq(campaignRecipients.channel, filters.channel));
    const recipients = await db.select()
      .from(campaignRecipients)
      .where(and(...recConds));
    return { campaigns, recipients };
  }

  async getCampaignReportData(campaignId: string, accountId: string): Promise<{ campaign: MarketingCampaign; recipients: CampaignRecipient[]; events: CampaignEvent[] } | undefined> {
    const [campaign] = await db.select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.id, campaignId), eq(marketingCampaigns.accountId, accountId)));
    if (!campaign) return undefined;
    const [recipients, events] = await Promise.all([
      db.select().from(campaignRecipients)
        .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.accountId, accountId))),
      db.select().from(campaignEvents)
        .where(and(eq(campaignEvents.campaignId, campaignId), eq(campaignEvents.accountId, accountId)))
        .orderBy(desc(campaignEvents.createdAt)),
    ]);
    return { campaign, recipients, events };
  }

  async getRecipientsForExport(campaignId: string, accountId: string, opts?: { status?: string; channel?: string }): Promise<CampaignRecipient[]> {
    const conds = [
      eq(campaignRecipients.campaignId, campaignId),
      eq(campaignRecipients.accountId, accountId),
    ];
    if (opts?.status === "failures") {
      conds.push(inArray(campaignRecipients.status, ["failed", "invalid"]));
    } else if (opts?.status) {
      conds.push(eq(campaignRecipients.status, opts.status));
    }
    if (opts?.channel) conds.push(eq(campaignRecipients.channel, opts.channel));
    return await db.select()
      .from(campaignRecipients)
      .where(and(...conds))
      .orderBy(desc(campaignRecipients.createdAt));
  }

  async createCampaignExport(data: InsertCampaignExport & { accountId: string }): Promise<CampaignExport> {
    const [created] = await db.insert(campaignExports).values(data).returning();
    return created;
  }

  async getCampaignExports(accountId: string, campaignId?: string): Promise<CampaignExport[]> {
    const conds = [eq(campaignExports.accountId, accountId)];
    if (campaignId) conds.push(eq(campaignExports.campaignId, campaignId));
    return await db.select()
      .from(campaignExports)
      .where(and(...conds))
      .orderBy(desc(campaignExports.createdAt));
  }

  // Contact lists (audience segmentation)
  async getContactLists(accountId: string): Promise<ContactList[]> {
    return await db.select()
      .from(contactLists)
      .where(eq(contactLists.accountId, accountId))
      .orderBy(desc(contactLists.createdAt));
  }

  async getContactList(id: string, accountId: string): Promise<ContactList | undefined> {
    const [list] = await db.select()
      .from(contactLists)
      .where(and(eq(contactLists.id, id), eq(contactLists.accountId, accountId)));
    return list;
  }

  async createContactList(list: InsertContactList & { accountId: string; userId: string }): Promise<ContactList> {
    const [created] = await db.insert(contactLists).values(list).returning();
    return created;
  }

  async updateContactList(id: string, accountId: string, data: Partial<InsertContactList>): Promise<ContactList> {
    const [updated] = await db.update(contactLists)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(contactLists.id, id), eq(contactLists.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Contact list not found or access denied');
    return updated;
  }

  async deleteContactList(id: string, accountId: string): Promise<void> {
    await db.delete(contactListMembers).where(and(
      eq(contactListMembers.listId, id),
      eq(contactListMembers.accountId, accountId)
    ));
    await db.delete(contactLists).where(and(
      eq(contactLists.id, id),
      eq(contactLists.accountId, accountId)
    ));
  }

  async getContactListMembers(listId: string, accountId: string): Promise<ContactListMember[]> {
    return await db.select()
      .from(contactListMembers)
      .where(and(
        eq(contactListMembers.listId, listId),
        eq(contactListMembers.accountId, accountId)
      ));
  }

  async setContactListMembers(listId: string, accountId: string, contactIds: string[]): Promise<ContactListMember[]> {
    await db.delete(contactListMembers).where(and(
      eq(contactListMembers.listId, listId),
      eq(contactListMembers.accountId, accountId)
    ));
    const unique = Array.from(new Set(contactIds));
    if (unique.length === 0) return [];
    return await db.insert(contactListMembers)
      .values(unique.map((contactId) => ({ listId, accountId, contactId })))
      .returning();
  }

  // Message templates (saved SMS/email/WhatsApp models)
  async getMessageTemplates(accountId: string, channel?: string): Promise<MessageTemplate[]> {
    const where = channel
      ? and(eq(messageTemplates.accountId, accountId), eq(messageTemplates.channel, channel))
      : eq(messageTemplates.accountId, accountId);
    return await db.select()
      .from(messageTemplates)
      .where(where)
      .orderBy(desc(messageTemplates.updatedAt));
  }

  async getMessageTemplate(id: string, accountId: string): Promise<MessageTemplate | undefined> {
    const [tpl] = await db.select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.accountId, accountId)));
    return tpl;
  }

  async createMessageTemplate(tpl: InsertMessageTemplate & { accountId: string; userId: string }): Promise<MessageTemplate> {
    const [created] = await db.insert(messageTemplates).values(tpl).returning();
    return created;
  }

  async updateMessageTemplate(id: string, accountId: string, data: Partial<InsertMessageTemplate>): Promise<MessageTemplate> {
    const [updated] = await db.update(messageTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(messageTemplates.id, id), eq(messageTemplates.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Message template not found or access denied');
    return updated;
  }

  async deleteMessageTemplate(id: string, accountId: string): Promise<void> {
    await db.delete(messageTemplates).where(and(
      eq(messageTemplates.id, id),
      eq(messageTemplates.accountId, accountId)
    ));
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

  async createNotification(notification: InsertNotification & { userId: string; accountId: string }): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values([notification]).returning();
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
      .where(eq(integrations.accountId, accountId))
      .orderBy(integrations.service);
  }

  async getIntegration(userId: string, accountId: string, service: string): Promise<Integration | null> {
    const [integration] = await db.select()
      .from(integrations)
      .where(and(
        eq(integrations.accountId, accountId),
        eq(integrations.service, service)
      ));
    return integration || null;
  }

  async upsertIntegration(integration: InsertIntegration & { userId: string; accountId: string }): Promise<Integration> {
    // Integrations are account-scoped; keep userId only as the last editor/creator for audit compatibility.
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

  // Google Calendar Integration
  async getGoogleCalendarIntegration(accountId: string): Promise<GoogleCalendarIntegration | null> {
    const [integration] = await db.select()
      .from(googleCalendarIntegrations)
      .where(eq(googleCalendarIntegrations.accountId, accountId));
    return integration || null;
  }

  async upsertGoogleCalendarIntegration(integration: InsertGoogleCalendarIntegration & { userId: string; accountId: string }): Promise<GoogleCalendarIntegration> {
    const existing = await this.getGoogleCalendarIntegration(integration.accountId);
    
    if (existing) {
      const [updated] = await db.update(googleCalendarIntegrations)
        .set({
          ...integration,
          updatedAt: new Date()
        })
        .where(eq(googleCalendarIntegrations.accountId, integration.accountId))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(googleCalendarIntegrations)
      .values(integration)
      .returning();
    return created;
  }

  async deleteGoogleCalendarIntegration(accountId: string): Promise<void> {
    await db.delete(googleCalendarIntegrations)
      .where(eq(googleCalendarIntegrations.accountId, accountId));
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
    const values: any = {
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

  async getUnreadLeadsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.isRead, false));
    return Number(result[0]?.count || 0);
  }

  async markLeadsAsRead(): Promise<void> {
    await db.update(leads)
      .set({ isRead: true })
      .where(eq(leads.isRead, false));
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

  // ==========================================================================
  // PETITIONS MODULE
  // ==========================================================================

  // Petitions
  async getPetitions(accountId: string): Promise<Petition[]> {
    return await db.select()
      .from(petitions)
      .where(eq(petitions.accountId, accountId))
      .orderBy(desc(petitions.createdAt));
  }

  async getPetition(id: string, accountId: string): Promise<Petition | undefined> {
    const [petition] = await db.select()
      .from(petitions)
      .where(and(eq(petitions.id, id), eq(petitions.accountId, accountId)));
    return petition || undefined;
  }

  async getPetitionBySlug(slug: string): Promise<Petition | undefined> {
    const [petition] = await db.select()
      .from(petitions)
      .where(eq(petitions.slug, slug));
    return petition || undefined;
  }

  async createPetition(petition: InsertPetition & { userId: string; accountId: string }): Promise<Petition> {
    const [newPetition] = await db.insert(petitions)
      .values(petition as any)
      .returning();
    return newPetition;
  }

  async updatePetition(id: string, accountId: string, petition: Partial<InsertPetition>): Promise<Petition> {
    const [updated] = await db.update(petitions)
      .set({ ...petition, updatedAt: new Date() } as any)
      .where(and(eq(petitions.id, id), eq(petitions.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Petition not found or access denied');
    return updated;
  }

  async deletePetition(id: string, accountId: string): Promise<void> {
    const result = await db.delete(petitions)
      .where(and(eq(petitions.id, id), eq(petitions.accountId, accountId)))
      .returning();
    if (result.length === 0) throw new Error('Petition not found or access denied');
  }

  async incrementPetitionViews(id: string): Promise<void> {
    await db.update(petitions)
      .set({ viewsCount: sql`${petitions.viewsCount} + 1` })
      .where(eq(petitions.id, id));
  }

  // Petition Signatures
  async getPetitionSignatures(petitionId: string, accountId: string): Promise<PetitionSignature[]> {
    // Verify the petition belongs to the account
    const [petition] = await db.select({ id: petitions.id })
      .from(petitions)
      .where(and(eq(petitions.id, petitionId), eq(petitions.accountId, accountId)));
    if (!petition) throw new Error('Petition not found or access denied');

    return await db.select()
      .from(petitionSignatures)
      .where(eq(petitionSignatures.petitionId, petitionId))
      .orderBy(desc(petitionSignatures.createdAt));
  }

  async getPetitionSignatureCount(petitionId: string): Promise<number> {
    const [result] = await db.select({ value: count() })
      .from(petitionSignatures)
      .where(eq(petitionSignatures.petitionId, petitionId));
    return result?.value ?? 0;
  }

  async getPetitionSignatureByEmail(petitionId: string, email: string): Promise<PetitionSignature | undefined> {
    const [signature] = await db.select()
      .from(petitionSignatures)
      .where(and(
        eq(petitionSignatures.petitionId, petitionId),
        eq(petitionSignatures.email, email)
      ));
    return signature || undefined;
  }

  async getPetitionSignatureByCpf(petitionId: string, cpf: string): Promise<PetitionSignature | undefined> {
    const [signature] = await db.select()
      .from(petitionSignatures)
      .where(and(
        eq(petitionSignatures.petitionId, petitionId),
        eq(petitionSignatures.cpf, cpf)
      ));
    return signature || undefined;
  }

  async createPetitionSignature(signature: InsertPetitionSignature & { ipAddress?: string | null }): Promise<PetitionSignature> {
    const [newSignature] = await db.insert(petitionSignatures)
      .values(signature as any)
      .returning();
    return newSignature;
  }

  async deletePetitionSignature(id: string, accountId: string): Promise<void> {
    // Verify ownership via petition join
    const [existing] = await db.select({ accountId: petitions.accountId })
      .from(petitionSignatures)
      .leftJoin(petitions, eq(petitionSignatures.petitionId, petitions.id))
      .where(eq(petitionSignatures.id, id));
    if (!existing || existing.accountId !== accountId) {
      throw new Error('Signature not found or access denied');
    }
    await db.delete(petitionSignatures).where(eq(petitionSignatures.id, id));
  }

  // Petition Campaigns
  async getPetitionCampaigns(accountId: string): Promise<PetitionCampaign[]> {
    return await db.select()
      .from(petitionCampaigns)
      .where(eq(petitionCampaigns.accountId, accountId))
      .orderBy(desc(petitionCampaigns.createdAt));
  }

  async getPetitionCampaign(id: string, accountId: string): Promise<PetitionCampaign | undefined> {
    const [campaign] = await db.select()
      .from(petitionCampaigns)
      .where(and(eq(petitionCampaigns.id, id), eq(petitionCampaigns.accountId, accountId)));
    return campaign || undefined;
  }

  async createPetitionCampaign(campaign: InsertPetitionCampaign & { userId: string; accountId: string }): Promise<PetitionCampaign> {
    const values: any = {
      ...campaign,
      scheduledDate: campaign.scheduledDate
        ? (typeof campaign.scheduledDate === 'string' ? new Date(campaign.scheduledDate) : campaign.scheduledDate)
        : null,
    };
    const [newCampaign] = await db.insert(petitionCampaigns)
      .values(values)
      .returning();
    return newCampaign;
  }

  async updatePetitionCampaign(id: string, accountId: string, campaign: Partial<InsertPetitionCampaign>): Promise<PetitionCampaign> {
    const values: any = { ...campaign, updatedAt: new Date() };
    if (campaign.scheduledDate !== undefined) {
      values.scheduledDate = campaign.scheduledDate
        ? (typeof campaign.scheduledDate === 'string' ? new Date(campaign.scheduledDate) : campaign.scheduledDate)
        : null;
    }
    const [updated] = await db.update(petitionCampaigns)
      .set(values)
      .where(and(eq(petitionCampaigns.id, id), eq(petitionCampaigns.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Campaign not found or access denied');
    return updated;
  }

  async deletePetitionCampaign(id: string, accountId: string): Promise<void> {
    const result = await db.delete(petitionCampaigns)
      .where(and(eq(petitionCampaigns.id, id), eq(petitionCampaigns.accountId, accountId)))
      .returning();
    if (result.length === 0) throw new Error('Campaign not found or access denied');
  }

  // Petition Campaign Logs
  async getPetitionCampaignLogs(campaignId: string, accountId: string): Promise<PetitionCampaignLog[]> {
    const [campaign] = await db.select({ id: petitionCampaigns.id })
      .from(petitionCampaigns)
      .where(and(eq(petitionCampaigns.id, campaignId), eq(petitionCampaigns.accountId, accountId)));
    if (!campaign) throw new Error('Campaign not found or access denied');

    return await db.select()
      .from(petitionCampaignLogs)
      .where(eq(petitionCampaignLogs.campaignId, campaignId))
      .orderBy(desc(petitionCampaignLogs.createdAt));
  }

  async createPetitionCampaignLog(log: InsertPetitionCampaignLog & { accountId: string }): Promise<PetitionCampaignLog> {
    const [newLog] = await db.insert(petitionCampaignLogs)
      .values(log as any)
      .returning();
    return newLog;
  }

  // Petition Message Templates
  async getPetitionMessageTemplates(accountId: string): Promise<PetitionMessageTemplate[]> {
    return await db.select()
      .from(petitionMessageTemplates)
      .where(eq(petitionMessageTemplates.accountId, accountId))
      .orderBy(desc(petitionMessageTemplates.createdAt));
  }

  async getPetitionMessageTemplate(id: string, accountId: string): Promise<PetitionMessageTemplate | undefined> {
    const [template] = await db.select()
      .from(petitionMessageTemplates)
      .where(and(eq(petitionMessageTemplates.id, id), eq(petitionMessageTemplates.accountId, accountId)));
    return template || undefined;
  }

  async createPetitionMessageTemplate(template: InsertPetitionMessageTemplate & { userId: string; accountId: string }): Promise<PetitionMessageTemplate> {
    const [newTemplate] = await db.insert(petitionMessageTemplates)
      .values(template as any)
      .returning();
    return newTemplate;
  }

  async updatePetitionMessageTemplate(id: string, accountId: string, template: Partial<InsertPetitionMessageTemplate>): Promise<PetitionMessageTemplate> {
    const [updated] = await db.update(petitionMessageTemplates)
      .set({ ...template, updatedAt: new Date() } as any)
      .where(and(eq(petitionMessageTemplates.id, id), eq(petitionMessageTemplates.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Template not found or access denied');
    return updated;
  }

  async deletePetitionMessageTemplate(id: string, accountId: string): Promise<void> {
    const result = await db.delete(petitionMessageTemplates)
      .where(and(eq(petitionMessageTemplates.id, id), eq(petitionMessageTemplates.accountId, accountId)))
      .returning();
    if (result.length === 0) throw new Error('Template not found or access denied');
  }

  // Link Bio Pages
  async getLinkBioPages(accountId: string): Promise<LinkBioPage[]> {
    return await db.select()
      .from(linkBioPages)
      .where(eq(linkBioPages.accountId, accountId))
      .orderBy(desc(linkBioPages.createdAt));
  }

  async getLinkBioPage(id: string, accountId: string): Promise<LinkBioPage | undefined> {
    const [page] = await db.select()
      .from(linkBioPages)
      .where(and(eq(linkBioPages.id, id), eq(linkBioPages.accountId, accountId)));
    return page || undefined;
  }

  async getLinkBioPageBySlug(slug: string): Promise<LinkBioPage | undefined> {
    const [page] = await db.select()
      .from(linkBioPages)
      .where(eq(linkBioPages.slug, slug));
    return page || undefined;
  }

  async createLinkBioPage(page: InsertLinkBioPage & { userId: string; accountId: string }): Promise<LinkBioPage> {
    const [newPage] = await db.insert(linkBioPages)
      .values(page as any)
      .returning();
    return newPage;
  }

  async updateLinkBioPage(id: string, accountId: string, page: Partial<InsertLinkBioPage>): Promise<LinkBioPage> {
    const [updated] = await db.update(linkBioPages)
      .set({ ...page, updatedAt: new Date() } as any)
      .where(and(eq(linkBioPages.id, id), eq(linkBioPages.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Link bio page not found or access denied');
    return updated;
  }

  async deleteLinkBioPage(id: string, accountId: string): Promise<void> {
    const result = await db.delete(linkBioPages)
      .where(and(eq(linkBioPages.id, id), eq(linkBioPages.accountId, accountId)))
      .returning();
    if (result.length === 0) throw new Error('Link bio page not found or access denied');
  }

  async incrementLinkBioViews(id: string): Promise<void> {
    await db.update(linkBioPages)
      .set({ viewsCount: sql`${linkBioPages.viewsCount} + 1` })
      .where(eq(linkBioPages.id, id));
  }

  // Link Tree Pages
  async getLinkTreePages(accountId: string): Promise<LinkTreePage[]> {
    return await db.select()
      .from(linkTreePages)
      .where(eq(linkTreePages.accountId, accountId))
      .orderBy(desc(linkTreePages.createdAt));
  }

  async getLinkTreePage(id: string, accountId: string): Promise<LinkTreePage | undefined> {
    const [page] = await db.select()
      .from(linkTreePages)
      .where(and(eq(linkTreePages.id, id), eq(linkTreePages.accountId, accountId)));
    return page || undefined;
  }

  async getLinkTreePageBySlug(slug: string): Promise<LinkTreePage | undefined> {
    const [page] = await db.select()
      .from(linkTreePages)
      .where(eq(linkTreePages.slug, slug));
    return page || undefined;
  }

  async createLinkTreePage(page: InsertLinkTreePage & { userId: string; accountId: string }): Promise<LinkTreePage> {
    const [newPage] = await db.insert(linkTreePages)
      .values(page as any)
      .returning();
    return newPage;
  }

  async updateLinkTreePage(id: string, accountId: string, page: Partial<InsertLinkTreePage>): Promise<LinkTreePage> {
    const [updated] = await db.update(linkTreePages)
      .set({ ...page, updatedAt: new Date() } as any)
      .where(and(eq(linkTreePages.id, id), eq(linkTreePages.accountId, accountId)))
      .returning();
    if (!updated) throw new Error('Link tree page not found or access denied');
    return updated;
  }

  async deleteLinkTreePage(id: string, accountId: string): Promise<void> {
    const result = await db.delete(linkTreePages)
      .where(and(eq(linkTreePages.id, id), eq(linkTreePages.accountId, accountId)))
      .returning();
    if (result.length === 0) throw new Error('Link tree page not found or access denied');
  }

  async incrementLinkTreeViews(id: string): Promise<void> {
    await db.update(linkTreePages)
      .set({ viewsCount: sql`${linkTreePages.viewsCount} + 1` })
      .where(eq(linkTreePages.id, id));
  }

  // ─── Attendance: Channel Connections ─────────────────────────────────────────

  async getChannelConnections(accountId: string): Promise<ChannelConnection[]> {
    return db.select().from(channelConnections)
      .where(eq(channelConnections.accountId, accountId))
      .orderBy(desc(channelConnections.createdAt));
  }

  async getChannelConnection(id: string, accountId: string | undefined): Promise<ChannelConnection | null> {
    const conds = accountId
      ? and(eq(channelConnections.id, id), eq(channelConnections.accountId, accountId))
      : eq(channelConnections.id, id);
    const [row] = await db.select().from(channelConnections).where(conds);
    return row ?? null;
  }

  async createChannelConnection(data: InsertChannelConnection & { accountId: string }): Promise<ChannelConnection> {
    const [row] = await db.insert(channelConnections).values(data as any).returning();
    return row;
  }

  async updateChannelConnection(id: string, accountId: string, data: Partial<ChannelConnection>): Promise<ChannelConnection> {
    const [row] = await db.update(channelConnections)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(channelConnections.id, id), eq(channelConnections.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Conexão não encontrada");
    return row;
  }

  async deleteChannelConnection(id: string, accountId: string): Promise<void> {
    await db.delete(channelConnections)
      .where(and(eq(channelConnections.id, id), eq(channelConnections.accountId, accountId)));
  }

  async getIntegrationByAccount(accountId: string, service: string): Promise<Integration | null> {
    const [row] = await db.select().from(integrations)
      .where(and(eq(integrations.accountId, accountId), eq(integrations.service, service)));
    return row ?? null;
  }

  // ─── Attendance: Conversations ────────────────────────────────────────────────

  async getConversations(accountId: string, filters: {
    channel?: string;
    status?: string;
    search?: string;
    assignedUserId?: string;
    sectorId?: string;
    queueId?: string;
    mode?: string;
    priority?: string;
    from?: string;
    to?: string;
    archived?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<AttConversation[]> {
    const conds: any[] = [eq(attConversations.accountId, accountId)];
    if (filters.channel) conds.push(eq(attConversations.channel, filters.channel));
    if (filters.status) conds.push(eq(attConversations.status, filters.status));
    if (filters.assignedUserId) conds.push(eq(attConversations.assignedUserId, filters.assignedUserId));
    if (filters.sectorId) conds.push(eq(attConversations.sectorId, filters.sectorId));
    if (filters.queueId) conds.push(eq(attConversations.queueId, filters.queueId));
    if (filters.mode) conds.push(eq(attConversations.mode, filters.mode));
    if (filters.priority) conds.push(eq(attConversations.priority, filters.priority));
    if (filters.from) conds.push(sql`${attConversations.createdAt} >= ${new Date(filters.from)}`);
    if (filters.to) conds.push(sql`${attConversations.createdAt} <= ${new Date(filters.to)}`);
    if (filters.archived === true) {
      conds.push(sql`coalesce((${attConversations.metadata}->'flags'->>'archived')::boolean, false) = true`);
      conds.push(sql`${attConversations.metadata}->'tombstone' is null`);
    } else {
      conds.push(sql`coalesce((${attConversations.metadata}->'flags'->>'archived')::boolean, false) = false`);
      conds.push(sql`${attConversations.metadata}->'tombstone' is null`);
    }
    if (filters.search) {
      conds.push(or(
        ilike(attConversations.contactName, `%${filters.search}%`),
        ilike(attConversations.contactPhone, `%${filters.search}%`),
        ilike(attConversations.contactEmail, `%${filters.search}%`),
        ilike(attConversations.protocol, `%${filters.search}%`),
        ilike(attConversations.attendanceCode, `%${filters.search}%`)
      ));
    }
    if (filters.limit) {
      return db.select().from(attConversations)
        .where(and(...conds))
        .orderBy(desc(attConversations.lastMessageAt))
        .limit(Math.min(Math.max(filters.limit, 1), 201))
        .offset(Math.max(filters.offset ?? 0, 0));
    }
    return db.select().from(attConversations)
      .where(and(...conds))
      .orderBy(desc(attConversations.lastMessageAt));
  }

  async getOpenConversationCounts(accountId: string, userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};
    const rows = await db.select({ userId: attConversations.assignedUserId, total: count() })
      .from(attConversations)
      .where(and(
        eq(attConversations.accountId, accountId),
        inArray(attConversations.assignedUserId, userIds),
        notInArray(attConversations.status, ["resolved", "finalized", "closed"]),
      ))
      .groupBy(attConversations.assignedUserId);
    return Object.fromEntries(rows.filter((row: { userId: string | null; total: number }) => row.userId).map((row: { userId: string | null; total: number }) => [row.userId!, Number(row.total)]));
  }

  async getConversation(id: string, accountId: string): Promise<AttConversation | null> {
    const [row] = await db.select().from(attConversations)
      .where(and(eq(attConversations.id, id), eq(attConversations.accountId, accountId)));
    return row ?? null;
  }

  async getConversationByExternal(accountId: string, externalThreadId: string): Promise<AttConversation | null> {
    const [row] = await db.select().from(attConversations)
      .where(and(eq(attConversations.accountId, accountId), eq(attConversations.externalThreadId, externalThreadId)));
    return row ?? null;
  }

  async createConversation(data: Partial<InsertAttConversation> & { accountId: string; channel: string }): Promise<AttConversation> {
    const now = new Date();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [row] = await db.insert(attConversations).values({
          mode: "automatic",
          status: "automatic",
          statusChangedAt: now,
          attendanceCode: buildAttendanceCode(now),
          ...data,
        } as any).returning();
        return row;
      } catch (error: any) {
        const message = String(error?.message ?? "");
        if (!message.includes("attendance_code") && !message.includes("duplicate") && !message.includes("unique")) {
          throw error;
        }
      }
    }
    throw new Error("Não foi possível gerar código único do atendimento");
  }

  async updateConversation(id: string, accountId: string, data: Partial<AttConversation>): Promise<AttConversation> {
    const patch: Record<string, any> = { ...data };
    if (data.status !== undefined) patch.statusChangedAt = new Date();
    delete patch.attendanceCode;
    const [row] = await db.update(attConversations)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(and(eq(attConversations.id, id), eq(attConversations.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Conversa não encontrada");
    return row;
  }

  async assumeConversation(id: string, accountId: string, userId: string, assignedByUserId: string): Promise<{ conversation: AttConversation | null; conflict: AttConversation | null }> {
    const now = new Date();
    const [row] = await db.update(attConversations)
      .set({
        assignedUserId: userId,
        assignedByUserId,
        assignedAt: now,
        mode: "manual",
        status: "in_progress",
        statusChangedAt: now,
        lastOperatorActivityAt: now,
        updatedAt: now,
      } as any)
      .where(and(
        eq(attConversations.id, id),
        eq(attConversations.accountId, accountId),
        sql`${attConversations.assignedUserId} is null`,
        sql`${attConversations.status} not in ('finalized', 'closed', 'resolved')`
      ))
      .returning();

    if (row) return { conversation: row, conflict: null };
    const conflict = await this.getConversation(id, accountId);
    return { conversation: null, conflict };
  }

  async releaseConversation(id: string, accountId: string, data: { status?: string; metadata?: Record<string, any> } = {}): Promise<AttConversation> {
    const now = new Date();
    const [row] = await db.update(attConversations)
      .set({
        assignedUserId: null,
        assignedAt: null,
        assignedByUserId: null,
        mode: "automatic",
        status: data.status ?? "waiting_agent",
        statusChangedAt: now,
        lockExpiresAt: null,
        metadata: data.metadata as any,
        updatedAt: now,
      } as any)
      .where(and(eq(attConversations.id, id), eq(attConversations.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Conversa não encontrada");
    return row;
  }

  // ─── Attendance: Messages ─────────────────────────────────────────────────────

  async getMessages(conversationId: string, accountId: string): Promise<AttMessage[]> {
    return db.select().from(attMessages)
      .where(and(eq(attMessages.conversationId, conversationId), eq(attMessages.accountId, accountId)))
      .orderBy(attMessages.createdAt);
  }

  async getMessagesPage(conversationId: string, accountId: string, options: { before?: Date; limit?: number } = {}): Promise<{ data: AttMessage[]; hasMore: boolean; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const conditions = [eq(attMessages.conversationId, conversationId), eq(attMessages.accountId, accountId)];
    if (options.before) conditions.push(lt(attMessages.createdAt, options.before));
    const rows = await db.select().from(attMessages)
      .where(and(...conditions))
      .orderBy(desc(attMessages.createdAt), desc(attMessages.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).reverse();
    return { data, hasMore, nextCursor: data[0]?.createdAt?.toISOString() ?? null };
  }

  async createMessage(data: Partial<InsertAttMessage> & { accountId: string; conversationId: string; direction: string }): Promise<AttMessage> {
    const [row] = await db.insert(attMessages).values(ensureAttendanceMessageCreatedAt(data) as any).returning();
    return row;
  }

  async getMessageByExternalId(externalId: string, accountId: string): Promise<AttMessage | null> {
    const [row] = await db.select().from(attMessages)
      .where(and(eq(attMessages.externalMessageId, externalId), eq(attMessages.accountId, accountId)));
    return row ?? null;
  }

  async searchMessages(accountId: string, filters: { q?: string; conversationId?: string; from?: string; to?: string; limit?: number } = {}): Promise<AttMessage[]> {
    const conds: any[] = [eq(attMessages.accountId, accountId)];
    if (filters.conversationId) conds.push(eq(attMessages.conversationId, filters.conversationId));
    if (filters.q) conds.push(ilike(attMessages.body, `%${filters.q}%`));
    if (filters.from) conds.push(sql`${attMessages.createdAt} >= ${new Date(filters.from)}`);
    if (filters.to) conds.push(sql`${attMessages.createdAt} <= ${new Date(filters.to)}`);
    return db.select().from(attMessages)
      .where(and(...conds))
      .orderBy(desc(attMessages.createdAt))
      .limit(Math.min(Math.max(filters.limit ?? 100, 1), 500));
  }

  // ─── Attendance: Attachments ──────────────────────────────────────────────────

  async createAttachment(data: Partial<InsertAttAttachment> & { accountId: string; conversationId: string; fileName: string; url: string }): Promise<AttAttachment> {
    const [row] = await db.insert(attAttachments).values(data as any).returning();
    return row;
  }

  // ─── Attendance: Quick Replies ────────────────────────────────────────────────

  async getQuickReplies(accountId: string): Promise<QuickReply[]> {
    return db.select().from(quickReplies)
      .where(and(eq(quickReplies.accountId, accountId), eq(quickReplies.active, true)))
      .orderBy(quickReplies.title);
  }

  async createQuickReply(data: InsertQuickReply & { accountId: string; userId: string }): Promise<QuickReply> {
    const [row] = await db.insert(quickReplies).values(data as any).returning();
    return row;
  }

  async updateQuickReply(id: string, accountId: string, data: Partial<QuickReply>): Promise<QuickReply> {
    const [row] = await db.update(quickReplies)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Resposta rápida não encontrada");
    return row;
  }

  async deleteQuickReply(id: string, accountId: string): Promise<void> {
    await db.delete(quickReplies)
      .where(and(eq(quickReplies.id, id), eq(quickReplies.accountId, accountId)));
  }

  // ─── Attendance: Sectors ──────────────────────────────────────────────────────

  async getSectors(accountId: string): Promise<AttSector[]> {
    return db.select().from(attSectors)
      .where(eq(attSectors.accountId, accountId))
      .orderBy(attSectors.name);
  }

  async createSector(data: InsertAttSector & { accountId: string }): Promise<AttSector> {
    const [row] = await db.insert(attSectors).values(data as any).returning();
    return row;
  }

  async updateSector(id: string, accountId: string, data: Partial<AttSector>): Promise<AttSector> {
    const [row] = await db.update(attSectors)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(attSectors.id, id), eq(attSectors.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Setor não encontrado");
    return row;
  }

  async deleteSector(id: string, accountId: string): Promise<void> {
    await db.delete(attSectors)
      .where(and(eq(attSectors.id, id), eq(attSectors.accountId, accountId)));
  }

  // ─── Attendance: Queues ─────────────────────────────────────────────────────

  async getQueues(accountId: string): Promise<AttQueue[]> {
    return db.select().from(attQueues)
      .where(eq(attQueues.accountId, accountId))
      .orderBy(attQueues.priority, attQueues.name);
  }

  async getQueue(id: string, accountId: string): Promise<AttQueue | null> {
    const [row] = await db.select().from(attQueues)
      .where(and(eq(attQueues.id, id), eq(attQueues.accountId, accountId)));
    return row ?? null;
  }

  async createQueue(data: InsertAttQueue & { accountId: string }): Promise<AttQueue> {
    const [row] = await db.insert(attQueues).values(data as any).returning();
    return row;
  }

  async updateQueue(id: string, accountId: string, data: Partial<AttQueue>): Promise<AttQueue> {
    const [row] = await db.update(attQueues)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(attQueues.id, id), eq(attQueues.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Fila não encontrada");
    return row;
  }

  async deleteQueue(id: string, accountId: string): Promise<void> {
    await db.update(attQueues)
      .set({ active: false, updatedAt: new Date() } as any)
      .where(and(eq(attQueues.id, id), eq(attQueues.accountId, accountId)));
  }

  async getQueueMembers(queueId: string, accountId: string): Promise<AttQueueMember[]> {
    return db.select().from(attQueueMembers)
      .where(and(eq(attQueueMembers.queueId, queueId), eq(attQueueMembers.accountId, accountId), eq(attQueueMembers.active, true)));
  }

  async createQueueMember(data: InsertAttQueueMember & { accountId: string }): Promise<AttQueueMember> {
    const [row] = await db.insert(attQueueMembers).values(data as any).returning();
    return row;
  }

  async deleteQueueMember(id: string, accountId: string): Promise<void> {
    await db.update(attQueueMembers)
      .set({ active: false } as any)
      .where(and(eq(attQueueMembers.id, id), eq(attQueueMembers.accountId, accountId)));
  }

  // ─── Attendance: Notes ────────────────────────────────────────────────────────

  async getNotes(conversationId: string, accountId: string): Promise<AttNote[]> {
    return db.select().from(attNotes)
      .where(and(eq(attNotes.conversationId, conversationId), eq(attNotes.accountId, accountId)))
      .orderBy(desc(attNotes.createdAt));
  }

  async createNote(data: InsertAttNote & { accountId: string; userId: string }): Promise<AttNote> {
    const [row] = await db.insert(attNotes).values(data as any).returning();
    return row;
  }

  // ─── Attendance: Permanent Events / Audit Trail ─────────────────────────────

  async createAttendanceEvent(data: Partial<InsertAttConversationEvent> & { accountId: string; action: string }): Promise<AttConversationEvent> {
    const [row] = await db.insert(attConversationEvents).values(data as any).returning();
    return row;
  }

  async getAttendanceEvents(accountId: string, filters: { conversationId?: string; userId?: string; action?: string; from?: string; to?: string; limit?: number } = {}): Promise<AttConversationEvent[]> {
    const conds: any[] = [eq(attConversationEvents.accountId, accountId)];
    if (filters.conversationId) conds.push(eq(attConversationEvents.conversationId, filters.conversationId));
    if (filters.userId) conds.push(eq(attConversationEvents.userId, filters.userId));
    if (filters.action) conds.push(eq(attConversationEvents.action, filters.action));
    if (filters.from) conds.push(sql`${attConversationEvents.createdAt} >= ${new Date(filters.from)}`);
    if (filters.to) conds.push(sql`${attConversationEvents.createdAt} <= ${new Date(filters.to)}`);
    return db.select().from(attConversationEvents)
      .where(and(...conds))
      .orderBy(desc(attConversationEvents.createdAt))
      .limit(Math.min(Math.max(filters.limit ?? 200, 1), 1000));
  }

  async createTransfer(data: Partial<InsertAttTransfer> & { accountId: string; conversationId: string }): Promise<AttTransfer> {
    const [row] = await db.insert(attTransfers).values(data as any).returning();
    return row;
  }

  async getTransfers(conversationId: string, accountId: string): Promise<AttTransfer[]> {
    return db.select().from(attTransfers)
      .where(and(eq(attTransfers.conversationId, conversationId), eq(attTransfers.accountId, accountId)))
      .orderBy(desc(attTransfers.createdAt));
  }

  // ─── Attendance: Automation ───────────────────────────────────────────────────

  async getLabels(accountId: string): Promise<AttLabel[]> {
    return db.select().from(attLabels)
      .where(and(eq(attLabels.accountId, accountId), eq(attLabels.active, true)))
      .orderBy(attLabels.name);
  }

  async upsertLabel(accountId: string, data: Partial<InsertAttLabel> & { name: string }): Promise<AttLabel> {
    const name = data.name.trim();
    const [existing] = await db.select().from(attLabels)
      .where(and(eq(attLabels.accountId, accountId), sql`lower(${attLabels.name}) = ${name.toLowerCase()}`))
      .limit(1);
    if (existing) {
      const [row] = await db.update(attLabels)
        .set({ name, color: data.color ?? existing.color, active: true, updatedAt: new Date() } as any)
        .where(and(eq(attLabels.id, existing.id), eq(attLabels.accountId, accountId)))
        .returning();
      return row;
    }
    const [row] = await db.insert(attLabels).values({
      accountId,
      name,
      color: data.color ?? "#14b8a6",
      active: data.active ?? true,
    } as any).returning();
    return row;
  }

  async updateLabel(id: string, accountId: string, data: Partial<AttLabel>): Promise<AttLabel> {
    const [row] = await db.update(attLabels)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(attLabels.id, id), eq(attLabels.accountId, accountId)))
      .returning();
    if (!row) throw new Error("Etiqueta nÃ£o encontrada");
    return row;
  }

  async deleteLabel(id: string, accountId: string): Promise<void> {
    await db.update(attLabels)
      .set({ active: false, updatedAt: new Date() } as any)
      .where(and(eq(attLabels.id, id), eq(attLabels.accountId, accountId)));
  }

  private async ensureLabels(accountId: string, names: string[]): Promise<AttLabel[]> {
    const uniqueNames = Array.from(new Set(names.map(name => name.trim()).filter(Boolean)));
    const labels: AttLabel[] = [];
    for (const name of uniqueNames) labels.push(await this.upsertLabel(accountId, { name }));
    return labels;
  }

  async setConversationLabels(accountId: string, conversationId: string, labelNames: string[]): Promise<AttLabel[]> {
    const labels = await this.ensureLabels(accountId, labelNames);
    await db.delete(attConversationLabels)
      .where(and(eq(attConversationLabels.accountId, accountId), eq(attConversationLabels.conversationId, conversationId)));
    if (labels.length > 0) {
      await db.insert(attConversationLabels).values(labels.map(label => ({ accountId, conversationId, labelId: label.id })) as any);
    }
    await this.updateConversation(conversationId, accountId, { tags: labels.map(label => label.name) } as any);
    return labels;
  }

  async setContactLabels(accountId: string, contactId: string, labelNames: string[]): Promise<AttLabel[]> {
    const labels = await this.ensureLabels(accountId, labelNames);
    await db.delete(attContactLabels)
      .where(and(eq(attContactLabels.accountId, accountId), eq(attContactLabels.contactId, contactId)));
    if (labels.length > 0) {
      await db.insert(attContactLabels).values(labels.map(label => ({ accountId, contactId, labelId: label.id })) as any);
    }
    await this.updateContact(contactId, accountId, { interests: labels.map(label => label.name) } as any);
    return labels;
  }

  async getConversationLabelNames(accountId: string, conversationId: string): Promise<string[]> {
    const rows = await db.select({ name: attLabels.name })
      .from(attConversationLabels)
      .innerJoin(attLabels, eq(attConversationLabels.labelId, attLabels.id))
      .where(and(eq(attConversationLabels.accountId, accountId), eq(attConversationLabels.conversationId, conversationId), eq(attLabels.active, true)));
    return rows.map((row: { name: string }) => row.name);
  }

  async getContactLabelNames(accountId: string, contactId: string): Promise<string[]> {
    const rows = await db.select({ name: attLabels.name })
      .from(attContactLabels)
      .innerJoin(attLabels, eq(attContactLabels.labelId, attLabels.id))
      .where(and(eq(attContactLabels.accountId, accountId), eq(attContactLabels.contactId, contactId), eq(attLabels.active, true)));
    return rows.map((row: { name: string }) => row.name);
  }

  async createImportJob(data: Partial<InsertAttImportJob> & { accountId: string; userId?: string | null }): Promise<AttImportJob> {
    const [row] = await db.insert(attImportJobs).values(data as any).returning();
    return row;
  }

  async updateImportJob(id: string, accountId: string, data: Partial<AttImportJob>): Promise<AttImportJob> {
    const [row] = await db.update(attImportJobs)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(attImportJobs.id, id), eq(attImportJobs.accountId, accountId)))
      .returning();
    if (!row) throw new Error("ImportaÃ§Ã£o nÃ£o encontrada");
    return row;
  }

  async getImportJob(id: string, accountId: string): Promise<AttImportJob | null> {
    const [row] = await db.select().from(attImportJobs)
      .where(and(eq(attImportJobs.id, id), eq(attImportJobs.accountId, accountId)));
    return row ?? null;
  }

  async createIntegrationLog(data: Partial<InsertIntegrationLog> & { accountId: string; service: string; action: string; status: string; userId?: string | null }): Promise<IntegrationLog> {
    const [row] = await db.insert(integrationLogs).values(data as any).returning();
    return row;
  }

  async getAutomation(accountId: string): Promise<AttAutomation | null> {
    const [row] = await db.select().from(attAutomation)
      .where(eq(attAutomation.accountId, accountId));
    return row ?? null;
  }

  async upsertAutomation(data: Partial<InsertAttAutomation> & { accountId: string }): Promise<AttAutomation> {
    const existing = await this.getAutomation(data.accountId);
    if (existing) {
      const [row] = await db.update(attAutomation)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(attAutomation.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(attAutomation).values(data as any).returning();
    return row;
  }

  // ─── Attendance: Reports ──────────────────────────────────────────────────────

  async getAttendanceReport(accountId: string, filters: { channel?: string; from?: string; to?: string } = {}): Promise<Record<string, any>> {
    const conds: any[] = [eq(attConversations.accountId, accountId)];
    if (filters.channel) conds.push(eq(attConversations.channel, filters.channel));
    if (filters.from) conds.push(sql`${attConversations.createdAt} >= ${new Date(filters.from)}`);
    if (filters.to) conds.push(sql`${attConversations.createdAt} <= ${new Date(filters.to)}`);

    const all = await db.select().from(attConversations).where(and(...conds));

    const total = all.length;
    const resolved = all.filter((c: AttConversation) => ["resolved", "closed", "finalized"].includes(c.status)).length;
    const waiting = all.filter((c: AttConversation) => ["waiting", "new", "waiting_agent", "waiting_customer"].includes(c.status)).length;
    const inProgress = all.filter((c: AttConversation) => c.status === "in_progress").length;
    const automatic = all.filter((c: AttConversation) => c.mode === "automatic" || c.status === "automatic").length;
    const manual = all.filter((c: AttConversation) => c.mode === "manual").length;

    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    const byQueue: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    const dailyVolume: Record<string, number> = {};
    const now = Date.now();
    let totalWaitSeconds = 0;
    let waitSamples = 0;
    let totalServiceSeconds = 0;
    let serviceSamples = 0;
    let slaBreached = 0;

    for (const c of all) {
      byChannel[c.channel] = (byChannel[c.channel] ?? 0) + 1;
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      byMode[c.mode ?? "automatic"] = (byMode[c.mode ?? "automatic"] ?? 0) + 1;
      bySector[c.sectorId ?? "sem_setor"] = (bySector[c.sectorId ?? "sem_setor"] ?? 0) + 1;
      byQueue[c.queueId ?? "sem_fila"] = (byQueue[c.queueId ?? "sem_fila"] ?? 0) + 1;
      byPriority[c.priority ?? "normal"] = (byPriority[c.priority ?? "normal"] ?? 0) + 1;
      byAssignee[c.assignedUserId ?? "sem_responsavel"] = (byAssignee[c.assignedUserId ?? "sem_responsavel"] ?? 0) + 1;
      const day = c.createdAt.toISOString().slice(0, 10);
      dailyVolume[day] = (dailyVolume[day] ?? 0) + 1;

      const remote = (c.metadata as any)?.remote ?? {};
      const wait = Number(remote.timeInWaiting ?? 0);
      if (Number.isFinite(wait) && wait > 0) {
        totalWaitSeconds += wait;
        waitSamples++;
      }

      const end = c.closedAt ?? c.resolvedAt;
      if (end) {
        totalServiceSeconds += Math.max(0, (end.getTime() - c.createdAt.getTime()) / 1000);
        serviceSamples++;
      }

      if (c.slaDueAt && c.slaDueAt.getTime() < now && c.status !== "resolved" && c.status !== "closed") {
        slaBreached++;
      }
    }

    const avgWaitSeconds = waitSamples > 0 ? Math.round(totalWaitSeconds / waitSamples) : 0;
    const avgServiceSeconds = serviceSamples > 0 ? Math.round(totalServiceSeconds / serviceSamples) : 0;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    return {
      total,
      resolved,
      waiting,
      inProgress,
      automatic,
      manual,
      byChannel,
      byStatus,
      byMode,
      bySector,
      byQueue,
      byPriority,
      byAssignee,
      dailyVolume,
      avgWaitSeconds,
      avgServiceSeconds,
      slaBreached,
      resolutionRate,
    };
  }

  async getAttendanceSupervision(accountId: string): Promise<Record<string, any>> {
    const activeCondition = and(
      eq(attConversations.accountId, accountId),
      notInArray(attConversations.status, ["resolved", "finalized", "closed"]),
      sql`coalesce((->'flags'->>'archived')::boolean, false) = false`,
    );
    const [summaryRows, assigneeRows, queueRows, usersList, queuesList] = await Promise.all([
      db.select({
        backlog: count(),
        unassigned: sql<number>`count(*) filter (where  is null)`,
        slaBreached: sql<number>`count(*) filter (where  < now())`,
        waiting: sql<number>`count(*) filter (where  in ('waiting', 'waiting_agent', 'new'))`,
        inProgress: sql<number>`count(*) filter (where  in ('in_progress', 'reopened'))`,
      }).from(attConversations).where(activeCondition),
      db.select({ userId: attConversations.assignedUserId, total: count() })
        .from(attConversations).where(activeCondition).groupBy(attConversations.assignedUserId),
      db.select({ queueId: attConversations.queueId, total: count() })
        .from(attConversations).where(activeCondition).groupBy(attConversations.queueId),
      this.getAllUsers(accountId),
      this.getQueues(accountId),
    ]);
    const summary = summaryRows[0] ?? { backlog: 0, unassigned: 0, slaBreached: 0, waiting: 0, inProgress: 0 };
    const userMap = new Map(usersList.map(user => [user.id, user]));
    const queueMap = new Map(queuesList.map(queue => [queue.id, queue]));
    return {
      summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, Number(value)])),
      agents: assigneeRows.filter((row: any) => row.userId).map((row: any) => ({
        userId: row.userId,
        name: userMap.get(row.userId!)?.name ?? "Usuário indisponível",
        openCount: Number(row.total),
      })).sort((a: any, b: any) => b.openCount - a.openCount),
      queues: queueRows.map((row: any) => ({
        queueId: row.queueId,
        name: row.queueId ? queueMap.get(row.queueId)?.name ?? "Fila indisponível" : "Sem fila",
        openCount: Number(row.total),
      })).sort((a: any, b: any) => b.openCount - a.openCount),
      generatedAt: new Date().toISOString(),
    };
  }
}

export const storage = new DatabaseStorage();
