// backend/src/services/permit.service.ts

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { SendGridService } from './sendgrid.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Permit status enum
 */
export enum PermitStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CLOSED = 'closed'
}

/**
 * Permit type enum
 */
export enum PermitType {
  ELECTRICAL = 'electrical',
  FIRE = 'fire',
  MECHANICAL = 'mechanical',
  PLUMBING = 'plumbing',
  BUILDING = 'building'
}

/**
 * Permit interface
 */
export interface IPermit {
  id: string;
  projectId: string;
  type: PermitType;
  status: PermitStatus;
  submissionDate?: string;
  approvalDate?: string;
  expirationDate?: string;
  permitNumber?: string;
  jurisdictionName: string;
  jurisdictionContact?: string;
  formData: Record<string, any>;
  pdfS3Key?: string;
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Permit form data interface for electrical permits
 */
export interface IElectricalPermitFormData {
  // Project information
  jobAddress: string;
  jobCity: string;
  jobState: string;
  jobZip: string;
  
  // Owner information
  ownerName: string;
  ownerPhone?: string;
  ownerEmail?: string;
  
  // Contractor information
  contractorName: string;
  contractorLicense: string;
  contractorPhone: string;
  contractorEmail: string;
  
  // Electrical details
  serviceSize: number; // In amps
  serviceSizeUpgrade?: boolean;
  serviceSizePrevious?: number; // In amps, if upgrade
  phases: number; // 1 or 3
  voltage: number;
  temporaryService?: boolean;
  temporaryPoleRequired?: boolean;
  
  // Devices and fixtures
  receptacles: number;
  switches: number;
  lightFixtures: number;
  fanFixtures?: number;
  rangeCircuits?: number;
  dryerCircuits?: number;
  waterHeaterCircuits?: number;
  hvacCircuits?: number;
  subPanels?: number;
  
  // Special equipment
  generatorDetails?: {
    size: number; // In kW
    transferSwitch: boolean;
    location: string;
  };
  
  evChargerDetails?: {
    quantity: number;
    amperage: number;
  };
  
  solarDetails?: {
    size: number; // In kW
    inverterType: string;
    panels: number;
  };
  
  // Additional information
  estimatedValue: number;
  specialConditions?: string;
  additionalNotes?: string;
}

/**
 * Service for managing permits
 */
export class PermitService {
  private logger: Logger;
  private sendGridService: SendGridService;
  
  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('PermitService');
    this.sendGridService = new SendGridService();
  }
  
