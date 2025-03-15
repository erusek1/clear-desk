// src/services/blueprint.service.ts

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { MongoClient } from 'mongodb';
import config from '../config';
import { IBlueprintTemplate, IRoomDevice, IProjectBlueprint, IDevice } from '../types/blueprint.types';

/**
 * Service for processing blueprints and extracting information
 */
export class BlueprintService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assemblyCollection: any = null;
  private templateCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('BlueprintService');
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
        this.assemblyCollection = db.collection(config.mongodb.collections.assemblies);
        this.templateCollection = db.collection(config.mongodb.collections.blueprintTemplates);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Process a blueprint PDF to extract project information
   * 
   * @param projectId - Project ID
   * @param s3Key - S3 key of the blueprint PDF
   * @param companyId - Company ID
   * @param templateId - Optional blueprint template ID
   * @returns Processed blueprint data
   */
  async processBlueprint(
    projectId: string,
    s3Key: string,
    companyId: string,
    templateId?: string
  ): Promise<IProjectBlueprint> {
    try {
      // 1. Get project to validate it exists and user has access
      const project = await this.getProject(projectId, companyId);
      if (!project) {
        throw new Error('Project not found or access denied');
      }

      // 2. Update project with processing status
      await this.updateProjectBlueprintStatus(projectId, 'PROCESSING');

      // 3. Get blueprint template if provided
      let template = null;
      if (templateId) {
        template = await this.getBlueprintTemplate(templateId);
      } else {
        // Try to find a matching template based on the PDF structure
        template = await this.findMatchingTemplate(s3Key);
      }

      // 4. Get PDF from S3
      const pdfData = await this.getPdfFromS3(s3Key);

      // 5. Extract basic information
      const basicInfo = await this.extractBasicInformation(pdfData, template);

      // 6. Extract rooms and devices
      const roomsData = await this.extractRoomsAndDevices(pdfData, template);

      // 7. Generate estimation data
      const estimationData = await this.generateEstimationData(roomsData);

      // 8. Update project with extracted data
      const extractedData: IProjectBlueprint = {
        jobInfo: basicInfo,
        rooms: roomsData,
        estimation: estimationData,
        extractionDate: new Date().toISOString(),
        status: 'COMPLETED',
        templateUsed: template ? template._id : null,
        confidence: template ? template.confidence : 0.5
      };

      await this.updateProjectWithExtractedData(projectId, extractedData);

      // 9. Return processed data
      return extractedData;
    } catch (error) {
      // Update project with error status
      await this.updateProjectBlueprintStatus(projectId, 'ERROR');
      this.logger.error('Error processing blueprint', { error, projectId, s3Key });
      throw error;
    }
  }

  /**
   * Get project details from DynamoDB
   * 
   * @param projectId - Project ID
   * @param companyId - Company ID
   * @returns Project details
   */
  private async getProject(projectId: string, companyId: string): Promise<any> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item || result.Item.companyId !== companyId) {
        return null;
      }

      return result.Item;
    } catch (error) {
      this.logger.error('Error getting project', { error, projectId });
      throw error;
    }
  }

  /**
   * Update project blueprint status
   * 
   * @param projectId - Project ID
   * @param status - Blueprint processing status
   */
  private async updateProjectBlueprintStatus(projectId: string, status: string): Promise<void> {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set blueprint.processingStatus = :status, updated = :updated',
        ExpressionAttributeValues: {
          ':status': status,
          ':updated': new Date().toISOString()
        }
      }));
    } catch (error) {
      this.logger.error('Error updating project status', { error, projectId });
      throw error;
    }
  }

  /**
   * Get blueprint template from MongoDB
   * 
   * @param templateId - Template ID
   * @returns Blueprint template
   */
  private async getBlueprintTemplate(templateId: string): Promise<IBlueprintTemplate | null> {
    try {
      await this.initMongo();
      const template = await this.templateCollection.findOne({ _id: templateId });
      return template;
    } catch (error) {
      this.logger.error('Error getting blueprint template', { error, templateId });
      return null;
    }
  }

  /**
   * Find a matching template based on the PDF structure
   * 
   * @param s3Key - S3 key of the blueprint PDF
   * @returns Best matching template
   */
  private async findMatchingTemplate(s3Key: string): Promise<IBlueprintTemplate | null> {
    try {
      await this.initMongo();
      
      // Get all templates
      const templates = await this.templateCollection.find({}).toArray();
      
      if (templates.length === 0) {
        return null;
      }

      // In a real implementation, analyze the PDF and find best matching template
      // For now, return the first template
      return templates[0];
    } catch (error) {
      this.logger.error('Error finding matching template', { error, s3Key });
      return null;
    }
  }

  /**
   * Get PDF data from S3
   * 
   * @param s3Key - S3 key of the PDF
   * @returns PDF data as buffer
   */
  private async getPdfFromS3(s3Key: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key
      }));

      const streamToBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      };

      if (!result.Body) {
        throw new Error('Empty PDF file');
      }

      return await streamToBuffer(result.Body as NodeJS.ReadableStream);
    } catch (error) {
      this.logger.error('Error getting PDF from S3', { error, s3Key });
      throw error;
    }
  }

  /**
   * Extract basic information from PDF
   * 
   * @param pdfData - PDF data buffer
   * @param template - Blueprint template
   * @returns Basic job information
   */
  private async extractBasicInformation(pdfData: Buffer, template: IBlueprintTemplate | null): Promise<any> {
    try {
      // Load PDF document
      const pdfDoc = await PDFDocument.load(pdfData);
      
      // In a real implementation, use template patterns to extract info
      // For now, return placeholder data
      return {
        name: 'New Construction Project',
        address: '123 Main St, Anytown, USA',
        classificationCode: 'R-3',
        squareFootage: 2400,
        extractionConfidence: template ? 0.85 : 0.6
      };
    } catch (error) {
      this.logger.error('Error extracting basic information', { error });
      throw error;
    }
  }

  /**
   * Extract rooms and devices from PDF
   * 
   * @param pdfData - PDF data buffer
   * @param template - Blueprint template
   * @returns Rooms and devices data
   */
  private async extractRoomsAndDevices(pdfData: Buffer, template: IBlueprintTemplate | null): Promise<IRoomDevice[]> {
    try {
      // Load PDF document
      const pdfDoc = await PDFDocument.load(pdfData);
      
      // In a real implementation, use template patterns to extract rooms and devices
      // For now, return placeholder data
      return [
        {
          name: 'Living Room',
          floor: 1,
          devices: [
            { type: 'receptacle', count: 6, assembly: 'REC-STD' },
            { type: 'switch', count: 2, assembly: 'SW-SNGL' },
            { type: 'light', count: 4, assembly: 'LT-RECESSED' }
          ]
        },
        {
          name: 'Kitchen',
          floor: 1,
          devices: [
            { type: 'receptacle', count: 8, assembly: 'REC-GFCI' },
            { type: 'switch', count: 3, assembly: 'SW-SNGL' },
            { type: 'light', count: 6, assembly: 'LT-RECESSED' }
          ]
        },
        {
          name: 'Master Bedroom',
          floor: 2,
          devices: [
            { type: 'receptacle', count: 4, assembly: 'REC-STD' },
            { type: 'switch', count: 2, assembly: 'SW-SNGL' },
            { type: 'light', count: 2, assembly: 'LT-CEILING' }
          ]
        }
      ];
    } catch (error) {
      this.logger.error('Error extracting rooms and devices', { error });
      throw error;
    }
  }

  /**
   * Generate estimation data based on rooms and devices
   * 
   * @param rooms - Rooms and devices data
   * @returns Estimation data
   */
  private async generateEstimationData(rooms: IRoomDevice[]): Promise<any> {
    try {
      await this.initMongo();
      
      // Initialize counters
      let totalLaborMinutes = 0;
      let totalMaterialCost = 0;
      const phases: Record<string, { laborMinutes: number, materialCost: number }> = {
        'rough': { laborMinutes: 0, materialCost: 0 },
        'service': { laborMinutes: 0, materialCost: 0 },
        'finish': { laborMinutes: 0, materialCost: 0 }
      };
      
      // Process each room
      for (const room of rooms) {
        for (const device of room.devices) {
          // Get assembly details from MongoDB
          const assembly = await this.assemblyCollection.findOne({ code: device.assembly });
          
          if (assembly) {
            // Calculate labor
            const laborMinutes = assembly.laborMinutes * device.count;
            totalLaborMinutes += laborMinutes;
            
            // Add to appropriate phase
            if (phases[assembly.phase]) {
              phases[assembly.phase].laborMinutes += laborMinutes;
            }
            
            // Calculate material cost
            let deviceMaterialCost = 0;
            for (const material of assembly.materials) {
              deviceMaterialCost += material.quantity * material.cost * device.count;
            }
            
            totalMaterialCost += deviceMaterialCost;
            
            // Add to appropriate phase
            if (phases[assembly.phase]) {
              phases[assembly.phase].materialCost += deviceMaterialCost;
            }
          }
        }
      }
      
      // Convert labor minutes to hours
      const totalLaborHours = Math.ceil(totalLaborMinutes / 60);
      const phasesHours = Object.keys(phases).reduce((acc, phase) => {
        acc[phase] = Math.ceil(phases[phase].laborMinutes / 60);
        return acc;
      }, {} as Record<string, number>);
      
      return {
        totalLaborHours,
        totalMaterialCost,
        totalCost: totalMaterialCost + (totalLaborHours * 75), // Assuming $75/hour labor rate
        phases: Object.keys(phases).map(phase => ({
          name: phase,
          laborHours: Math.ceil(phases[phase].laborMinutes / 60),
          materialCost: phases[phase].materialCost,
          totalCost: phases[phase].materialCost + (Math.ceil(phases[phase].laborMinutes / 60) * 75)
        }))
      };
    } catch (error) {
      this.logger.error('Error generating estimation data', { error });
      return {
        totalLaborHours: 0,
        totalMaterialCost: 0,
        totalCost: 0,
        phases: []
      };
    }
  }

  /**
   * Update project with extracted blueprint data
   * 
   * @param projectId - Project ID
   * @param extractedData - Extracted blueprint data
   */
  private async updateProjectWithExtractedData(projectId: string, extractedData: IProjectBlueprint): Promise<void> {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set blueprint.extractedData = :data, blueprint.processingStatus = :status, updated = :updated',
        ExpressionAttributeValues: {
          ':data': extractedData,
          ':status': 'COMPLETED',
          ':updated': new Date().toISOString()
        }
      }));
    } catch (error) {
      this.logger.error('Error updating project with extracted data', { error, projectId });
      throw error;
    }
  }

  /**
   * Generate signed URL for blueprint upload
   * 
   * @param projectId - Project ID
   * @param fileName - Original file name
   * @returns Signed URL and file key
   */
  async generateUploadUrl(projectId: string, fileName: string): Promise<{ url: string, fileKey: string }> {
    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'pdf';
      const fileKey = `blueprints/${projectId}/${uuidv4()}.${fileExtension}`;
      
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        url: signedUrl,
        fileKey
      };
    } catch (error) {
      this.logger.error('Error generating upload URL', { error, projectId });
      throw error;
    }
  }

  /**
   * Get list of blueprint templates
   * 
   * @returns List of blueprint templates
   */
  async getTemplates(): Promise<IBlueprintTemplate[]> {
    try {
      await this.initMongo();
      const templates = await this.templateCollection.find({}).toArray();
      return templates;
    } catch (error) {
      this.logger.error('Error getting templates', { error });
      throw error;
    }
  }

  /**
   * Create a new blueprint template
   * 
   * @param templateData - Template data
   * @returns Created template
   */
  async createTemplate(templateData: Omit<IBlueprintTemplate, '_id'>): Promise<IBlueprintTemplate> {
    try {
      await this.initMongo();
      
      const template = {
        ...templateData,
        _id: uuidv4(),
        created: new Date(),
        updated: new Date()
      };
      
      await this.templateCollection.insertOne(template);
      return template;
    } catch (error) {
      this.logger.error('Error creating template', { error });
      throw error;
    }
  }

  /**
   * Train the blueprint template with sample data
   * 
   * @param templateId - Template ID
   * @param sampleData - Sample data for training
   * @returns Updated template
   */
  async trainTemplate(templateId: string, sampleData: any): Promise<IBlueprintTemplate> {
    try {
      await this.initMongo();
      
      // Get existing template
      const template = await this.templateCollection.findOne({ _id: templateId });
      
      if (!template) {
        throw new Error('Template not found');
      }
      
      // Update template patterns with training data
      // This is a simplified implementation
      const updatedTemplate = {
        ...template,
        patterns: [...template.patterns],
        sampleFiles: [...template.sampleFiles, sampleData.s3Key],
        updated: new Date()
      };
      
      // Add new patterns from training data
      if (sampleData.patterns && Array.isArray(sampleData.patterns)) {
        for (const pattern of sampleData.patterns) {
          const existingPatternIndex = updatedTemplate.patterns.findIndex(p => 
            p.dataType === pattern.dataType && p.patternType === pattern.patternType
          );
          
          if (existingPatternIndex >= 0) {
            // Update existing pattern
            updatedTemplate.patterns[existingPatternIndex] = {
              ...updatedTemplate.patterns[existingPatternIndex],
              pattern: pattern.pattern,
              examples: [...updatedTemplate.patterns[existingPatternIndex].examples, ...pattern.examples],
              confidence: pattern.confidence
            };
          } else {
            // Add new pattern
            updatedTemplate.patterns.push(pattern);
          }
        }
      }
      
      // Save updated template
      await this.templateCollection.updateOne(
        { _id: templateId },
        { $set: updatedTemplate }
      );
      
      return updatedTemplate;
    } catch (error) {
      this.logger.error('Error training template', { error, templateId });
      throw error;
    }
  }
}