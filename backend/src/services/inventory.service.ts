

Start new chat
Projects
Chats
Recents
Verify GitHub Repository Files and Identify Remaining Tasks
Pushing Updated Files to GitHub Repo
Cloning a Git Repository to a New Folder
Building a Worm Compost System
Breath Control and Spiritual Mastery
Optimizing GitHub API Uploads for Large Files
Inventory Management Interfaces and Services
Review GitHub Repo for Missing Files
Implementing Modular ProjectService
Completing EstimationService Implementation
Completing Electrical Project Estimation Service
Completing EstimationService Implementation
Completing EstimationService Implementation
Completing Estimation Service Implementation
Comprehensive System for Electrical Contractors
Reviewing Files to Build Clear-Desk.com
Chatbot Service Template Completion
Automating Business Processes
Job Progress Tracking for Customer Invoices
Getting Started with LLM Code Assistant
Troubleshooting Blink Doorbell Alert Delays
Dealing with Neighbor's Grass-Eating Bunny
Tasty Uses for Leftover Smoked Pork Belly Burnt Ends
Fixing Python import errors in code assistant
Terminal UI with Note Memory
Uploading Python Files for LLM Code Assistant
Uploading .env File to Private Git Repo
Protecting Your Software Idea When Hiring Developers
Uploading LLM Code Assistant Files to GitHub
Converting Visual Studio Extension to Python LLM Code Assistant
View all
Professional plan

ER
erik@erikrusekelectric.com
ER

All projects


Electrical contractor management program
Private
Create a program to replace my back office




3.7 Sonnet

Choose style
Electrical contractor management program
No file chosen


Verify GitHub Repository Files and Identify Remaining Tasks
Last message 2 minutes ago 

Pushing Updated Files to GitHub Repo
Last message 11 minutes ago 

Optimizing GitHub API Uploads for Large Files
Last message 2 hours ago 

Inventory Management Interfaces and Services
Last message 3 hours ago 

Review GitHub Repo for Missing Files
Last message 3 hours ago 

Implementing Modular ProjectService
Last message 4 hours ago 

Completing EstimationService Implementation
Last message 16 hours ago 

Completing Electrical Project Estimation Service
Last message 17 hours ago 

Completing EstimationService Implementation
Last message 17 hours ago 

Completing EstimationService Implementation
Last message 18 hours ago 

Completing Estimation Service Implementation
Last message 20 hours ago 

Comprehensive System for Electrical Contractors
Last message 20 hours ago 

Reviewing Files to Build Clear-Desk.com
Last message 21 hours ago 

Chatbot Service Template Completion
Last message 22 hours ago 

Automating Business Processes
Last message 23 hours ago 

Project knowledge


“
Need to review my shared files and also github repo erusek1, clear-desk. I need all files to follow the same structure as the shared templates. Always review github before coding looking to keep this as seamless as possible. all files are to be pushed to git hub and large files need to be seperated into chunks in order to not run out of memory trying to push a large file. THink more efficiently
Edit
27% of knowledge capacity used

text
updated inventory services
2 minutes ago


text
GitHub API Size Limitations
3 hours ago


txt
Inspection Service
23 hours ago
•
Large file


text
Idea expanded
23 hours ago


txt
SendGrid Service
23 hours ago


txt
Time Tracking Service
23 hours ago
•
Large file


txt
Inventory Service
23 hours ago


txt
Auth Utility
23 hours ago


txt
Response Utility
23 hours ago


txt
Logger Utility
23 hours ago


txt
Configuration Template
23 hours ago


txt
Blueprint Type Definitions
23 hours ago


txt
Service Layer Template
23 hours ago


text
Idea refined
23 hours ago


txt
React Component Template
23 hours ago


txt
Lambda Function Template
23 hours ago


md
Database Schema Design
23 hours ago


md
API Design Guidelines
23 hours ago


md
Git Workflow and Commit Standards
23 hours ago


md
Coding Standards and Style Guide
23 hours ago


txt
Project Directory Structure
23 hours ago


text
Idea expanded
1 day ago


text
Original idea
1 day ago

Claude
Inspection Service.txt

32.08 KB •1,120 lines
•
Formatting may be inconsistent from source

// backend/src/services/inspection.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { SendGridService } from './sendgrid.service';

/**
 * Inspection status enum
 */