  /**
   * Get permit by ID
   * 
   * @param permitId - Permit ID
   * @returns Permit or null if not found
   */
  async getPermit(permitId: string): Promise<IPermit | null> {
    try {
      // Validate input
      if (!permitId || typeof permitId !== 'string') {
        throw new Error('Invalid permit ID');
      }
      
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.permits,
        Key: { id: permitId }
      }));
      
      return result.Item as IPermit || null;
    } catch (error) {
      this.logger.error('Error getting permit', { error, permitId });
      throw error;
    }
  }
  
  /**
   * Get permits for a project
   * 
   * @param projectId - Project ID
   * @returns List of permits
   */
  async getProjectPermits(projectId: string): Promise<IPermit[]> {
    try {
      // Validate input
      if (!projectId || typeof projectId !== 'string') {
        throw new Error('Invalid project ID');
      }
      
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.permits,
        IndexName: 'ProjectIndex',
        KeyConditionExpression: 'projectId = :projectId',
        ExpressionAttributeValues: {
          ':projectId': projectId
        }
      }));
      
      return result.Items as IPermit[] || [];
    } catch (error) {
      this.logger.error('Error getting project permits', { error, projectId });
      throw error;
    }
  }
  
  /**
   * Create a new permit
   * 
   * @param projectId - Project ID
   * @param type - Permit type
   * @param jurisdictionName - Jurisdiction name
   * @param formData - Form data
   * @param notes - Optional notes
   * @param userId - User ID creating the permit
   * @returns Created permit
   */
  async createPermit(
    projectId: string,
    type: PermitType,
    jurisdictionName: string,
    formData: Record<string, any>,
    notes: string | undefined,
    userId: string
  ): Promise<IPermit> {
    try {
      // Validate inputs
      if (!projectId || typeof projectId !== 'string') {
        throw new Error('Invalid project ID');
      }
      
      if (!Object.values(PermitType).includes(type)) {
        throw new Error('Invalid permit type');
      }
      
      if (!jurisdictionName || typeof jurisdictionName !== 'string') {
        throw new Error('Jurisdiction name is required');
      }
      
      if (!formData || typeof formData !== 'object') {
        throw new Error('Form data is required');
      }
      
      if (notes !== undefined && typeof notes !== 'string') {
        throw new Error('Notes must be a string if provided');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Create permit ID and timestamps
      const permitId = uuidv4();
      const now = new Date().toISOString();
      
      // Create permit object
      const permit: IPermit = {
        id: permitId,
        projectId,
        type,
        status: PermitStatus.DRAFT,
        jurisdictionName,
        formData,
        notes,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };
      
      // Save permit to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.permits,
        Item: permit
      }));
      
      return permit;
    } catch (error) {
      this.logger.error('Error creating permit', { error, projectId, type });
      throw error;
    }
  }
  
  /**
   * Update permit
   * 
   * @param permitId - Permit ID
   * @param updates - Permit updates
   * @param userId - User ID updating the permit
   * @returns Updated permit
   */
  async updatePermit(
    permitId: string,
    updates: Partial<Omit<IPermit, 'id' | 'projectId' | 'type' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>>,
    userId: string
  ): Promise<IPermit | null> {
    try {
      // Validate inputs
      if (!permitId || typeof permitId !== 'string') {
        throw new Error('Invalid permit ID');
      }
      
      if (!updates || typeof updates !== 'object') {
        throw new Error('Updates are required');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Get existing permit
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      // Prevent updates to submitted permits unless explicitly changing status
      if (
        permit.status !== PermitStatus.DRAFT && 
        updates.status === undefined && 
        Object.keys(updates).length > 0
      ) {
        throw new Error('Cannot update submitted permit details');
      }
      
      // Build update expression
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      
      // Add fields to update
      Object.entries(updates).forEach(([key, value]) => {
        // Skip id, projectId, type, created, createdBy, updated, updatedBy
        if (['id', 'projectId', 'type', 'created', 'createdBy', 'updated', 'updatedBy'].includes(key)) {
          return;
        }
        
        updateExpression += `, ${key} = :${key}`;
        expressionAttributeValues[`:${key}`] = value;
      });
      
      // Update permit
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: { id: permitId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));
      
      // If updating status to SUBMITTED, trigger additional actions
      if (
        updates.status === PermitStatus.SUBMITTED && 
        permit.status !== PermitStatus.SUBMITTED
      ) {
        await this.handlePermitSubmission(permitId, userId);
      }
      
      return result.Attributes as IPermit || null;
    } catch (error) {
      this.logger.error('Error updating permit', { error, permitId });
      throw error;
    }
  }
  
  /**
   * Handle permit submission
   * 
   * @param permitId - Permit ID
   * @param userId - User ID
   */
  private async handlePermitSubmission(permitId: string, userId: string): Promise<void> {
    try {
      // Get permit details
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      // Add submission date
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: { id: permitId },
        UpdateExpression: 'set submissionDate = :submissionDate',
        ExpressionAttributeValues: {
          ':submissionDate': new Date().toISOString()
        }
      }));
      
      // Generate permit PDF if not already generated
      if (!permit.pdfS3Key) {
        await this.generatePermitPdf(permitId, userId);
      }
      
      // TODO: Trigger pre-construction checklist
      
      // Send notification email
      await this.sendPermitSubmissionNotification(permitId);
    } catch (error) {
      this.logger.error('Error handling permit submission', { error, permitId });
      throw error;
    }
  }
  
  /**
   * Generate permit PDF
   * 
   * @param permitId - Permit ID
   * @param userId - User ID
   * @returns S3 key of generated PDF
   */
  async generatePermitPdf(permitId: string, userId: string): Promise<string> {
    try {
      // Get permit details
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // US Letter size
      
      // Add fonts
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Set font sizes
      const titleFontSize = 18;
      const subtitleFontSize = 14;
      const normalFontSize = 12;
      const smallFontSize = 10;
      
      // Add document title
      page.drawText(
        `${permit.type.toUpperCase()} PERMIT APPLICATION`, 
        {
          x: 50,
          y: 750,
          size: titleFontSize,
          font: helveticaBoldFont
        }
      );
      
      // Add jurisdiction info
      page.drawText(
        `Jurisdiction: ${permit.jurisdictionName}`, 
        {
          x: 50,
          y: 720,
          size: subtitleFontSize,
          font: helveticaBoldFont
        }
      );
      
      // Add date
      const currentDate = new Date().toLocaleDateString();
      page.drawText(
        `Date: ${currentDate}`, 
        {
          x: 450,
          y: 720,
          size: normalFontSize,
          font: helveticaFont
        }
      );
      
      // Add horizontal line
      page.drawLine({
        start: { x: 50, y: 710 },
        end: { x: 562, y: 710 },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      
      let yPos = 680;
      
      // Add form data based on permit type
      if (permit.type === PermitType.ELECTRICAL) {
        // Cast to electrical permit data
        const data = permit.formData as IElectricalPermitFormData;
        
        // Project information section
        page.drawText('PROJECT INFORMATION', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText(`Job Address: ${data.jobAddress}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        page.drawText(`City: ${data.jobCity}, State: ${data.jobState}, Zip: ${data.jobZip}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 30;
        
        // Owner information
        page.drawText('OWNER INFORMATION', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText(`Name: ${data.ownerName}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        if (data.ownerPhone) {
          page.drawText(`Phone: ${data.ownerPhone}`, {
            x: 50,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
          
          yPos -= 20;
        }
        
        if (data.ownerEmail) {
          page.drawText(`Email: ${data.ownerEmail}`, {
            x: 50,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
          
          yPos -= 20;
        }
        
        yPos -= 10;
        
        // Contractor information
        page.drawText('CONTRACTOR INFORMATION', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText(`Name: ${data.contractorName}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        page.drawText(`License: ${data.contractorLicense}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        page.drawText(`Phone: ${data.contractorPhone}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        page.drawText(`Email: ${data.contractorEmail}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 30;
        
        // Electrical service details
        page.drawText('ELECTRICAL SERVICE DETAILS', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText(`Service Size: ${data.serviceSize} Amps, ${data.phases} Phase, ${data.voltage} Volts`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        if (data.serviceSizeUpgrade) {
          page.drawText(`Upgrade from: ${data.serviceSizePrevious} Amps`, {
            x: 50,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
          
          yPos -= 20;
        }
        
        if (data.temporaryService) {
          page.drawText(`Temporary Service: Yes${data.temporaryPoleRequired ? ', Pole Required' : ''}`, {
            x: 50,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
          
          yPos -= 20;
        }
        
        yPos -= 10;
        
        // Devices and fixtures
        page.drawText('DEVICES AND FIXTURES', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        const leftCol = 50;
        const rightCol = 300;
        
        page.drawText(`Receptacles: ${data.receptacles}`, {
          x: leftCol,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        page.drawText(`Switches: ${data.switches}`, {
          x: rightCol,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        page.drawText(`Light Fixtures: ${data.lightFixtures}`, {
          x: leftCol,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        if (data.fanFixtures) {
          page.drawText(`Fan Fixtures: ${data.fanFixtures}`, {
            x: rightCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
        }
        
        yPos -= 20;
        
        if (data.rangeCircuits) {
          page.drawText(`Range Circuits: ${data.rangeCircuits}`, {
            x: leftCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
        }
        
        if (data.dryerCircuits) {
          page.drawText(`Dryer Circuits: ${data.dryerCircuits}`, {
            x: rightCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
        }
        
        if (data.rangeCircuits || data.dryerCircuits) {
          yPos -= 20;
        }
        
        if (data.waterHeaterCircuits) {
          page.drawText(`Water Heater Circuits: ${data.waterHeaterCircuits}`, {
            x: leftCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
        }
        
        if (data.hvacCircuits) {
          page.drawText(`HVAC Circuits: ${data.hvacCircuits}`, {
            x: rightCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
        }
        
        if (data.waterHeaterCircuits || data.hvacCircuits) {
          yPos -= 20;
        }
        
        if (data.subPanels) {
          page.drawText(`Sub-Panels: ${data.subPanels}`, {
            x: leftCol,
            y: yPos,
            size: normalFontSize,
            font: helveticaFont
          });
          
          yPos -= 20;
        }
        
        yPos -= 10;
        
        // Special equipment
        if (
          data.generatorDetails || 
          data.evChargerDetails || 
          data.solarDetails
        ) {
          page.drawText('SPECIAL EQUIPMENT', {
            x: 50,
            y: yPos,
            size: subtitleFontSize,
            font: helveticaBoldFont
          });
          
          yPos -= 25;
          
          if (data.generatorDetails) {
            page.drawText(`Generator: ${data.generatorDetails.size} kW`, {
              x: leftCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            page.drawText(`Transfer Switch: ${data.generatorDetails.transferSwitch ? 'Yes' : 'No'}`, {
              x: rightCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
            
            page.drawText(`Location: ${data.generatorDetails.location}`, {
              x: leftCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
          }
          
          if (data.evChargerDetails) {
            page.drawText(`EV Chargers: ${data.evChargerDetails.quantity}`, {
              x: leftCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            page.drawText(`Amperage: ${data.evChargerDetails.amperage} A`, {
              x: rightCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
          }
          
          if (data.solarDetails) {
            page.drawText(`Solar System: ${data.solarDetails.size} kW`, {
              x: leftCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            page.drawText(`Panels: ${data.solarDetails.panels}`, {
              x: rightCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
            
            page.drawText(`Inverter Type: ${data.solarDetails.inverterType}`, {
              x: leftCol,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
          }
          
          yPos -= 10;
        }
        
        // Additional information
        page.drawText('ADDITIONAL INFORMATION', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText(`Estimated Value: $${data.estimatedValue.toLocaleString()}`, {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
        
        yPos -= 20;
        
        if (data.specialConditions) {
          // Check if we need a new page
          if (yPos < 150) {
            // Add a new page
            const newPage = pdfDoc.addPage([612, 792]);
            page = newPage;
            yPos = 750;
            
            page.drawText('SPECIAL CONDITIONS', {
              x: 50,
              y: yPos,
              size: normalFontSize,
              font: helveticaBoldFont
            });
            
            yPos -= 20;
            
            // Split long text into multiple lines
            const words = data.specialConditions.split(' ');
            let line = '';
            const maxLineWidth = 500; // Maximum width of a line in points
            
            for (const word of words) {
              const testLine = line + (line ? ' ' : '') + word;
              const lineWidth = helveticaFont.widthOfTextAtSize(testLine, normalFontSize);
              
              if (lineWidth > maxLineWidth) {
                page.drawText(line, {
                  x: 50,
                  y: yPos,
                  size: normalFontSize,
                  font: helveticaFont
                });
                
                yPos -= 20;
                line = word;
              } else {
                line = testLine;
              }
            }
            
            if (line) {
              page.drawText(line, {
                x: 50,
                y: yPos,
                size: normalFontSize,
                font: helveticaFont
              });
              
              yPos -= 20;
            }
          } else {
            page.drawText('Special Conditions:', {
              x: 50,
              y: yPos,
              size: normalFontSize,
              font: helveticaBoldFont
            });
            
            yPos -= 20;
            
            // Split long text into multiple lines
            const words = data.specialConditions.split(' ');
            let line = '';
            const maxLineWidth = 500; // Maximum width of a line in points
            
            for (const word of words) {
              const testLine = line + (line ? ' ' : '') + word;
              const lineWidth = helveticaFont.widthOfTextAtSize(testLine, normalFontSize);
              
              if (lineWidth > maxLineWidth) {
                page.drawText(line, {
                  x: 50,
                  y: yPos,
                  size: normalFontSize,
                  font: helveticaFont
                });
                
                yPos -= 20;
                line = word;
              } else {
                line = testLine;
              }
            }
            
            if (line) {
              page.drawText(line, {
                x: 50,
                y: yPos,
                size: normalFontSize,
                font: helveticaFont
              });
              
              yPos -= 20;
            }
          }
        }
        
        if (data.additionalNotes) {
          // Check if we need a new page
          if (yPos < 150) {
            // Add a new page
            const newPage = pdfDoc.addPage([612, 792]);
            page = newPage;
            yPos = 750;
          }
          
          page.drawText('Additional Notes:', {
            x: 50,
            y: yPos,
            size: normalFontSize,
            font: helveticaBoldFont
          });
          
          yPos -= 20;
          
          // Split long text into multiple lines
          const words = data.additionalNotes.split(' ');
          let line = '';
          const maxLineWidth = 500; // Maximum width of a line in points
          
          for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            const lineWidth = helveticaFont.widthOfTextAtSize(testLine, normalFontSize);
            
            if (lineWidth > maxLineWidth) {
              page.drawText(line, {
                x: 50,
                y: yPos,
                size: normalFontSize,
                font: helveticaFont
              });
              
              yPos -= 20;
              line = word;
            } else {
              line = testLine;
            }
          }
          
          if (line) {
            page.drawText(line, {
              x: 50,
              y: yPos,
              size: normalFontSize,
              font: helveticaFont
            });
            
            yPos -= 20;
          }
        }
      } else if (permit.type === PermitType.FIRE) {
        // TODO: Implement fire permit PDF generation
        page.drawText('FIRE PERMIT DETAILS', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText('Fire permit details to be implemented', {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
      } else {
        // Generic permit information
        page.drawText('PERMIT DETAILS', {
          x: 50,
          y: yPos,
          size: subtitleFontSize,
          font: helveticaBoldFont
        });
        
        yPos -= 25;
        
        page.drawText('See attached form data for details', {
          x: 50,
          y: yPos,
          size: normalFontSize,
          font: helveticaFont
        });
      }
      
      // Add signature fields at the bottom of the last page
      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      
      lastPage.drawText('Applicant Signature: ______________________________', {
        x: 50,
        y: 120,
        size: normalFontSize,
        font: helveticaFont
      });
      
      lastPage.drawText('Date: ____________________', {
        x: 400,
        y: 120,
        size: normalFontSize,
        font: helveticaFont
      });
      
      // Save PDF to buffer
      const pdfBytes = await pdfDoc.save();
      
      // Upload to S3
      const s3Key = `permits/${permit
        // Upload to S3
      const s3Key = `permits/${permit.projectId}/${permitId}.pdf`;
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key,
        Body: pdfBytes,
        ContentType: 'application/pdf'
      }));
      
      // Update permit record with PDF S3 key
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: { id: permitId },
        UpdateExpression: 'set pdfS3Key = :pdfS3Key, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':pdfS3Key': s3Key,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        }
      }));
      
      return s3Key;
    } catch (error) {
      this.logger.error('Error generating permit PDF', { error, permitId });
      throw error;
    }
  }
  
  /**
   * Get permit PDF download URL
   * 
   * @param permitId - Permit ID
   * @returns Signed URL for downloading PDF
   */
  async getPermitPdfDownloadUrl(permitId: string): Promise<string> {
    try {
      // Get permit details
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      if (!permit.pdfS3Key) {
        throw new Error('Permit PDF not generated');
      }
      
      // Generate signed URL
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: permit.pdfS3Key
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return signedUrl;
    } catch (error) {
      this.logger.error('Error getting permit PDF download URL', { error, permitId });
      throw error;
    }
  }
  
  /**
   * Send permit submission notification
   * 
   * @param permitId - Permit ID
   * @returns Success status
   */
  private async sendPermitSubmissionNotification(permitId: string): Promise<boolean> {
    try {
      // Get permit details
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      // Get project details for email
      const project = await this.getProject(permit.projectId);
      if (!project || !project.manager || !project.manager.email) {
        this.logger.warn('Cannot send permit notification - missing project or manager info', { permitId });
        return false;
      }
      
      // Format permit type for display
      const permitTypeFormatted = permit.type
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      
      // Send email to project manager
      const emailResult = await this.sendGridService.sendEmail(
        project.manager.email,
        `${permitTypeFormatted} Permit Submitted - ${project.name}`,
        `A ${permitTypeFormatted.toLowerCase()} permit for project ${project.name} has been submitted to ${permit.jurisdictionName}.
        
You can view and track the permit status at: ${config.frontend.url}/projects/${permit.projectId}/permits/${permitId}
        
This will trigger the pre-construction checklist process for electrical specifications.`
      );
      
      return emailResult;
    } catch (error) {
      this.logger.error('Error sending permit submission notification', { error, permitId });
      return false;
    }
  }
  
  /**
   * Update permit status based on jurisdiction response
   * 
   * @param permitId - Permit ID
   * @param status - New status
   * @param permitNumber - Optional permit number (for approved permits)
   * @param expirationDate - Optional expiration date (for approved permits)
   * @param notes - Optional notes about the status change
   * @param userId - User ID updating the status
   * @returns Updated permit
   */
  async updatePermitStatus(
    permitId: string,
    status: PermitStatus,
    permitNumber: string | undefined,
    expirationDate: string | undefined,
    notes: string | undefined,
    userId: string
  ): Promise<IPermit | null> {
    try {
      // Validate inputs
      if (!permitId || typeof permitId !== 'string') {
        throw new Error('Invalid permit ID');
      }
      
      if (!Object.values(PermitStatus).includes(status)) {
        throw new Error('Invalid permit status');
      }
      
      if (permitNumber !== undefined && typeof permitNumber !== 'string') {
        throw new Error('Permit number must be a string if provided');
      }
      
      if (expirationDate !== undefined && typeof expirationDate !== 'string') {
        throw new Error('Expiration date must be a string if provided');
      }
      
      if (notes !== undefined && typeof notes !== 'string') {
        throw new Error('Notes must be a string if provided');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Get existing permit
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }
      
      // Build updates object
      const updates: Partial<IPermit> = {
        status
      };
      
      // Add approval date if status is APPROVED
      if (status === PermitStatus.APPROVED) {
        updates.approvalDate = new Date().toISOString();
        
        if (permitNumber) {
          updates.permitNumber = permitNumber;
        }
        
        if (expirationDate) {
          updates.expirationDate = expirationDate;
        }
      }
      
      // Add notes if provided
      if (notes) {
        updates.notes = permit.notes 
          ? `${permit.notes}\n\n${new Date().toLocaleDateString()}: ${notes}`
          : `${new Date().toLocaleDateString()}: ${notes}`;
      }
      
      // Update permit
      return await this.updatePermit(permitId, updates, userId);
    } catch (error) {
      this.logger.error('Error updating permit status', { error, permitId });
      throw error;
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
   * Create an electrical permit from estimate data
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param jurisdictionName - Jurisdiction name
   * @param additionalData - Additional form data
   * @param userId - User ID creating the permit
   * @returns Created permit
   */
  async createElectricalPermitFromEstimate(
    projectId: string,
    estimateId: string,
    jurisdictionName: string,
    additionalData: Partial<IElectricalPermitFormData>,
    userId: string
  ): Promise<IPermit> {
    try {
      // Validate inputs
      if (!projectId || typeof projectId !== 'string') {
        throw new Error('Invalid project ID');
      }
      
      if (!estimateId || typeof estimateId !== 'string') {
        throw new Error('Invalid estimate ID');
      }
      
      if (!jurisdictionName || typeof jurisdictionName !== 'string') {
        throw new Error('Jurisdiction name is required');
      }
      
      if (!additionalData || typeof additionalData !== 'object') {
        throw new Error('Additional data must be an object');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Get estimate details
      const estimate = await this.getEstimate(projectId, estimateId);
      if (!estimate) {
        throw new Error('Estimate not found');
      }
      
      // Extract device counts from estimate
      const deviceCounts = this.extractDeviceCountsFromEstimate(estimate);
      
      // Create form data
      const formData: IElectricalPermitFormData = {
        // Project information
        jobAddress: project.address?.street || '',
        jobCity: project.address?.city || '',
        jobState: project.address?.state || '',
        jobZip: project.address?.zip || '',
        
        // Owner information
        ownerName: project.customer?.name || '',
        ownerPhone: project.customer?.phone || '',
        ownerEmail: project.customer?.email || '',
        
        // Contractor information
        contractorName: project.company?.name || '',
        contractorLicense: project.company?.license || '',
        contractorPhone: project.company?.phone || '',
        contractorEmail: project.company?.email || '',
        
        // Electrical details - defaults
        serviceSize: 200,
        phases: 1,
        voltage: 240,
        
        // Devices and fixtures from estimate
        receptacles: deviceCounts.receptacles || 0,
        switches: deviceCounts.switches || 0,
        lightFixtures: deviceCounts.lightFixtures || 0,
        
        // Required field
        estimatedValue: estimate.totalCost || 0,
        
        // Add any additional data provided
        ...additionalData
      };
      
      // Create the permit
      return await this.createPermit(
        projectId,
        PermitType.ELECTRICAL,
        jurisdictionName,
        formData,
        undefined,
        userId
      );
    } catch (error) {
      this.logger.error('Error creating electrical permit from estimate', { 
        error, projectId, estimateId 
      });
      throw error;
    }
  }
  
  /**
   * Extract device counts from estimate
   * 
   * @param estimate - Estimate data
   * @returns Object with device counts
   */
  private extractDeviceCountsFromEstimate(estimate: any): Record<string, number> {
    try {
      const deviceCounts: Record<string, number> = {
        receptacles: 0,
        switches: 0,
        lightFixtures: 0,
        fanFixtures: 0,
        rangeCircuits: 0,
        dryerCircuits: 0,
        waterHeaterCircuits: 0,
        hvacCircuits: 0,
        subPanels: 0
      };
      
      // Mapping of assembly types to permit fields
      const assemblyMapping: Record<string, string> = {
        'REC-': 'receptacles',
        'SW-': 'switches',
        'LT-': 'lightFixtures',
        'FAN-': 'fanFixtures',
        'RNG-': 'rangeCircuits',
        'DRY-': 'dryerCircuits',
        'WH-': 'waterHeaterCircuits',
        'HVAC-': 'hvacCircuits',
        'PNL-SUB': 'subPanels'
      };
      
      // Process rooms and items from estimate
      if (estimate.rooms && Array.isArray(estimate.rooms)) {
        for (const room of estimate.rooms) {
          if (room.items && Array.isArray(room.items)) {
            for (const item of room.items) {
              // Determine which count to increment based on assembly type
              for (const [prefix, field] of Object.entries(assemblyMapping)) {
                if (item.assemblyId && item.assemblyId.startsWith(prefix)) {
                  deviceCounts[field] += item.quantity || 0;
                  break;
                }
              }
            }
          }
        }
      }
      
      return deviceCounts;
    } catch (error) {
      this.logger.error('Error extracting device counts from estimate', { error });
      return {
        receptacles: 0,
        switches: 0,
        lightFixtures: 0
      };
    }
  }
  
  /**
   * Get estimate details
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @returns Estimate details or null if not found
   */
  private async getEstimate(projectId: string, estimateId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.estimates,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `ESTIMATE#${estimateId}`
        }
      }));
      
      return result.Item;
    } catch (error) {
      this.logger.error('Error getting estimate', { error, projectId, estimateId });
      return null;
    }
  }
}