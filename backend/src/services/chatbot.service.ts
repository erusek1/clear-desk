// backend/src/services/chatbot.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { MongoClient } from 'mongodb';
import { SendGridService } from './sendgrid.service';
import { 
  IKnowledgeDocument, 
  IPrivateNote, 
  IChatMessage,
  IChatThread,
  IChatbotQueryResult,
  ContentVisibility,
  IKnowledgeSearchResult
} from '../types/chatbot.types';

/**
 * Chatbot service for project knowledge base and customer chat
 */
export class ChatbotService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private sendGridService: SendGridService;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('ChatbotService');
    this.sendGridService = new SendGridService();
    this.initMongo();
  }

  /**
   * Initialize MongoDB connection
   */
  private async initMongo(): Promise<void> {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(config.mongodb.uri);
        await this.mongoClient.connect();
        
        const db = this.mongoClient.db(config.mongodb.dbName);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Add document to project knowledge base
   * 
   * @param document - Knowledge document without ID and timestamps
   * @returns Created document
   */
  async addKnowledgeDocument(
    document: Omit<IKnowledgeDocument, 'documentId' | 'created' | 'updated' | 'vectorEmbedding'>
  ): Promise<IKnowledgeDocument> {
    try {
      const documentId = uuidv4();
      const now = new Date().toISOString();
      
      // Generate vector embedding for the document content
      // This would normally use an embedding model API
      const vectorEmbedding = await this.generateEmbedding(document.content);
      
      // Create document record
      const newDocument: IKnowledgeDocument = {
        documentId,
        ...document,
        vectorEmbedding,
        created: now,
        updated: now
      };

      // Save document to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.projectKnowledgeBase,
        Item: {
          PK: `PROJECT#${document.projectId}`,
          SK: `DOCUMENT#${documentId}`,
          GSI1PK: `CONTENT_TYPE#${document.contentType}`,
          GSI1SK: `PROJECT#${document.projectId}`,
          ...newDocument
        }
      }));

      return newDocument;
    } catch (error) {
      this.logger.error('Error adding knowledge document', { error, projectId: document.projectId });
      throw error;
    }
  }

  /**
   * Add private note for an estimate item
   * 
   * @param note - Private note without ID and timestamps
   * @returns Created note
   */
  async addPrivateNote(
    note: Omit<IPrivateNote, 'noteId' | 'created' | 'updated'>
  ): Promise<IPrivateNote> {
    try {
      const noteId = uuidv4();
      const now = new Date().toISOString();
      
      // Create note record
      const newNote: IPrivateNote = {
        noteId,
        ...note,
        created: now,
        updated: now
      };

      // Save note to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.privateNotes,
        Item: {
          PK: `PROJECT#${note.projectId}`,
          SK: `NOTE#${note.itemId || noteId}`,
          GSI1PK: `ITEM#${note.itemId || 'GENERAL'}`,
          GSI1SK: `PROJECT#${note.projectId}`,
          ...newNote
        }
      }));

      // Also add to knowledge base as a private document
      await this.addKnowledgeDocument({
        projectId: note.projectId,
        title: `Private Note: ${note.itemId || 'General'}`,
        content: note.content,
        contentType: 'note',
        visibility: ContentVisibility.PRIVATE,
        metadata: {
          itemId: note.itemId,
          context: note.context
        },
        createdBy: note.createdBy,
        updatedBy: note.updatedBy
      });

      return newNote;
    } catch (error) {
      this.logger.error('Error adding private note', { error, projectId: note.projectId });
      throw error;
    }
  }

  /**
   * Get private notes for a project
   * 
   * @param projectId - Project ID
   * @param itemId - Optional item ID filter
   * @returns List of private notes
   */
  async getPrivateNotes(projectId: string, itemId?: string): Promise<IPrivateNote[]> {
    try {
      let keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `PROJECT#${projectId}`,
        ':sk': 'NOTE#'
      };

      // Add item ID filter if provided
      if (itemId) {
        keyConditionExpression = 'PK = :pk AND SK = :sk';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':sk': `NOTE#${itemId}`
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.privateNotes,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as IPrivateNote[];
    } catch (error) {
      this.logger.error('Error getting private notes', { error, projectId });
      throw error;
    }
  }

  /**
   * Process customer query
   * 
   * @param projectId - Project ID
   * @param query - Customer query text
   * @param userId - User ID making the query
   * @param threadId - Optional thread ID
   * @returns Query result
   */
  async processCustomerQuery(
    projectId: string,
    query: string,
    userId: string,
    threadId?: string
  ): Promise<IChatbotQueryResult> {
    try {
      // 1. Create or get thread
      const currentThreadId = threadId || await this.createChatThread(projectId, userId);
      
      // 2. Save the user message
      await this.saveChatMessage({
        projectId,
        threadId: currentThreadId,
        sender: userId,
        senderType: 'user',
        content: query
      });

      // 3. Get relevant knowledge documents
      const relevantDocuments = await this.searchKnowledgeBase(
        projectId,
        query,
        userId
      );

      // 4. Generate response
      const responseData = await this.generateResponse(query, relevantDocuments);
      
      // 5. Save the bot response
      await this.saveChatMessage({
        projectId,
        threadId: currentThreadId,
        sender: 'chatbot',
        senderType: 'bot',
        content: responseData.response,
        metadata: {
          sources: responseData.sources.map(src => src.documentId),
          confidence: responseData.confidence
        }
      });

      // 6. If the response needs human review, flag it
      if (responseData.needsHumanReview) {
        await this.flagThreadForReview(currentThreadId, projectId, query);
      }

      return responseData;
    } catch (error) {
      this.logger.error('Error processing customer query', { error, projectId, query });
      throw error;
    }
  }

  /**
   * Create a chat thread
   * 
   * @param projectId - Project ID
   * @param userId - User ID creating the thread
   * @param title - Optional thread title
   * @returns Thread ID
   */
  async createChatThread(
    projectId: string,
    userId: string,
    title?: string
  ): Promise<string> {
    try {
      const threadId = uuidv4();
      const now = new Date().toISOString();

      // Get project to use as default title
      const project = await this.getProject(projectId);
      const threadTitle = title || `Chat about ${project?.name || 'Project'}`;
      
      // Create thread record
      const newThread: IChatThread = {
        threadId,
        projectId,
        title: threadTitle,
        created: now,
        updated: now,
        participants: [userId],
        status: 'active'
      };

      // Save thread to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.chatThreads,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `THREAD#${threadId}`,
          GSI1PK: `USER#${userId}`,
          GSI1SK: `THREAD#${now}`,
          ...newThread
        }
      }));

      return threadId;
    } catch (error) {
      this.logger.error('Error creating chat thread', { error, projectId, userId });
      throw error;
    }
  }

  /**
   * Save a chat message
   * 
   * @param message - Chat message without ID and timestamp
   * @returns Message ID
   */
  async saveChatMessage(
    message: Omit<IChatMessage, 'messageId' | 'timestamp'>
  ): Promise<string> {
    try {
      const messageId = uuidv4();
      const timestamp = new Date().toISOString();
      
      // Create message record
      const newMessage: IChatMessage = {
        messageId,
        ...message,
        timestamp
      };

      // Save message to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.chatMessages,
        Item: {
          PK: `THREAD#${message.threadId}`,
          SK: `MESSAGE#${timestamp}`,
          GSI1PK: `PROJECT#${message.projectId}`,
          GSI1SK: `MESSAGE#${timestamp}`,
          ...newMessage
        }
      }));

      // Update thread's updated timestamp
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.chatThreads,
        Key: {
          PK: `PROJECT#${message.projectId}`,
          SK: `THREAD#${message.threadId}`
        },
        UpdateExpression: 'set updated = :updated',
        ExpressionAttributeValues: {
          ':updated': timestamp
        }
      }));

      return messageId;
    } catch (error) {
      this.logger.error('Error saving chat message', { 
        error, projectId: message.projectId, threadId: message.threadId 
      });
      throw error;
    }
  }

  /**
   * Get messages for a thread
   * 
   * @param threadId - Thread ID
   * @param limit - Optional max number of messages
   * @returns List of chat messages
   */
  async getThreadMessages(threadId: string, limit?: number): Promise<IChatMessage[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.chatMessages,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `THREAD#${threadId}`
        },
        ScanIndexForward: true, // Get oldest first
        Limit: limit
      }));

      return (result.Items || []) as IChatMessage[];
    } catch (error) {
      this.logger.error('Error getting thread messages', { error, threadId });
      throw error;
    }
  }

  /**
   * Get threads for a project
   * 
   * @param projectId - Project ID
   * @returns List of chat threads
   */
  async getProjectThreads(projectId: string): Promise<IChatThread[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.chatThreads,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'THREAD#'
        }
      }));

      return (result.Items || []) as IChatThread[];
    } catch (error) {
      this.logger.error('Error getting project threads', { error, projectId });
      throw error;
    }
  }

  /**
   * Index project documents for the knowledge base
   * 
   * @param projectId - Project ID
   * @param userId - User ID performing the indexing
   * @returns Number of documents indexed
   */
  async indexProjectDocuments(projectId: string, userId: string): Promise<number> {
    try {
      // Get project data
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      let indexedCount = 0;

      // 1. Index the project details
      await this.addKnowledgeDocument({
        projectId,
        title: 'Project Details',
        content: JSON.stringify({
          name: project.name,
          address: project.address,
          customer: {
            name: project.customer?.name,
            contactName: project.customer?.contactName
          },
          generalContractor: {
            name: project.generalContractor?.name,
            contactName: project.generalContractor?.contactName
          },
          squareFootage: project.squareFootage,
          classification: project.classification
        }),
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });
      indexedCount++;

      // 2. Index the latest estimate
      const estimate = await this.getProjectEstimate(projectId);
      if (estimate) {
        await this.addKnowledgeDocument({
          projectId,
          title: 'Project Estimate',
          content: JSON.stringify({
            totalLaborHours: estimate.totalLaborHours,
            totalMaterialCost: estimate.totalMaterialCost,
            phases: estimate.phases,
            rooms: estimate.rooms.map(room => ({
              name: room.name,
              items: room.items.map(item => ({
                quantity: item.quantity,
                assemblyId: item.assemblyId,
                assemblyName: item.assemblyName || 'Unknown Assembly',
                notes: item.notes || ''
              }))
            }))
          }),
          contentType: 'estimate',
          visibility: ContentVisibility.PUBLIC,
          createdBy: userId,
          updatedBy: userId
        });
        indexedCount++;
      }

      // 3. Index blueprint extracted data if available
      if (project.blueprint && project.blueprint.extractedData) {
        await this.addKnowledgeDocument({
          projectId,
          title: 'Blueprint Information',
          content: JSON.stringify(project.blueprint.extractedData),
          contentType: 'blueprint',
          visibility: ContentVisibility.PUBLIC,
          createdBy: userId,
          updatedBy: userId
        });
        indexedCount++;
      }

      // 4. Index private notes
      const notes = await this.getPrivateNotes(projectId);
      for (const note of notes) {
        await this.addKnowledgeDocument({
          projectId,
          title: `Private Note: ${note.itemId || 'General'}`,
          content: note.content,
          contentType: 'note',
          visibility: ContentVisibility.PRIVATE,
          metadata: {
            itemId: note.itemId,
            context: note.context
          },
          createdBy: userId,
          updatedBy: userId
        });
        indexedCount++;
      }

      // 5. Index communications (comments)
      const communications = await this.getProjectCommunications(projectId);
      for (const comm of communications) {
        await this.addKnowledgeDocument({
          projectId,
          title: `Communication: ${comm.subject || 'No Subject'}`,
          content: `${comm.body || ''}\n\n${comm.replies?.map(r => r.body).join('\n\n') || ''}`,
          contentType: 'communication',
          visibility: ContentVisibility.PUBLIC,
          createdBy: userId,
          updatedBy: userId
        });
        indexedCount++;
      }

      // 6. Add some standard electrical knowledge
      await this.addStandardElectricalKnowledge(projectId, userId);
      indexedCount += 5; // Standard knowledge count

      return indexedCount;
    } catch (error) {
      this.logger.error('Error indexing project documents', { error, projectId });
      throw error;
    }
  }

  /**
   * Add standard electrical knowledge to the knowledge base
   * 
   * @param projectId - Project ID
   * @param userId - User ID
   * @returns Success status
   */
  private async addStandardElectricalKnowledge(projectId: string, userId: string): Promise<boolean> {
    try {
      // Add NEC requirements
      await this.addKnowledgeDocument({
        projectId,
        title: 'NEC Code Requirements',
        content: 'The National Electrical Code (NEC) requires GFCI protection in bathrooms, kitchens, garages, and outdoor areas. All receptacles in these areas must have GFCI protection. AFCI protection is required for all 120-volt, 15 and 20 amp circuits in bedrooms, living rooms, and similar areas.',
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });

      // Add rough inspection details
      await this.addKnowledgeDocument({
        projectId,
        title: 'Rough Inspection Requirements',
        content: 'The rough electrical inspection occurs after wiring is installed but before walls are closed up. All boxes should be secured to studs, wires should be properly stapled (within 12" of boxes, every 4\' after), and proper wire sizes must be used for each circuit. All grounds must be connected and nail plates installed where needed.',
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });

      // Add finish inspection details
      await this.addKnowledgeDocument({
        projectId,
        title: 'Finish Inspection Requirements',
        content: 'Finish electrical inspection ensures all devices and fixtures are properly installed and functioning. Receptacles should be secure and level, GFCI/AFCI protection must be in place where required, and all lighting fixtures must work properly. The panel must be labeled accurately.',
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });

      // Add service installation details
      await this.addKnowledgeDocument({
        projectId,
        title: 'Electrical Service Installation',
        content: 'Electrical service installation includes mounting the panel securely, installing proper grounding and bonding, and connecting service entrance conductors. Grounding electrode system must be complete, and proper sized conductors must be used throughout.',
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });

      // Add general electrical information
      await this.addKnowledgeDocument({
        projectId,
        title: 'General Electrical Information',
        content: 'Standard outlet height is 12-16 inches from floor to center of box. Standard switch height is 48 inches from floor to center of box. Counter outlets should be 42-44 inches above the floor. Maximum spacing for receptacles is 12 feet along walls.',
        contentType: 'instruction',
        visibility: ContentVisibility.PUBLIC,
        createdBy: userId,
        updatedBy: userId
      });

      return true;
    } catch (error) {
      this.logger.error('Error adding standard electrical knowledge', { error, projectId });
      return false;
    }
  }

  /**
   * Search knowledge base for relevant documents
   * 
   * @param projectId - Project ID
   * @param query - Search query
   * @param userId - User ID making the query
   * @returns List of relevant documents
   */
  private async searchKnowledgeBase(
    projectId: string,
    query: string,
    userId: string
  ): Promise<any[]> {
    try {
      // 1. Get user to determine role
      const user = await this.getUser(userId);
      const isCompanyUser = user && user.role !== 'customer';
      
      // 2. Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      // 3. Get all project knowledge documents
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projectKnowledgeBase,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        }
      }));

      const documents = result.Items || [];
      
      // 4. Filter based on visibility and compute similarity
      const visibleDocuments = documents.filter(doc => {
        // Public documents visible to all
        if (doc.visibility === ContentVisibility.PUBLIC) {
          return true;
        }
        
        // Private documents only visible to company users
        if (doc.visibility === ContentVisibility.PRIVATE && isCompanyUser) {
          return true;
        }
        
        // Internal documents may have more specific role requirements
        if (doc.visibility === ContentVisibility.INTERNAL && isCompanyUser) {
          // Additional role checks could be implemented here
          return true;
        }
        
        return false;
      });

      // 5. Calculate similarity scores
      const scoredDocuments = visibleDocuments.map(doc => {
        // Calculate cosine similarity between query and document
        // In a real implementation, this would use the embeddings
        // For now, use a basic keyword matching approach
        const similarity = this.calculateSimilarity(
          queryEmbedding,
          doc.vectorEmbedding || []
        );
        
        return {
          ...doc,
          relevanceScore: similarity
        };
      });
      
      // 6. Sort by relevance and return top results
      return scoredDocuments
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 5); // Return top 5 most relevant docs
    } catch (error) {
      this.logger.error('Error searching knowledge base', { error, projectId, query });
      return [];
    }
  }

  /**
   * Generate response for a query
   * 
   * @param query - Customer query
   * @param relevantDocuments - Relevant knowledge documents
   * @returns Generated response
   */
  private async generateResponse(
    query: string,
    relevantDocuments: any[]
  ): Promise<IChatbotQueryResult> {
    try {
      // In a real implementation, this would call an LLM API
      // For now, use a simple response generation approach
      
      // Extract content from relevant documents
      const documentContents = relevantDocuments.map(doc => {
        try {
          // If content is JSON, parse it
          if (doc.contentType === 'estimate' || doc.contentType === 'blueprint') {
            const parsed = JSON.parse(doc.content);
            return {
              title: doc.title,
              content: this.flattenObject(parsed),
              documentId: doc.documentId,
              relevanceScore: doc.relevanceScore
            };
          }
          
          // Otherwise return as is
          return {
            title: doc.title,
            content: doc.content,
            documentId: doc.documentId,
            relevanceScore: doc.relevanceScore
          };
        } catch (e) {
          return {
            title: doc.title,
            content: doc.content,
            documentId: doc.documentId,
            relevanceScore: doc.relevanceScore
          };
        }
      });
      
      // Check if we have enough information
      const hasRelevantInfo = documentContents.some(doc => doc.relevanceScore > 0.7);
      const needsHumanReview = !hasRelevantInfo;
      
      // Generate a response based on available information
      let response = '';
      let confidence = 0;
      
      if (hasRelevantInfo) {
        // Use the most relevant document for response
        const mostRelevant = documentContents[0];
        
        if (query.toLowerCase().includes('when') || query.toLowerCase().includes('schedule')) {
          response = `Based on our project information, the schedule details are as follows: ${mostRelevant.content}`;
        } else if (query.toLowerCase().includes('cost') || query.toLowerCase().includes('price')) {
          response = `According to our estimate, the pricing information is: ${mostRelevant.content}`;
        } else if (query.toLowerCase().includes('material') || query.toLowerCase().includes('product')) {
          response = `The materials specified for this project are: ${mostRelevant.content}`;
        } else {
          response = `Here is the information I found that might help: ${mostRelevant.content}`;
        }
        
        confidence = mostRelevant.relevanceScore;
      } else {
        response = "I don't have enough information to answer your question confidently. I've forwarded your question to the project team, and someone will get back to you soon.";
        confidence = 0.2;
      }
      
      return {
        query,
        response,
        sources: documentContents,
        confidence,
        needsHumanReview
      };
    } catch (error) {
      this.logger.error('Error generating response', { error, query });
      return {
        query,
        response: "I'm sorry, I encountered an error while processing your question. I've notified the team about this issue.",
        sources: [],
        confidence: 0,
        needsHumanReview: true
      };
    }
  }

  /**
   * Flag a thread for human review
   * 
   * @param threadId - Thread ID
   * @param projectId - Project ID
   * @param query - Customer query
   */
  private async flagThreadForReview(
    threadId: string,
    projectId: string,
    query: string
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project || !project.manager || !project.manager.email) {
        this.logger.warn('Cannot flag thread for review - project manager not found', { projectId });
        return;
      }

      // Send email notification to project manager
      await this.sendGridService.sendEmail(
        project.manager.email,
        `Chat Needs Review - ${project.name}`,
        `A customer question in the project chat requires your review.

Project: ${project.name}
Question: "${query}"

You can view the conversation at: ${config.frontend.url}/projects/${projectId}/chat/${threadId}

This question has been automatically flagged because our system doesn't have enough information to provide a confident answer.`
      );

      this.logger.info('Thread flagged for review', { 
        threadId, 
        projectId,
        projectName: project.name,
        managerEmail: project.manager.email,
        query
      });
    } catch (error) {
      this.logger.error('Error flagging thread for review', { error, threadId, projectId });
      // Continue even if notification fails
    }
  }

  /**
   * Generate embedding for text
   * 
   * @param text - Text to embed
   * @returns Vector embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // In a real implementation, this would call an embedding API
    // For now, return a simple hash-based embedding
    
    // Convert text to lowercase and remove punctuation
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Create a simple embedding (this is just a placeholder implementation)
    // In a production system, use a proper embedding model API
    const embedding: number[] = [];
    const words = normalized.split(/\s+/);
    
    // Create a 100-dimensional embedding based on word hashes
    for (let i = 0; i < 100; i++) {
      let value = 0;
      for (const word of words) {
        // Simple hash function to generate a value based on word and position
        const hash = this.simpleHash(word + i);
        value += Math.sin(hash);
      }
      embedding.push(value);
    }