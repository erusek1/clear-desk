// backend/src/services/permit.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { MongoClient } from 'mongodb';
import { Logger } from '../utils/logger';
import config from '../config';
import { 
  IPermit, 
  PermitType, 
  PermitStatus, 
  IPermitAssemblyMapping,
  IPermitGenerationResponse, 
  IPermitSubmissionResponse,
  IPermitApplicationRequest
} from '../types/permit.types';
import { TimelineEventType, TimelineEventStatus } from '../types/timeline.types';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Service for managing permits
 */
export class PermitService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assembliesCollection: any = null;
  private permitMappingsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client,
    private timelineService?: any
  ) {
    this.logger = new Logger('PermitService');
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
        this.assembliesCollection = db.collection(config.mongodb.collections.assemblies);
        this.permitMappingsCollection = db.collection('permitMappings');
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Get permit by ID
   * 
   * @param permitId - Permit ID
   * @returns Permit data or null if not found
   */
  async getPermit(permitId: string): Promise<IPermit | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item as IPermit || null;
    } catch (error) {
      this.logger.error('Error getting permit', { error, permitId });
      throw error;
    }
  }

  /**
   * List permits for a project
   * 
   * @param projectId - Project ID
   * @returns List of permits
   */
  async listProjectPermits(projectId: string): Promise<IPermit[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.permits,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        }
      }));

      return (result.Items || []) as IPermit[];
    } catch (error) {
      this.logger.error('Error listing project permits', { error, projectId });
      throw error;
    }
  }

  /**
   * Create permit application from estimate
   * 
   * @param applicationData - Permit application request data
   * @param userId - User ID creating the permit
   * @returns Created permit data
   */
  async createPermitApplication(
    applicationData: IPermitApplicationRequest,
    userId: string
  ): Promise<IPermit> {
    try {
      // Validate input
      if (!applicationData.projectId || !applicationData.permitType) {
        throw new Error('Missing required fields: projectId, permitType');
      }

      // Get project data
      const project = await this.getProject(applicationData.projectId);
      if (!project) {
        throw new Error(`Project ${applicationData.projectId} not found`);
      }

      // Get latest estimate for the project
      const estimate = await this.getLatestEstimate(applicationData.projectId);
      if (!estimate) {
        throw new Error(`No estimates found for project ${applicationData.projectId}`);
      }

      // Generate permit application data
      const permitId = uuidv4();
      const now = new Date().toISOString();

      // Extract electrical data from estimate if it's an electrical permit
      let electricalData = {};
      if (applicationData.permitType === PermitType.ELECTRICAL) {
        electricalData = await this.extractElectricalDataFromEstimate(estimate);
      }

      // Create permit record
      const permit: IPermit = {
        permitId,
        projectId: applicationData.projectId,
        permitType: applicationData.permitType,
        status: PermitStatus.DRAFT,
        applicationData: {
          jurisdiction: applicationData.jurisdiction || project.address?.city || '',
          propertyOwner: applicationData.propertyOwner || {
            name: project.customer?.name || '',
            address: project.address?.street || '',
            phone: project.customer?.phone || '',
            email: project.customer?.email
          },
          jobAddress: project.address?.street || '',
          jobDescription: applicationData.jobDescription || project.name || '',
          valuation: applicationData.valuation || estimate.totalCost || 0,
          contractorInfo: {
            name: project.company?.name || '',
            license: project.company?.licenses?.[0] || '',
            address: project.company?.address || '',
            phone: project.company?.phone || '',
            email: project.company?.email || ''
          },
          ...(applicationData.permitType === PermitType.ELECTRICAL && { electrical: electricalData })
        },
        fees: {
          permitFee: 0,
          planReviewFee: 0,
          inspectionFees: 0,
          totalFees: 0
        },
        inspections: {
          required: this.getRequiredInspections(applicationData.permitType)
        },
        documents: [],
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save permit to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.permits,
        Item: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA',
          GSI1PK: `PROJECT#${applicationData.projectId}`,
          GSI1SK: `PERMIT#${permitId}`,
          ...permit
        }
      }));

      // Add timeline event if timeline service is available
      if (this.timelineService) {
        await this.timelineService.addEvent({
          projectId: applicationData.projectId,
          eventType: TimelineEventType.PERMIT_SUBMITTED,
          title: `${applicationData.permitType.charAt(0).toUpperCase() + applicationData.permitType.slice(1)} Permit Application Created`,
          status: TimelineEventStatus.PENDING,
          scheduledDate: now,
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId);
      }

      return permit;
    } catch (error) {
      this.logger.error('Error creating permit application', { error, applicationData });
      throw error;
    }
  }

  /**
   * Generate PDF permit form
   * 
   * @param permitId - Permit ID
   * @param userId - User ID generating the permit
   * @returns Permit generation response
   */
  async generatePermitForm(permitId: string, userId: string): Promise<IPermitGenerationResponse> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Generate PDF based on permit type
      const pdfBuffer = await this.createPermitPdf(permit);

      // Save PDF to S3
      const fileName = `${permit.permitType}_permit_${permitId}.pdf`;
      const s3Key = `permits/${permit.projectId}/${fileName}`;
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
      }));

      // Update permit with document reference
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set documents = list_append(if_not_exists(documents, :empty_list), :document), updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':document': [{
            s3Key,
            name: fileName,
            type: 'application',
            uploadDate: new Date().toISOString()
          }],
          ':empty_list': [],
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        }
      }));

      // Generate download URL
      const downloadUrl = await this.getSignedDownloadUrl(s3Key);

      return {
        permitId,
        fileUrl: downloadUrl,
        previewUrl: downloadUrl,
        message: 'Permit form generated successfully'
      };
    } catch (error) {
      this.logger.error('Error generating permit form', { error, permitId });
      throw error;
    }
  }

  /**
   * Submit permit to authority
   * 
   * @param permitId - Permit ID
   * @param submissionNotes - Optional submission notes
   * @param userId - User ID submitting the permit
   * @returns Permit submission response
   */
  async submitPermit(
    permitId: string, 
    submissionNotes?: string,
    userId?: string
  ): Promise<IPermitSubmissionResponse> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Update permit status
      const submissionDate = new Date().toISOString();
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set #status = :status, submissionDate = :submissionDate, notes = :notes, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': PermitStatus.SUBMITTED,
          ':submissionDate': submissionDate,
          ':notes': submissionNotes || permit.notes || '',
          ':updated': submissionDate,
          ':updatedBy': userId || permit.createdBy
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        throw new Error(`Failed to update permit ${permitId}`);
      }

      const updatedPermit = result.Attributes as IPermit;

      // Update timeline event
      if (this.timelineService) {
        await this.timelineService.addEvent({
          projectId: permit.projectId,
          eventType: TimelineEventType.PERMIT_SUBMITTED,
          title: `${permit.permitType.charAt(0).toUpperCase() + permit.permitType.slice(1)} Permit Submitted`,
          description: submissionNotes,
          status: TimelineEventStatus.COMPLETED,
          scheduledDate: submissionDate,
          actualDate: submissionDate,
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId || permit.createdBy);
      }

      // Trigger pre-construction checklist if applicable
      await this.triggerPreConstructionChecklist(permit.projectId, permit.permitType);

      return {
        permitId,
        status: PermitStatus.SUBMITTED,
        submissionDate,
        message: 'Permit submitted successfully'
      };
    } catch (error) {
      this.logger.error('Error submitting permit', { error, permitId });
      throw error;
    }
  }

  /**
   * Update permit status
   * 
   * @param permitId - Permit ID
   * @param status - New status
   * @param permitNumber - Optional permit number (for approved permits)
   * @param expirationDate - Optional expiration date (for approved permits)
   * @param userId - User ID updating the status
   * @returns Updated permit
   */
  async updatePermitStatus(
    permitId: string,
    status: PermitStatus,
    permitNumber?: string,
    expirationDate?: string,
    userId?: string
  ): Promise<IPermit | null> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Prepare update expression
      let updateExpression = 'set #status = :status, updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeNames = {
        '#status': 'status'
      };
      const expressionAttributeValues: Record<string, any> = {
        ':status': status,
        ':updated': new Date().toISOString(),
        ':updatedBy': userId || permit.updatedBy
      };

      // Add permit number and expiration date if provided
      if (status === PermitStatus.APPROVED) {
        if (permitNumber) {
          updateExpression += ', permitNumber = :permitNumber';
          expressionAttributeValues[':permitNumber'] = permitNumber;
        }
        
        updateExpression += ', approvalDate = :approvalDate';
        expressionAttributeValues[':approvalDate'] = new Date().toISOString();
        
        if (expirationDate) {
          updateExpression += ', expirationDate = :expirationDate';
          expressionAttributeValues[':expirationDate'] = expirationDate;
        }
      }

      // Update permit status
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      const updatedPermit = result.Attributes as IPermit;

      // Update timeline event
      if (this.timelineService && status === PermitStatus.APPROVED) {
        await this.timelineService.addEvent({
          projectId: permit.projectId,
          eventType: TimelineEventType.PERMIT_APPROVED,
          title: `${permit.permitType.charAt(0).toUpperCase() + permit.permitType.slice(1)} Permit Approved`,
          description: `Permit number: ${permitNumber || 'Not assigned'}`,
          status: TimelineEventStatus.COMPLETED,
          scheduledDate: new Date().toISOString(),
          actualDate: new Date().toISOString(),
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId || permit.updatedBy);
      }

      return updatedPermit;
    } catch (error) {
      this.logger.error('Error updating permit status', { error, permitId });
      throw error;
    }
  }

  /**
   * Get permit types
   * 
   * @returns List of permit types
   */
  getPermitTypes(): string[] {
    return Object.values(PermitType);
  }

  /**
   * Get required inspections for a permit type
   * 
   * @param permitType - Permit type
   * @returns List of required inspections
   */
  private getRequiredInspections(permitType: PermitType): string[] {
    switch (permitType) {
      case PermitType.ELECTRICAL:
        return ['Rough-In', 'Service', 'Final'];
      case PermitType.FIRE:
        return ['Rough-In', 'Final'];
      case PermitType.BUILDING:
        return ['Foundation', 'Framing', 'Final'];
      case PermitType.MECHANICAL:
        return ['Rough-In', 'Final'];
      case PermitType.PLUMBING:
        return ['Underground', 'Rough-In', 'Final'];
      default:
        return ['Final'];
    }
  }

  /**
   * Extract electrical data from estimate
   * 
   * @param estimate - Project estimate
   * @returns Electrical permit data
   */
  private async extractElectricalDataFromEstimate(estimate: any): Promise<any> {
    try {
      await this.initMongo();

      // Initialize counters
      const electricalData = {
        serviceSize: 200, // Default value
        serviceType: 'Permanent', // Default value
        voltageType: '120/240V', // Default value
        phase: 'Single-phase', // Default value
        newCircuits: 0,
        outlets: 0,
        switches: 0,
        fixtures: 0,
        appliances: 0,
        hvacUnits: 0
      };

      // Get list of all assemblies used in estimate
      const assemblyIds: string[] = [];
      if (estimate.rooms && Array.isArray(estimate.rooms)) {
        for (const room of estimate.rooms) {
          if (room.items && Array.isArray(room.items)) {
            for (const item of room.items) {
              if (item.assemblyId) {
                assemblyIds.push(item.assemblyId);
              }
            }
          }
        }
      }

      // Get unique assembly IDs
      const uniqueAssemblyIds = [...new Set(assemblyIds)];

      // Get assembly data from MongoDB
      const assemblies = await this.assembliesCollection.find({
        _id: { $in: uniqueAssemblyIds }
      }).toArray();

      // Get permit mappings from MongoDB
      const permitMappings = await this.permitMappingsCollection.find({
        assemblyId: { $in: uniqueAssemblyIds },
        permitType: PermitType.ELECTRICAL
      }).toArray();

      // Create a mapping of assembly IDs to their permit field mappings
      const assemblyPermitMappings: Record<string, IPermitAssemblyMapping> = {};
      for (const mapping of permitMappings) {
        assemblyPermitMappings[mapping.assemblyId] = mapping;
      }

      // Count items by permit field mapping
      if (estimate.rooms && Array.isArray(estimate.rooms)) {
        for (const room of estimate.rooms) {
          if (room.items && Array.isArray(room.items)) {
            for (const item of room.items) {
              if (item.assemblyId && assemblyPermitMappings[item.assemblyId]) {
                const mapping = assemblyPermitMappings[item.assemblyId];
                const field = mapping.permitFieldMapping;
                const quantity = (item.quantity || 1) * (mapping.countFactor || 1);
                
                if (field && field in electricalData) {
                  // @ts-ignore - dynamically accessing property
                  electricalData[field] += quantity;
                }
                
                // Count circuits based on certain assembly types
                if (field === 'outlets' || field === 'fixtures' || field === 'appliances') {
                  // Every 8 devices count as a new circuit (simplified estimate)
                  electricalData.newCircuits += Math.ceil(quantity / 8);
                }
              }
            }
          }
        }
      }

      // Look for specific service information in the estimate
      if (estimate.selections) {
        // Extract service size
        if (estimate.selections.electrical?.serviceSize) {
          electricalData.serviceSize = parseInt(estimate.selections.electrical.serviceSize, 10) || 200;
        }
        
        // Extract service type
        if (estimate.selections.electrical?.serviceType) {
          electricalData.serviceType = estimate.selections.electrical.serviceType;
        }
        
        // Extract voltage type
        if (estimate.selections.electrical?.voltageType) {
          electricalData.voltageType = estimate.selections.electrical.voltageType;
        }
        
        // Extract phase
        if (estimate.selections.electrical?.phase) {
          electricalData.phase = estimate.selections.electrical.phase;
        }
      }

      return electricalData;
    } catch (error) {
      this.logger.error('Error extracting electrical data from estimate', { error });
      // Return default values if there's an error
      return {
        serviceSize: 200,
        serviceType: 'Permanent',
        voltageType: '120/240V',
        phase: 'Single-phase',
        newCircuits: 20,
        outlets: 40,
        switches: 20,
        fixtures: 30,
        appliances: 5,
        hvacUnits: 1
      };
    }
  }

  /**
   * Create permit PDF
   * 
   * @param permit - Permit data
   * @returns PDF buffer
   */
  private async createPermitPdf(permit: IPermit): Promise<Buffer> {
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add a page
      const page = pdfDoc.addPage([612, 792]); // Letter size
      
      // Load the standard font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Set font size
      const fontSize = 10;
      const titleFontSize = 16;
      const subtitleFontSize = 12;
      
      // Get page dimensions
      const { width, height } = page.getSize();
      
      // Set margins
      const margin = 50;
      
      // Draw title
      page.drawText(`${permit.permitType.toUpperCase()} PERMIT APPLICATION`, {
        x: width / 2 - boldFont.widthOfTextAtSize(`${permit.permitType.toUpperCase()} PERMIT APPLICATION`, titleFontSize) / 2,
        y: height - margin,
        size: titleFontSize,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      
      // Draw jurisdiction
      page.drawText(`JURISDICTION: ${permit.applicationData.jurisdiction}`, {
        x: width / 2 - font.widthOfTextAtSize(`JURISDICTION: ${permit.applicationData.jurisdiction}`, subtitleFontSize) / 2,
        y: height - margin - 25,
        size: subtitleFontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      
      // Draw status
      page.drawText(`STATUS: ${permit.status.toUpperCase()}`, {
        x: width - margin - font.widthOfTextAtSize(`STATUS: ${permit.status.toUpperCase()}`, subtitleFontSize),
        y: height - margin - 45,
        size: subtitleFontSize,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      
      // Draw permit ID
      page.drawText(`PERMIT ID: ${permit.permitId}`, {
        x: margin,
        y: height - margin - 45,
        size: subtitleFontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      
      // Draw horizontal line
      page.drawLine({
        start: { x: margin, y: height - margin - 60 },
        end: { x: width - margin, y: height - margin - 60 },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      
      // Export PDF as buffer
      return Buffer.from(await pdfDoc.save());
    } catch (error) {
      this.logger.error('Error creating permit PDF', { error });
      throw error;
    }
  }

  /**
   * Get project data by ID
   * 
   * @param projectId - Project ID
   * @returns Project data or null if not found
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
      throw error;
    }
  }

  /**
   * Get latest estimate for a project
   * 
   * @param projectId - Project ID
   * @returns Latest estimate data or null if not found
   */
  private async getLatestEstimate(projectId: string): Promise<any | null> {
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
      this.logger.error('Error getting latest estimate', { error, projectId });
      throw error;
    }
  }

  /**
   * Get signed URL for downloading a file from S3
   * 
   * @param s3Key - S3 object key
   * @returns Signed URL
   */
  private async getSignedDownloadUrl(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600
        return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      this.logger.error('Error generating signed download URL', { error, s3Key });
      throw error;
    }
  }

  /**
   * Trigger pre-construction checklist based on permit submission
   * 
   * @param projectId - Project ID
   * @param permitType - Permit type
   */
  private async triggerPreConstructionChecklist(projectId: string, permitType: PermitType): Promise<void> {
    try {
      // Get project data
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Determine the appropriate form section to trigger based on permit type
      let formSection = '';
      switch (permitType) {
        case PermitType.ELECTRICAL:
          formSection = 'electrical';
          break;
        case PermitType.MECHANICAL:
          formSection = 'mechanical';
          break;
        case PermitType.PLUMBING:
          formSection = 'plumbing';
          break;
        case PermitType.FIRE:
          formSection = 'fire';
          break;
        case PermitType.BUILDING:
          formSection = 'building';
          break;
        default:
          formSection = 'general';
      }

      // Check if pre-construction checklist is already triggered for this section
      const formResult = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.formResponses,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': `FORM#${formSection}`
        }
      }));

      if (formResult.Items && formResult.Items.length > 0) {
        // Form already exists, no need to trigger
        this.logger.info(`Pre-construction checklist for ${formSection} already exists for project ${projectId}`);
        return;
      }

      // Create form request in database
      const formId = uuidv4();
      const now = new Date().toISOString();
      
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.formResponses,
        Item: {
          PK: `FORM#${formId}`,
          SK: 'METADATA',
          GSI1PK: `PROJECT#${projectId}`,
          GSI1SK: `FORM#${formSection}`,
          formId,
          projectId,
          formType: formSection,
          status: 'pending',
          dueDate: this.calculateDueDate(now, 7), // Due in 7 days
          created: now,
          updated: now
        }
      }));

      // Send email notification
      if (project.customer && project.customer.email) {
        try {
          // Use SendGrid service to send email notification
          const emailService = new (require('../services/sendgrid.service')).SendGridService();
          
          await emailService.sendFormSubmissionNotification(
            formSection.charAt(0).toUpperCase() + formSection.slice(1),
            projectId,
            project.name || 'Your Project',
            project.customer.email,
            project.company?.name || 'Your Contractor'
          );
        } catch (emailError) {
          this.logger.error('Error sending form notification email', { emailError });
          // Continue even if email fails
        }
      }

      this.logger.info(`Triggered pre-construction checklist for ${formSection} for project ${projectId}`);
    } catch (error) {
      this.logger.error('Error triggering pre-construction checklist', { error, projectId, permitType });
      // Don't rethrow, as this is a secondary action that shouldn't affect the permit submission
    }
  }

  /**
   * Calculate due date from start date and days
   * 
   * @param startDate - Start date (ISO string)
   * @param days - Number of days
   * @returns Due date (ISO string)
   */
  private calculateDueDate(startDate: string, days: number): string {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }
}