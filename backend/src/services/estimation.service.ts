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