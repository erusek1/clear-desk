// backend/src/services/estimation.service.ts

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { 
  IEstimate, 
  IEstimateRoom, 
  IEstimateItem, 
  IEstimatePhase,
  IMaterialsTakeoff,
  IMaterialTakeoffItem,
  IEstimateComparison
} from '../types/estimation.types';
import { IAssembly, IMaterial } from '../types/blueprint.types';

/**
 * Service for managing electrical estimates and takeoffs
 */
export class EstimationService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assemblyCollection: any = null;
  private materialCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('EstimationService');
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
