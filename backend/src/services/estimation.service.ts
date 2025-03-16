// backend/src/services/estimation.service.ts

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { SendGridService } from './sendgrid.service';
import { 
  IEstimate, 
  IEstimateRoom, 
  IEstimateItem, 
  IEstimatePhase,
  IMaterialsTakeoff,
  IMaterialTakeoffItem,
  IEstimateComparison
} from '../types/estimation.types';
import { IAssembly, IMaterial, IRoomDevice } from '../types/blueprint.types';

/**
 * Service for managing electrical estimates and takeoffs
 */
export class EstimationService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assemblyCollection: any = null;
  private materialCollection: any = null;
  private sendGridService: SendGridService;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('EstimationService');
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
        this.assemblyCollection = db.collection(config.mongodb.collections.assemblies);
        this.materialCollection = db.collection(config.mongodb.collections.materials);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Create a new estimate
   * 
   * @param projectId - Project ID
   * @param userId - User ID creating the estimate
   * @param blueprintData - Optional blueprint data to start from
   * @returns Created estimate
   */
  async createEstimate(
    projectId: string,
    userId: string,
    blueprintData?: any
  ): Promise<IEstimate> {
    try {
      // Get project to validate it exists
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Get the highest version number for this project's estimates
      const latestEstimateVersion = await this.getLatestEstimateVersion(projectId);
      const newVersion = latestEstimateVersion + 1;

      // Initialize estimate data
      let rooms: IEstimateRoom[] = [];
      let phases: IEstimatePhase[] = [];
      let totalLaborHours = 0;
      let totalMaterialCost = 0;
      let totalCost = 0;

      // If blueprint data is provided, use it as a starting point
      if (blueprintData && blueprintData.rooms && blueprintData.estimation) {
        // Convert blueprint rooms to estimate rooms
        rooms = await this.convertBlueprintRoomsToEstimateRooms(blueprintData.rooms);
        
        // Use blueprint phases
        phases = blueprintData.estimation.phases;
        totalLaborHours = blueprintData.estimation.totalLaborHours;
        totalMaterialCost = blueprintData.estimation.totalMaterialCost;
        totalCost = blueprintData.estimation.totalCost;
      } else {
        // Create empty estimate
        phases = [
          { name: 'rough', laborHours: 0, materialCost: 0, totalCost: 0 },
          { name: 'service', laborHours: 0, materialCost: 0, totalCost: 0 },
          { name: 'finish', laborHours: 0, materialCost: 0, totalCost: 0 }
        ];
      }

      const estimateId = uuidv4();
      const now = new Date().toISOString();

      // Create estimate record
      const newEstimate: IEstimate = {
        estimateId,
        projectId,
        status: 'draft',
        version: newVersion,
        totalLaborHours,
        totalMaterialCost,
        totalCost,
        phases,
        rooms,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.estimates,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `ESTIMATE#${estimateId}`,
          GSI1PK: `ESTIMATE#${estimateId}`,
          GSI1SK: `PROJECT#${projectId}`,
          ...newEstimate
        }
      }));

      return newEstimate;
    } catch (error) {
      this.logger.error('Error creating estimate', { error, projectId });
      throw error;
    }
  }

  /**
   * Get estimate by ID
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @returns Estimate data
   */
  async getEstimate(projectId: string, estimateId: string): Promise<IEstimate | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.estimates,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `ESTIMATE#${estimateId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IEstimate;
    } catch (error) {
      this.logger.error('Error getting estimate', { error, projectId, estimateId });
      throw error;
    }
  }

  /**
   * Get latest estimate for a project
   * 
   * @param projectId - Project ID
   * @returns Latest estimate
   */
  async getLatestEstimate(projectId: string): Promise<IEstimate | null> {
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

      return result.Items[0] as IEstimate;
    } catch (error) {
      this.logger.error('Error getting latest estimate', { error, projectId });
      throw error;
    }
  }

  /**
   * Get latest estimate version number
   * 
   * @param projectId - Project ID
   * @returns Latest version number
   */
  private async getLatestEstimateVersion(projectId: string): Promise<number> {
    try {
      const latestEstimate = await this.getLatestEstimate(projectId);
      return latestEstimate ? latestEstimate.version : 0;
    } catch (error) {
      this.logger.error('Error getting latest estimate version', { error, projectId });
      return 0;
    }
  }

  /**
   * List all estimates for a project
   * 
   * @param projectId - Project ID
   * @returns List of estimates
   */
  async listProjectEstimates(projectId: string): Promise<IEstimate[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.estimates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'ESTIMATE#'
        },
        ScanIndexForward: false // Most recent first
      }));

      return (result.Items || []) as IEstimate[];
    } catch (error) {
      this.logger.error('Error listing project estimates', { error, projectId });
      throw error;
    }
  }

  /**
   * Update an estimate
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param updateData - Data to update
   * @param userId - User ID performing the update
   * @returns Updated estimate
   */
  async updateEstimate(
    projectId: string,
    estimateId: string,
    updateData: Partial<IEstimate>,
    userId: string
  ): Promise<IEstimate | null> {
    try {
      // Get current estimate
      const currentEstimate = await this.getEstimate(projectId, estimateId);
      if (!currentEstimate) {
        throw new Error('Estimate not found');
      }

      // Check if estimate is in draft status
      if (currentEstimate.status !== 'draft') {
        throw new Error('Only draft estimates can be updated');
      }

      // Prepare update expressions
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      const expressionAttributeNames: Record<string, string> = {};

      // Add updateable fields to the expression
      if (updateData.rooms) {
        updateExpression += ', #rooms = :rooms';
        expressionAttributeValues[':rooms'] = updateData.rooms;
        expressionAttributeNames['#rooms'] = 'rooms';
      }

      if (updateData.phases) {
        updateExpression += ', phases = :phases';
        expressionAttributeValues[':phases'] = updateData.phases;
      }

      if (updateData.totalLaborHours !== undefined) {
        updateExpression += ', totalLaborHours = :totalLaborHours';
        expressionAttributeValues[':totalLaborHours'] = updateData.totalLaborHours;
      }

      if (updateData.totalMaterialCost !== undefined) {
        updateExpression += ', totalMaterialCost = :totalMaterialCost';
        expressionAttributeValues[':totalMaterialCost'] = updateData.totalMaterialCost;
      }

      if (updateData.totalCost !== undefined) {
        updateExpression += ', totalCost = :totalCost';
        expressionAttributeValues[':totalCost'] = updateData.totalCost;
      }

      if (updateData.status) {
        updateExpression += ', #status = :status';
        expressionAttributeValues[':status'] = updateData.status;
        expressionAttributeNames['#status'] = 'status';
      }

      // Update the estimate
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.estimates,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `ESTIMATE#${estimateId}`
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ReturnValues: 'ALL_NEW'
      }));

      return result.Attributes as IEstimate;
    } catch (error) {
      this.logger.error('Error updating estimate', { error, projectId, estimateId });
      throw error;
    }
  }

  /**
   * Submit estimate for approval
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param userId - User ID submitting the estimate
   * @returns Updated estimate
   */
  async submitEstimateForApproval(
    projectId: string,
    estimateId: string,
    userId: string
  ): Promise<IEstimate | null> {
    try {
      // Get current estimate
      const currentEstimate = await this.getEstimate(projectId, estimateId);
      if (!currentEstimate) {
        throw new Error('Estimate not found');
      }

      // Check if estimate is in draft status
      if (currentEstimate.status !== 'draft') {
        throw new Error('Only draft estimates can be submitted for approval');
      }

      // Update the estimate status
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.estimates,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `ESTIMATE#${estimateId}`
        },
        UpdateExpression: 'set #status = :status, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'pending',
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      const updatedEstimate = result.Attributes as IEstimate;

      // Send email notification to approver(s)
      await this.sendEstimateApprovalRequest(projectId, estimateId, updatedEstimate);

      return updatedEstimate;
    } catch (error) {
      this.logger.error('Error submitting estimate for approval', { error, projectId, estimateId });
      throw error;
    }
  }

  /**
   * Process materials from estimate
   * 
   * @param estimate - Estimate data
   * @returns List of material takeoff items
   */
  private async processMaterialsFromEstimate(estimate: IEstimate): Promise<IMaterialTakeoffItem[]> {
    try {
      // Initialize material map for aggregation
      const materialMap = new Map<string, IMaterialTakeoffItem>();
      
      // Ensure MongoDB connection
      await this.initMongo();
      
      // Process each room and item in the estimate
      for (const room of estimate.rooms) {
        for (const item of room.items) {
          // Get assembly details from MongoDB
          const assembly = await this.assemblyCollection.findOne({ _id: item.assemblyId });
          
          if (assembly && assembly.materials) {
            // Process each material in the assembly
            for (const assemblyMaterial of assembly.materials) {
              // Get material details from MongoDB
              const material = await this.materialCollection.findOne({ _id: assemblyMaterial.materialId });
              
              if (material) {
                // Calculate quantities
                const quantity = item.quantity * assemblyMaterial.quantity;
                
                // Determine waste factor (use material default if not specified in assembly)
                const wasteFactor = assemblyMaterial.wasteFactor || material.wasteFactor || 1.1; // 10% default waste
                
                // Calculate adjusted quantity with waste factor
                const adjustedQuantity = Math.ceil(quantity * wasteFactor);
                
                // Use current cost from material
                const unitCost = material.currentCost || 0;
                
                // Calculate total cost
                const totalCost = adjustedQuantity * unitCost;
                
                // Check if material is already in the map
                if (materialMap.has(material._id)) {
                  // Update existing material
                  const existingMaterial = materialMap.get(material._id)!;
                  existingMaterial.quantity += quantity;
                  existingMaterial.adjustedQuantity += adjustedQuantity;
                  existingMaterial.totalCost += totalCost;
                } else {
                  // Add new material
                  materialMap.set(material._id, {
                    materialId: material._id,
                    name: material.name,
                    quantity,
                    wasteFactor,
                    adjustedQuantity,
                    unitCost,
                    totalCost,
                    inventoryAllocated: 0, // Will be determined later
                    purchaseNeeded: adjustedQuantity // Initially assume all need to be purchased
                  });
                }
              }
            }
          }
        }
      }
      
      // Convert map to array
      return Array.from(materialMap.values());
    } catch (error) {
      this.logger.error('Error processing materials from estimate', { error, estimateId: estimate.estimateId });
      return [];
    }
  }

  /**
   * Convert blueprint rooms to estimate rooms
   * 
   * @param blueprintRooms - Blueprint room data
   * @returns Estimate rooms
   */
  private async convertBlueprintRoomsToEstimateRooms(blueprintRooms: IRoomDevice[]): Promise<IEstimateRoom[]> {
    try {
      const estimateRooms: IEstimateRoom[] = [];
      
      // Ensure MongoDB connection
      await this.initMongo();
      
      // Process each room from the blueprint
      for (const blueprintRoom of blueprintRooms) {
        const estimateRoom: IEstimateRoom = {
          name: blueprintRoom.name,
          items: []
        };
        
        // Process each device in the room
        for (const device of blueprintRoom.devices) {
          // Find assembly by code
          const assembly = await this.assemblyCollection.findOne({ code: device.assembly });
          
          if (assembly) {
            // Calculate costs
            const laborHours = (assembly.laborMinutes / 60) * device.count;
            let materialCost = 0;
            
            // Calculate material cost
            if (assembly.materials) {
              for (const material of assembly.materials) {
                // Get material details
                const materialDoc = await this.materialCollection.findOne({ _id: material.materialId });
                if (materialDoc) {
                  materialCost += (materialDoc.currentCost || 0) * material.quantity;
                }
              }
            }
            
            // Multiply by count
            materialCost *= device.count;
            
            // Calculate total cost (assuming $75/hour labor rate)
            const totalCost = materialCost + (laborHours * 75);
            
            // Create estimate item
            const estimateItem: IEstimateItem = {
              id: uuidv4(),
              assemblyId: assembly._id,
              assemblyName: assembly.name,
              quantity: device.count,
              laborHours,
              materialCost,
              totalCost
            };
            
            // Add to room items
            estimateRoom.items.push(estimateItem);
          }
        }
        
        // Add room to estimate
        estimateRooms.push(estimateRoom);
      }
      
      return estimateRooms;
    } catch (error) {
      this.logger.error('Error converting blueprint rooms to estimate rooms', { error });
      return [];
    }
  }

  /**
   * Get project details from DynamoDB
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
   * Send estimate approval request email
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param estimate - Estimate data
   */
  private async sendEstimateApprovalRequest(
    projectId: string,
    estimateId: string,
    estimate: IEstimate
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        this.logger.warn('Cannot send approval request - project not found', { projectId });
        return;
      }

      // Get customer contact
      if (project.customer && project.customer.email) {
        // Use SendGrid service to send approval request
        await this.sendGridService.sendEstimateApprovalRequest(
          estimateId,
          projectId,
          project.name,
          project.customer.email,
          project.customer.contactName || 'Valued Customer',
          estimate.totalCost
        );
      } else {
        this.logger.warn('Cannot send approval request - customer email not found', { projectId });
      }
    } catch (error) {
      this.logger.error('Error sending estimate approval request', { error, projectId, estimateId });
      // Continue even if email fails
    }
  }

  /**
   * Send estimate approved notification
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param estimate - Estimate data
   */
  private async sendEstimateApprovedNotification(
    projectId: string,
    estimateId: string,
    estimate: IEstimate
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        this.logger.warn('Cannot send approval notification - project not found', { projectId });
        return;
      }

      // Get estimate creator
      const creator = await this.getUser(estimate.createdBy);
      if (creator && creator.email) {
        // Send notification to creator
        await this.sendGridService.sendEmail(
          creator.email,
          `Estimate Approved - ${project.name}`,
          `The estimate for project ${project.name} has been approved.

Estimate Total: $${estimate.totalCost.toFixed(2)}
Approved By: ${estimate.approvedBy || 'Unknown'}
Approved Date: ${estimate.approvedDate || new Date().toISOString()}

You can view the estimate and generate materials takeoff at ${config.frontend.url}/projects/${projectId}/estimates/${estimateId}
          `
        );
      }
    } catch (error) {
      this.logger.error('Error sending estimate approved notification', { error, projectId, estimateId });
      // Continue even if email fails
    }
  }

  /**
   * Send estimate rejected notification
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param estimate - Estimate data
   * @param reason - Rejection reason
   */
  private async sendEstimateRejectedNotification(
    projectId: string,
    estimateId: string,
    estimate: IEstimate,
    reason: string
  ): Promise<void> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        this.logger.warn('Cannot send rejection notification - project not found', { projectId });
        return;
      }

      // Get estimate creator
      const creator = await this.getUser(estimate.createdBy);
      if (creator && creator.email) {
        // Send notification to creator
        await this.sendGridService.sendEmail(
          creator.email,
          `Estimate Rejected - ${project.name}`,
          `The estimate for project ${project.name} has been rejected.

Estimate Total: $${estimate.totalCost.toFixed(2)}
Rejected By: ${estimate.updatedBy || 'Unknown'}
Rejection Reason: ${reason || 'No reason provided'}

You can view and revise the estimate at ${config.frontend.url}/projects/${projectId}/estimates/${estimateId}
          `
        );
      }
    } catch (error) {
      this.logger.error('Error sending estimate rejected notification', { error, projectId, estimateId });
      // Continue even if email fails
    }
  }

  /**
   * Get user details from DynamoDB
   * 
   * @param userId - User ID
   * @returns User details or null if not found
   */
  private async getUser(userId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.users,
        Key: {
          PK: `USER#${userId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item;
    } catch (error) {
      this.logger.error('Error getting user', { error, userId });
      return null;
    }
  }
}