export enum InspectionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RESCHEDULED = 'rescheduled'
}

/**
 * Inspection item interface
 */
export interface IInspectionItem {
  itemId: string;
  category: string;
  question: string;
  response: 'yes' | 'no' | 'n/a' | null;
  comment?: string;
  photos?: {
    s3Key: string;
    caption?: string;
    uploadTime: string;
  }[];
  required: boolean;
  estimateItemId?: string;
}

/**
 * Inspection checklist interface
 */
export interface IInspectionChecklist {
  inspectionId: string;
  projectId: string;
  phase: string; // rough, service, finish, etc.
  status: InspectionStatus;
  scheduledDate?: string;
  completedDate?: string;
  inspector?: string;
  items: IInspectionItem[];
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Inspection template interface
 */
export interface IInspectionTemplate {
  templateId: string;
  companyId: string;
  name: string;
  phase: string;
  items: {
    category: string;
    question: string;
    required: boolean;
  }[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Inspection service for managing inspection checklists
 */
export class InspectionService {
  private logger: Logger;
  private sendGridService: SendGridService;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('InspectionService');
    this.sendGridService = new SendGridService();
  }

  /**
   * Generate an inspection checklist for a project phase
   * 
   * @param projectId - Project ID
   * @param phase - Project phase (rough, service, etc.)
   * @param userId - User ID generating the checklist
   * @param templateId - Optional template ID to use
   * @param scheduledDate - Optional scheduled inspection date
   * @returns Generated inspection checklist
   */
  async generateInspectionChecklist(
    projectId: string,
    phase: string,
    userId: string,
    templateId?: string,
    scheduledDate?: string
  ): Promise<IInspectionChecklist> {
    try {
      const inspectionId = uuidv4();
      const now = new Date().toISOString();
      
      // Get template or default items
      const items = await this.getTemplateItems(projectId, phase, templateId);
      
      // Get estimate items for this phase to include in checklist
      const estimateItems = await this.getEstimateItems(projectId, phase);
      
      // Create checklist record
      const newChecklist: IInspectionChecklist = {
        inspectionId,
        projectId,
        phase,
        status: InspectionStatus.PENDING,
        scheduledDate,
        items: [
          ...items,
          ...estimateItems
        ],
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save checklist to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `INSPECTION#${phase}#${inspectionId}`,
          GSI1PK: `PHASE#${phase}`,
          GSI1SK: `PROJECT#${projectId}`,
          ...newChecklist
        }
      }));

      // Notify relevant parties about the scheduled inspection
      if (scheduledDate) {
        await this.notifyInspectionScheduled(projectId, phase, scheduledDate, inspectionId);
      }

