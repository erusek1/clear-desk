// backend/src/types/chatbot.types.ts

/**
 * Content visibility level for knowledge base content
 */
export enum ContentVisibility {
    PUBLIC = 'public',    // Visible to all
    PRIVATE = 'private',  // Visible only to company users
    INTERNAL = 'internal' // Visible only to specific roles
  }
  
  /**
   * Knowledge document interface
   */
  export interface IKnowledgeDocument {
    documentId: string;
    projectId: string;
    title: string;
    content: string;
    contentType: 'estimate' | 'blueprint' | 'note' | 'communication' | 'instruction';
    visibility: ContentVisibility;
    metadata?: Record<string, any>;
    vectorEmbedding?: number[];
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Private note interface
   */
  export interface IPrivateNote {
    noteId: string;
    projectId: string;
    itemId?: string;
    content: string;
    context?: string;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Chat message interface
   */
  export interface IChatMessage {
    messageId: string;
    projectId: string;
    threadId: string;
    sender: string;
    senderType: 'user' | 'system' | 'bot';
    content: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }
  
  /**
   * Chat thread interface
   */
  export interface IChatThread {
    threadId: string;
    projectId: string;
    title: string;
    created: string;
    updated: string;
    participants: string[];
    status: 'active' | 'archived';
  }
  
  /**
   * Chatbot query result interface
   */
  export interface IChatbotQueryResult {
    query: string;
    response: string;
    sources: {
      documentId: string;
      title: string;
      content: string;
      relevanceScore: number;
    }[];
    confidence: number;
    needsHumanReview: boolean;
  }
  
  /**
   * Knowledge base search result
   */
  export interface IKnowledgeSearchResult {
    documents: {
      documentId: string;
      title: string;
      content: string;
      contentType: string;
      relevanceScore: number;
    }[];
    query: string;
  }