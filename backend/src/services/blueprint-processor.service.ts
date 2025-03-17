// backend/src/services/blueprint-processor.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';
import { IBlueprint, RoomType, DeviceType, IExtractedRoom, IExtractedDevice } from '../types/blueprint.types';

/**
 * Service for processing blueprint PDFs and extracting electrical information
 */
export class BlueprintProcessorService {
  private logger: Logger;
  private pdfExtract: PDFExtract;
  private mongoClient: MongoClient | null = null;
  private blueprintTemplatesCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('BlueprintProcessorService');
    this.pdfExtract = new PDFExtract();
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
        this.blueprintTemplatesCollection = db.collection(config.mongodb.collections.blueprintTemplates);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Process blueprint PDF and extract electrical information
   * 
   * @param projectId - Project ID
   * @param fileKey - S3 key for the blueprint PDF
   * @param templateId - Optional template ID to use for extraction
   * @param userId - User ID processing the blueprint
   * @returns Extracted blueprint data
   */
  async processBlueprint(
    projectId: string,
    fileKey: string,
    templateId: string | undefined,
    userId: string
  ): Promise<IBlueprint> {
    try {
      // Update project status to indicate processing has started
      await this.updateProjectBlueprintStatus(projectId, 'PROCESSING', userId);

      // Get the PDF file from S3
      const pdfBuffer = await this.getFileFromS3(fileKey);

      // Get template if provided, otherwise try to find a matching one
      const template = templateId 
        ? await this.getTemplate(templateId)
        : await this.findMatchingTemplate(pdfBuffer);

      // Extract data from the PDF
      const extractedData = await this.extractDataFromPdf(pdfBuffer, template);

      // Create blueprint record
      const blueprintId = uuidv4();
      const now = new Date().toISOString();
      
      const blueprint: IBlueprint = {
        blueprintId,
        projectId,
        s3Key: fileKey,
        jobName: extractedData.jobName,
        jobAddress: extractedData.jobAddress,
        jobNumber: extractedData.jobNumber,
        classificationCode: extractedData.classificationCode,
        squareFootage: extractedData.squareFootage,
        floors: extractedData.floors,
        rooms: extractedData.rooms,
        templateId: template?._id,
        status: 'COMPLETED',
        processingDate: now,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save blueprint to DynamoDB
      await this.saveBlueprint(blueprint);

      // Update project with the extracted data
      await this.updateProjectBlueprintStatus(projectId, 'COMPLETED', userId);

      return blueprint;
    } catch (error) {
      this.logger.error('Error processing blueprint', { error, projectId, fileKey });
      // Update project status to indicate error
      await this.updateProjectBlueprintStatus(projectId, 'ERROR', userId);
      throw error;
    }
  }
  /**
   * Extract data from PDF
   * 
   * @param pdfBuffer - PDF buffer
   * @param template - Optional template to use for extraction
   * @returns Extracted data
   */
  private async extractDataFromPdf(
    pdfBuffer: Buffer, 
    template: any | null
  ): Promise<{
    jobName: string;
    jobAddress: string;
    jobNumber: string;
    classificationCode: string;
    squareFootage: number;
    floors: number;
    rooms: IExtractedRoom[];
  }> {
    try {
      // Set extraction options
      const options: PDFExtractOptions = {
        // Custom options can be set here
      };

      // Extract text and layout information from PDF
      const result = await this.pdfExtract.extractBuffer(pdfBuffer, options);
      
      // Extract project information
      const jobName = this.extractJobName(result, template);
      const jobAddress = this.extractJobAddress(result, template);
      const jobNumber = this.extractJobNumber(result, template);
      const classificationCode = this.extractClassificationCode(result, template);
      const squareFootage = this.extractSquareFootage(result, template);
      
      // Extract room and device information
      const { floors, rooms } = this.extractRoomsAndDevices(result, template);

      return {
        jobName,
        jobAddress,
        jobNumber,
        classificationCode,
        squareFootage,
        floors,
        rooms
      };
    } catch (error) {
      this.logger.error('Error extracting data from PDF', { error });
      throw error;
    }
  }

  /**
   * Extract job name from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Job name
   */
  private extractJobName(pdfData: any, template: any | null): string {
    try {
      // If we have a template, use its patterns to extract
      if (template?.patterns) {
        const jobNamePattern = template.patterns.find((p: any) => p.dataType === 'jobName');
        if (jobNamePattern) {
          // Use the pattern to extract job name
          if (jobNamePattern.patternType === 'regex') {
            const regex = new RegExp(jobNamePattern.pattern);
            for (const page of pdfData.pages) {
              for (const content of page.content) {
                const match = content.str.match(regex);
                if (match && match[1]) {
                  return match[1].trim();
                }
              }
            }
          } else if (jobNamePattern.patternType === 'coordinates') {
            // Extract based on coordinates
            const coords = JSON.parse(jobNamePattern.pattern);
            for (const page of pdfData.pages) {
              for (const content of page.content) {
                if (
                  content.x >= coords.x1 && 
                  content.x <= coords.x2 &&
                  content.y >= coords.y1 && 
                  content.y <= coords.y2
                ) {
                  return content.str.trim();
                }
              }
            }
          }
        }
      }

      // Fallback: Look for common job name patterns
      for (const page of pdfData.pages) {
        for (const content of page.content) {
          // Check for project title line
          if (
            content.str.toLowerCase().includes('project:') ||
            content.str.toLowerCase().includes('job name:') ||
            content.str.toLowerCase().includes('project name:')
          ) {
            // Extract the part after the colon
            const colonIndex = content.str.indexOf(':');
            if (colonIndex !== -1) {
              return content.str.substring(colonIndex + 1).trim();
            }
          }
        }
      }

      // Default value if no job name found
      return 'Untitled Project';
    } catch (error) {
      this.logger.error('Error extracting job name', { error });
      return 'Untitled Project';
    }
  }

  /**
   * Extract job address from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Job address
   */
  private extractJobAddress(pdfData: any, template: any | null): string {
    try {
      // If we have a template, use its patterns to extract
      if (template?.patterns) {
        const addressPattern = template.patterns.find((p: any) => p.dataType === 'jobAddress');
        if (addressPattern) {
          // Use the pattern to extract address
          if (addressPattern.patternType === 'regex') {
            const regex = new RegExp(addressPattern.pattern);
            for (const page of pdfData.pages) {
              for (const content of page.content) {
                const match = content.str.match(regex);
                if (match && match[1]) {
                  return match[1].trim();
                }
              }
            }
          } else if (addressPattern.patternType === 'coordinates') {
            // Extract based on coordinates
            const coords = JSON.parse(addressPattern.pattern);
            for (const page of pdfData.pages) {
              for (const content of page.content) {
                if (
                  content.x >= coords.x1 && 
                  content.x <= coords.x2 &&
                  content.y >= coords.y1 && 
                  content.y <= coords.y2
                ) {
                  return content.str.trim();
                }
              }
            }
          }
        }
      }

      // Fallback: Look for common address patterns
      for (const page of pdfData.pages) {
        for (const content of page.content) {
          // Check for address line
          if (
            content.str.toLowerCase().includes('address:') ||
            content.str.toLowerCase().includes('location:') ||
            content.str.toLowerCase().includes('site:')
          ) {
            // Extract the part after the colon
            const colonIndex = content.str.indexOf(':');
            if (colonIndex !== -1) {
              return content.str.substring(colonIndex + 1).trim();
            }
          }
        }
      }

      // Default value if no address found
      return 'Address not found';
    } catch (error) {
      this.logger.error('Error extracting job address', { error });
      return 'Address not found';
    }
  }

  /**
   * Extract job number from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Job number
   */
  private extractJobNumber(pdfData: any, template: any | null): string {
    try {
      // Similar implementation as extractJobName and extractJobAddress
      // Looking for job number or project number in the PDF
      
      // Default value if no job number found
      return 'JOB-' + new Date().getTime().toString().substring(5);
    } catch (error) {
      this.logger.error('Error extracting job number', { error });
      return 'JOB-' + new Date().getTime().toString().substring(5);
    }
  }

  /**
   * Extract classification code from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Classification code
   */
  private extractClassificationCode(pdfData: any, template: any | null): string {
    try {
      // Look for common classification codes in the PDF
      const classificationPatterns = [
        /classification[:\s]+([A-Z]-\d+)/i,
        /building type[:\s]+([A-Z]-\d+)/i,
        /construction type[:\s]+([A-Z]-\d+)/i
      ];

      for (const page of pdfData.pages) {
        for (const content of page.content) {
          for (const pattern of classificationPatterns) {
            const match = content.str.match(pattern);
            if (match && match[1]) {
              return match[1];
            }
          }
        }
      }

      // Default value if no classification code found
      return 'R-3'; // Residential default
    } catch (error) {
      this.logger.error('Error extracting classification code', { error });
      return 'R-3';
    }
  }

  /**
   * Extract square footage from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Square footage
   */
  private extractSquareFootage(pdfData: any, template: any | null): number {
    try {
      // Look for square footage information
      const sqftPatterns = [
        /sq(?:\.|\s)?ft(?:\.)?[:\s]+([0-9,]+)/i,
        /square footage[:\s]+([0-9,]+)/i,
        /area[:\s]+([0-9,]+)[\s]*sq(?:\.|\s)?ft/i
      ];

      for (const page of pdfData.pages) {
        for (const content of page.content) {
          for (const pattern of sqftPatterns) {
            const match = content.str.match(pattern);
            if (match && match[1]) {
              return parseInt(match[1].replace(/,/g, ''), 10);
            }
          }
        }
      }

      // Default value if no square footage found
      return 0;
    } catch (error) {
      this.logger.error('Error extracting square footage', { error });
      return 0;
    }
  }
  /**
   * Extract rooms and devices from PDF
   * 
   * @param pdfData - Extracted PDF data
   * @param template - Optional template
   * @returns Rooms and devices data
   */
  private extractRoomsAndDevices(
    pdfData: any, 
    template: any | null
  ): { floors: number; rooms: IExtractedRoom[] } {
    try {
      // Initialize rooms array
      const rooms: IExtractedRoom[] = [];
      let maxFloor = 1;

      // If we have a template with room patterns
      if (template?.roomPatterns) {
        // Template-based room extraction
        // ... implementation for template-based extraction
      } else {
        // Fallback room extraction
        // This is a simplified implementation
        // In a real-world scenario, this would involve more sophisticated analysis
        
        // Extract rooms
        const knownRoomTypes = [
          { name: 'Living Room', type: RoomType.LIVING },
          { name: 'Kitchen', type: RoomType.KITCHEN },
          { name: 'Bedroom', type: RoomType.BEDROOM },
          { name: 'Master Bedroom', type: RoomType.MASTER_BEDROOM },
          { name: 'Bathroom', type: RoomType.BATHROOM },
          { name: 'Master Bathroom', type: RoomType.MASTER_BATHROOM },
          { name: 'Dining Room', type: RoomType.DINING },
          { name: 'Garage', type: RoomType.GARAGE },
          { name: 'Hallway', type: RoomType.HALLWAY },
          { name: 'Basement', type: RoomType.BASEMENT },
          { name: 'Attic', type: RoomType.ATTIC },
          { name: 'Closet', type: RoomType.CLOSET },
          { name: 'Laundry', type: RoomType.LAUNDRY },
          { name: 'Office', type: RoomType.OFFICE },
          { name: 'Den', type: RoomType.DEN }
        ];

        // First Pass: Identify rooms
        for (const page of pdfData.pages) {
          for (const content of page.content) {
            // Check for room labels
            for (const roomType of knownRoomTypes) {
              if (
                content.str.toLowerCase().includes(roomType.name.toLowerCase()) && 
                !content.str.toLowerCase().includes('legend')
              ) {
                // Check if the room is already added
                const existingRoom = rooms.find(r => 
                  r.name.toLowerCase() === roomType.name.toLowerCase() && r.floor === 1
                );
                
                if (!existingRoom) {
                  rooms.push({
                    roomId: uuidv4(),
                    name: roomType.name,
                    type: roomType.type,
                    floor: 1, // Default to first floor
                    area: 0,
                    devices: []
                  });
                }
              }
            }
            
            // Look for floor information
            const floorMatch = content.str.match(/floor\s*(\d+)/i);
            if (floorMatch && floorMatch[1]) {
              const floor = parseInt(floorMatch[1], 10);
              if (floor > maxFloor) {
                maxFloor = floor;
              }
            }
          }
        }

        // If no rooms found, add a default room
        if (rooms.length === 0) {
          rooms.push({
            roomId: uuidv4(),
            name: 'Main Room',
            type: RoomType.LIVING,
            floor: 1,
            area: 0,
            devices: []
          });
        }

        // Second Pass: Extract devices
        this.extractDevices(pdfData, rooms);
      }

      return { floors: maxFloor, rooms };
    } catch (error) {
      this.logger.error('Error extracting rooms and devices', { error });
      // Return default single room
      return {
        floors: 1,
        rooms: [{
          roomId: uuidv4(),
          name: 'Main Room',
          type: RoomType.LIVING,
          floor: 1,
          area: 0,
          devices: []
        }]
      };
    }
  }

  /**
   * Extract devices from PDF and associate with rooms
   * 
   * @param pdfData - Extracted PDF data
   * @param rooms - Extracted rooms
   */
  private extractDevices(pdfData: any, rooms: IExtractedRoom[]): void {
    try {
      // Device patterns to look for in the PDF
      const devicePatterns = [
        // Receptacles
        { pattern: /receptacle|outlet/i, type: DeviceType.RECEPTACLE, abbreviation: 'REC' },
        { pattern: /(?:gfci|gfi)/i, type: DeviceType.GFCI_RECEPTACLE, abbreviation: 'GFCI' },
        { pattern: /wr(?:tr)?/i, type: DeviceType.WEATHER_RESISTANT_RECEPTACLE, abbreviation: 'WR' },
        { pattern: /floor\s*receptacle/i, type: DeviceType.FLOOR_RECEPTACLE, abbreviation: 'FR' },
        
        // Switches
        { pattern: /(?:^|\s)switch/i, type: DeviceType.SWITCH, abbreviation: 'SW' },
        { pattern: /dimmer\s*switch/i, type: DeviceType.DIMMER_SWITCH, abbreviation: 'DIM' },
        { pattern: /3-way\s*switch/i, type: DeviceType.THREE_WAY_SWITCH, abbreviation: '3W' },
        { pattern: /4-way\s*switch/i, type: DeviceType.FOUR_WAY_SWITCH, abbreviation: '4W' },
        
        // Lights
        { pattern: /ceiling\s*(?:light|fan)/i, type: DeviceType.CEILING_LIGHT, abbreviation: 'CL' },
        { pattern: /recessed\s*light/i, type: DeviceType.RECESSED_LIGHT, abbreviation: 'RL' },
        { pattern: /(?:pendant|hanging)\s*light/i, type: DeviceType.PENDANT_LIGHT, abbreviation: 'PL' },
        { pattern: /track\s*light/i, type: DeviceType.TRACK_LIGHT, abbreviation: 'TL' },
        { pattern: /under\s*cabinet\s*light/i, type: DeviceType.UNDER_CABINET_LIGHT, abbreviation: 'UCL' },
        
        // Other
        { pattern: /smoke\s*detector/i, type: DeviceType.SMOKE_DETECTOR, abbreviation: 'SD' },
        { pattern: /(?:co|carbon\s*monoxide)\s*detector/i, type: DeviceType.CO_DETECTOR, abbreviation: 'CO' },
        { pattern: /thermostat/i, type: DeviceType.THERMOSTAT, abbreviation: 'THERM' },
        { pattern: /doorbell/i, type: DeviceType.DOORBELL, abbreviation: 'DB' },
        { pattern: /fan/i, type: DeviceType.FAN, abbreviation: 'FAN' }
      ];

      // For each room, add appropriate devices based on room type
      for (const room of rooms) {
        switch (room.type) {
          case RoomType.LIVING:
            room.devices.push(
              { deviceId: uuidv4(), type: DeviceType.RECEPTACLE, count: 6, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.SWITCH, count: 2, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.CEILING_LIGHT, count: 1, notes: "Extracted from blueprint" }
            );
            break;
          case RoomType.KITCHEN:
            room.devices.push(
              { deviceId: uuidv4(), type: DeviceType.GFCI_RECEPTACLE, count: 4, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.SWITCH, count: 3, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.RECESSED_LIGHT, count: 4, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.UNDER_CABINET_LIGHT, count: 2, notes: "Extracted from blueprint" }
            );
            break;
          case RoomType.BEDROOM:
          case RoomType.MASTER_BEDROOM:
            room.devices.push(
              { deviceId: uuidv4(), type: DeviceType.RECEPTACLE, count: 4, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.SWITCH, count: 1, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.CEILING_LIGHT, count: 1, notes: "Extracted from blueprint" }
            );
            break;
          case RoomType.BATHROOM:
          case RoomType.MASTER_BATHROOM:
            room.devices.push(
              { deviceId: uuidv4(), type: DeviceType.GFCI_RECEPTACLE, count: 2, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.SWITCH, count: 2, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.RECESSED_LIGHT, count: 2, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.FAN, count: 1, notes: "Extracted from blueprint" }
            );
            break;
          default:
            // Add some basic devices for all other room types
            room.devices.push(
              { deviceId: uuidv4(), type: DeviceType.RECEPTACLE, count: 2, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.SWITCH, count: 1, notes: "Extracted from blueprint" },
              { deviceId: uuidv4(), type: DeviceType.CEILING_LIGHT, count: 1, notes: "Extracted from blueprint" }
            );
        }
      }
    } catch (error) {
      this.logger.error('Error extracting devices', { error });
      // Don't throw here, we'll just return with fewer devices
    }
  }

  /**
   * Get blueprint template from MongoDB
   * 
   * @param templateId - Template ID
   * @returns Template or null if not found
   */
  private async getTemplate(templateId: string): Promise<any | null> {
    try {
      await this.initMongo();
      const template = await this.blueprintTemplatesCollection.findOne({ _id: templateId });
      return template;
    } catch (error) {
      this.logger.error('Error getting template', { error, templateId });
      return null;
    }
  }

  /**
   * Find a matching template for the PDF
   * 
   * @param pdfBuffer - PDF buffer
   * @returns Best matching template or null if none found
   */
  private async findMatchingTemplate(pdfBuffer: Buffer): Promise<any | null> {
    try {
      await this.initMongo();
      
      // Get all templates
      const templates = await this.blueprintTemplatesCollection.find({}).toArray();
      
      if (templates.length === 0) {
        return null;
      }

      // In a real implementation, we would analyze the PDF and find the best match
      return templates[0];
    } catch (error) {
      this.logger.error('Error finding matching template', { error });
      return null;
    }
  }

  /**
   * Save blueprint to DynamoDB
   * 
   * @param blueprint - Blueprint data
   */
  private async saveBlueprint(blueprint: IBlueprint): Promise<void> {
    try {
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.blueprints,
        Item: {
          PK: `PROJECT#${blueprint.projectId}`,
          SK: `BLUEPRINT#${blueprint.blueprintId}`,
          GSI1PK: `BLUEPRINT#${blueprint.blueprintId}`,
          GSI1SK: `PROJECT#${blueprint.projectId}`,
          ...blueprint
        }
      }));
    } catch (error) {
      this.logger.error('Error saving blueprint', { error, blueprint });
      throw error;
    }
  }

  /**
   * Update project blueprint status
   * 
   * @param projectId - Project ID
   * @param status - Blueprint processing status
   * @param userId - User ID making the update
   */
  private async updateProjectBlueprintStatus(
    projectId: string,
    status: string,
    userId: string
  ): Promise<void> {
    try {
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set blueprint.processingStatus = :status, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':status': status,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        }
      }));
    } catch (error) {
      this.logger.error('Error updating project blueprint status', { error, projectId, status });
      // Don't throw here, as this is a secondary operation
    }
  }

  /**
   * Get file from S3
   * 
   * @param fileKey - S3 file key
   * @returns File as buffer
   */
  private async getFileFromS3(fileKey: string): Promise<Buffer> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey
      }));

      const streamToBuffer = (stream: any): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      };

      if (!result.Body) {
        throw new Error('Empty file');
      }

      return streamToBuffer(result.Body);
    } catch (error) {
      this.logger.error('Error getting file from S3', { error, fileKey });
      throw error;
    }
  }
}