      return newChecklist;
    } catch (error) {
      this.logger.error('Error generating inspection checklist', { error, projectId, phase });
      throw error;
    }
  }

  /**
   * Get inspection checklist by ID
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @returns Inspection checklist or null if not found
   */
  async getInspectionChecklist(
    projectId: string,
    phase: string,
    inspectionId: string
  ): Promise<IInspectionChecklist | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `INSPECTION#${phase}#${inspectionId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IInspectionChecklist;
    } catch (error) {
      this.logger.error('Error getting inspection checklist', { error, projectId, phase, inspectionId });
      throw error;
    }
  }

  /**
   * List inspection checklists for a project
   * 
   * @param projectId - Project ID
   * @param phase - Optional phase filter
   * @returns List of inspection checklists
   */
  async listProjectInspections(
    projectId: string,
    phase?: string
  ): Promise<IInspectionChecklist[]> {
    try {
      let keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `PROJECT#${projectId}`,
        ':sk': 'INSPECTION#'
      };

      // Add phase filter if provided
      if (phase) {
        keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':sk': `INSPECTION#${phase}#`
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as IInspectionChecklist[];
    } catch (error) {
      this.logger.error('Error listing project inspections', { error, projectId, phase });
      throw error;
    }
  }

  /**
   * Update inspection checklist status
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @param status - New status
   * @param userId - User ID making the update
   * @param completedDate - Optional completion date (required for COMPLETED status)
   * @returns Updated inspection checklist
   */
  async updateInspectionStatus(
    projectId: string,
    phase: string,
    inspectionId: string,
    status: InspectionStatus,
    userId: string,
    completedDate?: string
  ): Promise<IInspectionChecklist | null> {
    try {
      // Validate that completedDate is provided for COMPLETED status
      if (status === InspectionStatus.COMPLETED && !completedDate) {
        throw new Error('Completion date is required for COMPLETED status');
      }

      // Prepare update expression
      let updateExpression = 'set #status = :status, updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeNames = {
        '#status': 'status'
      };
      const expressionAttributeValues: Record<string, any> = {
        ':status': status,
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };

      // Add completedDate if provided
      if (completedDate) {
        updateExpression += ', completedDate = :completedDate';
        expressionAttributeValues[':completedDate'] = completedDate;
      }

      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `INSPECTION#${phase}#${inspectionId}`
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      // If inspection was completed or failed, notify relevant parties
      if (
        status === InspectionStatus.COMPLETED || 
        status === InspectionStatus.FAILED
      ) {
        await this.notifyInspectionCompleted(
          projectId, 
          phase, 
          inspectionId, 
          status
        );
      }

      return result.Attributes as IInspectionChecklist;
    } catch (error) {
      this.logger.error('Error updating inspection status', { error, projectId, phase, inspectionId });
      throw error;
    }
  }

  /**
   * Update inspection item response
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @param itemId - Item ID
   * @param response - Response value
   * @param comment - Optional comment
   * @param userId - User ID making the update
   * @returns Updated inspection checklist
   */
  async updateInspectionItemResponse(
    projectId: string,
    phase: string,
    inspectionId: string,
    itemId: string,
    response: 'yes' | 'no' | 'n/a',
    comment: string | undefined,
    userId: string
  ): Promise<IInspectionChecklist | null> {
    try {
      // Get existing checklist
      const checklist = await this.getInspectionChecklist(projectId, phase, inspectionId);
      if (!checklist) {
        throw new Error('Inspection checklist not found');
      }

      // Find and update the item
      const itemIndex = checklist.items.findIndex(item => item.itemId === itemId);
      if (itemIndex === -1) {
        throw new Error('Inspection item not found');
      }

      // Update checklist items
      const updatedItems = [...checklist.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        response,
        comment: comment || updatedItems[itemIndex].comment
      };

      // Update the checklist in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `INSPECTION#${phase}#${inspectionId}`
        },
        UpdateExpression: 'set items = :items, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':items': updatedItems,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IInspectionChecklist;
    } catch (error) {
      this.logger.error('Error updating inspection item response', { 
        error, projectId, phase, inspectionId, itemId 
      });
      throw error;
    }
  }

  /**
   * Add photo to inspection item
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @param itemId - Item ID
   * @param fileKey - S3 file key
   * @param caption - Optional photo caption
   * @param userId - User ID adding the photo
   * @returns Updated inspection checklist
   */
  async addPhotoToInspectionItem(
    projectId: string,
    phase: string,
    inspectionId: string,
    itemId: string,
    fileKey: string,
    caption: string | undefined,
    userId: string
  ): Promise<IInspectionChecklist | null> {
    try {
      // Get existing checklist
      const checklist = await this.getInspectionChecklist(projectId, phase, inspectionId);
      if (!checklist) {
        throw new Error('Inspection checklist not found');
      }

      // Find the item
      const itemIndex = checklist.items.findIndex(item => item.itemId === itemId);
      if (itemIndex === -1) {
        throw new Error('Inspection item not found');
      }

      // Create a new photo
      const newPhoto = {
        s3Key: fileKey,
        caption,
        uploadTime: new Date().toISOString()
      };

      // Update the item's photos
      const updatedItems = [...checklist.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        photos: [...(updatedItems[itemIndex].photos || []), newPhoto]
      };

      // Update the checklist in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.inspectionChecklists,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `INSPECTION#${phase}#${inspectionId}`
        },
        UpdateExpression: 'set items = :items, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':items': updatedItems,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IInspectionChecklist;
    } catch (error) {
      this.logger.error('Error adding photo to inspection item', { 
        error, projectId, phase, inspectionId, itemId 
      });
      throw error;
    }
  }

  /**
   * Generate signed URL for photo upload
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @param fileName - Original file name
   * @returns Signed URL and file key
   */
  async generatePhotoUploadUrl(
    projectId: string,
    phase: string,
    inspectionId: string,
    fileName: string
  ): Promise<{ url: string, fileKey: string }> {
    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const fileKey = `inspections/${projectId}/${phase}/${inspectionId}/${uuidv4()}.${fileExtension}`;
      
      const command = new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey,
        ContentType: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        url: signedUrl,
        fileKey
      };
    } catch (error) {
      this.logger.error('Error generating photo upload URL', { error, projectId, phase, inspectionId });
      throw error;
    }
  }

  /**
   * Create inspection template
   * 
   * @param template - Template data
   * @returns Created template
   */
  async createInspectionTemplate(
    template: Omit<IInspectionTemplate, 'templateId' | 'created' | 'updated'>
  ): Promise<IInspectionTemplate> {
    try {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      
      // Create template record
      const newTemplate: IInspectionTemplate = {
        templateId,
        ...template,
        created: now,
        updated: now
      };

      // Save template to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.inspectionTemplates,
        Item: {
          PK: `COMPANY#${template.companyId}`,
          SK: `TEMPLATE#${template.phase}#${templateId}`,
          GSI1PK: `TEMPLATE#${template.phase}`,
          GSI1SK: `COMPANY#${template.companyId}`,
          ...newTemplate
        }
      }));

      return newTemplate;
    } catch (error) {
      this.logger.error('Error creating inspection template', { error, template });
      throw error;
    }
  }

  /**
   * List inspection templates for a company and phase
   * 
   * @param companyId - Company ID
   * @param phase - Optional phase filter
   * @returns List of inspection templates
   */
  async listInspectionTemplates(
    companyId: string,
    phase?: string
  ): Promise<IInspectionTemplate[]> {
    try {
      let keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `COMPANY#${companyId}`,
        ':sk': 'TEMPLATE#'
      };

      // Add phase filter if provided
      if (phase) {
        keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
        expressionAttributeValues = {
          ':pk': `COMPANY#${companyId}`,
          ':sk': `TEMPLATE#${phase}#`
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.inspectionTemplates,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as IInspectionTemplate[];
    } catch (error) {
      this.logger.error('Error listing inspection templates', { error, companyId, phase });
      throw error;
    }
  }

  /**
   * Get template items
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param templateId - Optional template ID
   * @returns List of inspection items
   */
  private async getTemplateItems(
    projectId: string,
    phase: string,
    templateId?: string
  ): Promise<IInspectionItem[]> {
    try {
      let items: IInspectionItem[] = [];

      // Get project to retrieve company ID
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // If templateId is provided, use that specific template
      if (templateId) {
        const template = await this.getTemplate(project.companyId, phase, templateId);
        if (template) {
          items = template.items.map(item => ({
            itemId: uuidv4(),
            category: item.category,
            question: item.question,
            response: null,
            required: item.required
          }));
        }
      } else {
        // Get default template for this phase
        const templates = await this.listInspectionTemplates(project.companyId, phase);
        if (templates.length > 0) {
          // Use the first template as default
          items = templates[0].items.map(item => ({
            itemId: uuidv4(),
            category: item.category,
            question: item.question,
            response: null,
            required: item.required
          }));
        }
      }

      // If no templates were found, use basic default items
      if (items.length === 0) {
        // Create default items based on phase
        switch (phase) {
          case 'rough':
            items = this.getDefaultRoughItems();
            break;
          case 'service':
            items = this.getDefaultServiceItems();
            break;
          case 'finish':
            items = this.getDefaultFinishItems();
            break;
          default:
            items = this.getDefaultGeneralItems();
        }
      }

      return items;
    } catch (error) {
      this.logger.error('Error getting template items', { error, projectId, phase, templateId });
      return this.getDefaultGeneralItems(); // Fallback to default items
    }
  }

  /**
   * Get default rough inspection items
   * 
   * @returns List of default rough inspection items
   */
  private getDefaultRoughItems(): IInspectionItem[] {
    return [
      {
        itemId: uuidv4(),
        category: 'Electrical Box Installation',
        question: 'Are boxes securely fastened to studs/joists?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Electrical Box Installation',
        question: 'Are the correct box sizes used for wire fill?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Wiring',
        question: 'Are staples within 12" of boxes and then every 4 feet?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Wiring',
        question: 'Are all grounds properly connected?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Wiring',
        question: 'Is wire sizing appropriate for the circuits?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Drilling/Notching',
        question: 'Are holes drilled in appropriate locations in studs/joists?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Drilling/Notching',
        question: 'Are nail plates installed where needed?',
        response: null,
        required: true
      }
    ];
  }

  /**
   * Get default service inspection items
   * 
   * @returns List of default service inspection items
   */
  private getDefaultServiceItems(): IInspectionItem[] {
    return [
      {
        itemId: uuidv4(),
        category: 'Service Panel',
        question: 'Is the service panel securely mounted?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Service Panel',
        question: 'Is proper grounding and bonding in place?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Service Entrance',
        question: 'Are service entrance conductors properly sized?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Service Entrance',
        question: 'Is weatherhead properly installed?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Grounding',
        question: 'Is the grounding electrode system complete?',
        response: null,
        required: true
      }
    ];
  }

  /**
   * Get default finish inspection items
   * 
   * @returns List of default finish inspection items
   */
  private getDefaultFinishItems(): IInspectionItem[] {
    return [
      {
        itemId: uuidv4(),
        category: 'Devices',
        question: 'Are all receptacles securely installed and level?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Devices',
        question: 'Are GFCI/AFCI receptacles installed where required?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Fixtures',
        question: 'Are all lighting fixtures securely mounted?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Fixtures',
        question: 'Do all fixtures work properly?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Panel',
        question: 'Is the panel directory accurately labeled?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Testing',
        question: 'Have all circuits been tested for proper operation?',
        response: null,
        required: true
      }
    ];
  }

  /**
   * Get default general inspection items
   * 
   * @returns List of default general inspection items
   */
  private getDefaultGeneralItems(): IInspectionItem[] {
    return [
      {
        itemId: uuidv4(),
        category: 'General',
        question: 'Does installation match approved plans?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'General',
        question: 'Are all materials listed and labeled?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Safety',
        question: 'Are all electrical hazards addressed?',
        response: null,
        required: true
      },
      {
        itemId: uuidv4(),
        category: 'Code Compliance',
        question: 'Does installation comply with NEC requirements?',
        response: null,
        required: true
      }
    ];
  }

  /**
   * Get estimate items for a phase
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @returns List of inspection items derived from estimate
   */
  private async getEstimateItems(projectId: string, phase: string): Promise<IInspectionItem[]> {
    try {
      // Get latest estimate for project
      const estimate = await this.getProjectEstimate(projectId);
      if (!estimate) {
        return [];
      }

      const items: IInspectionItem[] = [];

      // Filter rooms based on phase
      for (const room of estimate.rooms) {
        for (const item of room.items) {
          // Get assembly details to determine its phase
          const assembly = await this.getAssembly(item.assemblyId);
          
          if (assembly && assembly.phase === phase) {
            // Create an inspection item for this assembly
            items.push({
              itemId: uuidv4(),
              category: `${room.name}`,
              question: `${item.quantity}x ${assembly.name} installed correctly?`,
              response: null,
              required: true,
              estimateItemId: item.id
            });
          }
        }
      }

      return items;
    } catch (error) {
      this.logger.error('Error getting estimate items', { error, projectId, phase });
      return [];
    }
  }

  /**
   * Get project details
   * 
   * @param projectId - Project ID
   * @returns Project details or null if not found
   */
  private async getProject(projectId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item;
    } catch (error) {
      this.logger.error('Error getting project', { error, projectId });
      return null;
    }
  }

  /**
   * Get inspection template
   * 
   * @param companyId - Company ID
   * @param phase - Project phase
   * @param templateId - Template ID
   * @returns Template or null if not found
   */
  private async getTemplate(
    companyId: string,
    phase: string,
    templateId: string
  ): Promise<IInspectionTemplate | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.inspectionTemplates,
        Key: {
          PK: `COMPANY#${companyId}`,
          SK: `TEMPLATE#${phase}#${templateId}`
        }
      }));

      return result.Item as IInspectionTemplate || null;
    } catch (error) {
      this.logger.error('Error getting template', { error, companyId, phase, templateId });
      return null;
    }
  }

  /**
   * Get project estimate
   * 
   * @param projectId - Project ID
   * @returns Latest estimate or null if not found
   */
  private async getProjectEstimate(projectId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.estimates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'ESTIMATE#'
        },
        ScanIndexForward: false, // Get newest first
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0];
    } catch (error) {
      this.logger.error('Error getting project estimate', { error, projectId });
      return null;
    }
  }

  /**
   * Get assembly details
   * 
   * @param assemblyId - Assembly ID
   * @returns Assembly details or null if not found
   */
  private async getAssembly(assemblyId: string): Promise<any | null> {
    try {
      // Connect to MongoDB
      const mongoClient = new MongoClient(config.mongodb.uri);
      await mongoClient.connect();
      
      const db = mongoClient.db(config.mongodb.dbName);
      const assembliesCollection = db.collection(config.mongodb.collections.assemblies);
      
      // Query for assembly
      const assembly = await assembliesCollection.findOne({ _id: assemblyId });
      
      // Close connection
      await mongoClient.close();
      
      return assembly;
    } catch (error) {
      this.logger.error('Error getting assembly', { error, assemblyId });
      return null;
    }
  }

  /**
   * Notify relevant parties about scheduled inspection
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param scheduledDate - Scheduled inspection date
   * @param inspectionId - Inspection ID
   */
  private async notifyInspectionScheduled(
    projectId: string,
    phase: string,
    scheduledDate: string,
    inspectionId: string
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        this.logger.warn('Cannot send inspection notification - project not found', { projectId });
        return;
      }

      // Format date for display
      const formattedDate = new Date(scheduledDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Format phase for display
      const formattedPhase = phase.charAt(0).toUpperCase() + phase.slice(1);

      // Send email to project manager
      if (project.manager && project.manager.email) {
        await this.sendGridService.sendEmail(
          project.manager.email,
          `${formattedPhase} Inspection Scheduled - ${project.name}`,
          `An inspection for the ${formattedPhase} phase of project ${project.name} has been scheduled for ${formattedDate}. 
          
You can view and prepare for this inspection at: ${config.frontend.url}/projects/${projectId}/inspections/${inspectionId}`
        );
      }

      // Send email to foreman if available
      if (project.foreman && project.foreman.email) {
        await this.sendGridService.sendEmail(
          project.foreman.email,
          `${formattedPhase} Inspection Scheduled - ${project.name}`,
          `An inspection for the ${formattedPhase} phase of project ${project.name} has been scheduled for ${formattedDate}.
          
Please prepare for this inspection and complete the pre-inspection checklist at: ${config.frontend.url}/projects/${projectId}/inspections/${inspectionId}`
        );
      }
    } catch (error) {
      this.logger.error('Error sending inspection notification', { error, projectId, phase });
      // Continue even if notification fails
    }
  }

  /**
   * Notify relevant parties about completed inspection
   * 
   * @param projectId - Project ID
   * @param phase - Project phase
   * @param inspectionId - Inspection ID
   * @param status - Inspection status
   */
  private async notifyInspectionCompleted(
    projectId: string,
    phase: string,
    inspectionId: string,
    status: InspectionStatus
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        this.logger.warn('Cannot send inspection completion notification - project not found', { projectId });
        return;
      }

      // Format phase for display
      const formattedPhase = phase.charAt(0).toUpperCase() + phase.slice(1);
      
      // Create subject and message based on status
      const subject = `${formattedPhase} Inspection ${status === InspectionStatus.COMPLETED ? 'Passed' : 'Failed'} - ${project.name}`;
      const message = `The ${formattedPhase} inspection for project ${project.name} has been ${status === InspectionStatus.COMPLETED ? 'passed' : 'failed'}.
      
You can view the inspection results at: ${config.frontend.url}/projects/${projectId}/inspections/${inspectionId}`;

      // Send email to project manager
      if (project.manager && project.manager.email) {
        await this.sendGridService.sendEmail(
          project.manager.email,
          subject,
          message
        );
      }

      // Send email to foreman if available
      if (project.foreman && project.foreman.email) {
        await this.sendGridService.sendEmail(
          project.foreman.email,
          subject,
          message
        );
      }

      // Send email to customer if appropriate
      if (status === InspectionStatus.COMPLETED && project.customer && project.customer.email) {
        await this.sendGridService.sendEmail(
          project.customer.email,
          `${formattedPhase} Stage Inspection Passed - ${project.name}`,
          `Good news! The ${formattedPhase} inspection for your project has been passed. The project can now move to the next phase.`
        );
      }
    } catch (error) {
      this.logger.error('Error sending inspection completion notification', { error, projectId, phase });
      // Continue even if notification fails
    }
  }
}