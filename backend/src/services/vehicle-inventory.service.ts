// backend/src/services/vehicle-inventory.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { TransactionType } from '../types/inventory.types';
import { 
  IVehicle, 
  IVehicleInventoryLevel, 
  IVehicleInventoryTransaction, 
  IVehicleInventoryCheck,
  IVehicleInventoryTemplate,
  VehicleStatus
} from '../types/vehicle.types';
import Papa from 'papaparse';

/**
 * Vehicle inventory service
 */
export class VehicleInventoryService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private materialsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('VehicleInventoryService');
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
        this.materialsCollection = db.collection(config.mongodb.collections.materials);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Create a new vehicle
   * 
   * @param vehicle - Vehicle data without ID
   * @returns Created vehicle
   */
  async createVehicle(
    vehicle: Omit<IVehicle, 'vehicleId' | 'created' | 'updated'>
  ): Promise<IVehicle> {
    try {
      const vehicleId = uuidv4();
      const now = new Date().toISOString();
      
      // Create vehicle record
      const newVehicle: IVehicle = {
        vehicleId,
        ...vehicle,
        created: now,
        updated: now
      };

      // Save vehicle to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vehicles,
        Item: {
          PK: `VEHICLE#${vehicleId}`,
          SK: 'METADATA',
          GSI1PK: `COMPANY#${vehicle.companyId}`,
          GSI1SK: `VEHICLE#${vehicle.name}`,
          ...newVehicle
        }
      }));

      return newVehicle;
    } catch (error) {
      this.logger.error('Error creating vehicle', { error, vehicle });
      throw error;
    }
  }

  /**
   * Get vehicle by ID
   * 
   * @param vehicleId - Vehicle ID
   * @returns Vehicle or null if not found
   */
  async getVehicle(vehicleId: string): Promise<IVehicle | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicles,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IVehicle;
    } catch (error) {
      this.logger.error('Error getting vehicle', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Update vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @param updates - Vehicle updates
   * @param userId - User ID making the update
   * @returns Updated vehicle
   */
  async updateVehicle(
    vehicleId: string,
    updates: Partial<IVehicle>,
    userId: string
  ): Promise<IVehicle | null> {
    try {
      // Get current vehicle data
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      // Build update expression
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      const expressionAttributeNames: Record<string, string> = {};

      // Add each update field to the expression
      for (const [key, value] of Object.entries(updates)) {
        // Skip vehicleId, companyId, created, and createdBy as they shouldn't be updated
        if (['vehicleId', 'companyId', 'created', 'createdBy'].includes(key)) {
          continue;
        }

        updateExpression += `, #${key} = :${key}`;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }

      // Update vehicle in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.vehicles,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
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

      return result.Attributes as IVehicle;
    } catch (error) {
      this.logger.error('Error updating vehicle', { error, vehicleId, updates });
      throw error;
    }
  }

  /**
   * Get all vehicles for a company
   * 
   * @param companyId - Company ID
   * @param status - Optional status filter
   * @returns List of vehicles
   */
  async getCompanyVehicles(
    companyId: string,
    status?: VehicleStatus
  ): Promise<IVehicle[]> {
    try {
      const params: any = {
        TableName: config.dynamodb.tables.vehicles,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`
        }
      };

      // Add status filter if provided
      if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
      }

      const result = await this.docClient.send(new QueryCommand(params));

      return (result.Items || []) as IVehicle[];
    } catch (error) {
      this.logger.error('Error getting company vehicles', { error, companyId });
      throw error;
    }
  }
  
  /**
   * Get vehicle inventory level
   * 
   * @param vehicleId - Vehicle ID
   * @param materialId - Material ID
   * @returns Inventory level or null if not found
   */
  async getVehicleInventoryLevel(vehicleId: string, materialId: string): Promise<IVehicleInventoryLevel | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
          SK: `INVENTORY#${materialId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IVehicleInventoryLevel;
    } catch (error) {
      this.logger.error('Error getting vehicle inventory level', { error, vehicleId, materialId });
      throw error;
    }
  }

  /**
   * Get all inventory levels for a vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @returns List of inventory levels
   */
  async getVehicleInventory(vehicleId: string): Promise<IVehicleInventoryLevel[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `VEHICLE#${vehicleId}`,
          ':sk': 'INVENTORY#'
        }
      }));

      return (result.Items || []) as IVehicleInventoryLevel[];
    } catch (error) {
      this.logger.error('Error getting vehicle inventory', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Update vehicle inventory level
   * 
   * @param vehicleId - Vehicle ID
   * @param materialId - Material ID
   * @param quantity - New quantity
   * @param userId - User ID making the update
   * @param minQuantity - Optional min quantity
   * @param standardQuantity - Optional standard quantity
   * @param location - Optional location within vehicle
   * @returns Updated inventory level
   */
  async updateVehicleInventoryLevel(
    vehicleId: string,
    materialId: string,
    quantity: number,
    userId: string,
    minQuantity?: number,
    standardQuantity?: number,
    location?: string
  ): Promise<IVehicleInventoryLevel> {
    try {
      // Check if inventory level exists
      const existingLevel = await this.getVehicleInventoryLevel(vehicleId, materialId);
      
      if (existingLevel) {
        // Update existing inventory level
        const result = await this.docClient.send(new UpdateCommand({
          TableName: config.dynamodb.tables.vehicleInventory,
          Key: {
            PK: `VEHICLE#${vehicleId}`,
            SK: `INVENTORY#${materialId}`
          },
          UpdateExpression: 'set currentQuantity = :qty, minQuantity = :min, standardQuantity = :std, location = :loc, updated = :updated, updatedBy = :updatedBy',
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':min': minQuantity !== undefined ? minQuantity : existingLevel.minQuantity,
            ':std': standardQuantity !== undefined ? standardQuantity : existingLevel.standardQuantity,
            ':loc': location || existingLevel.location,
            ':updated': new Date().toISOString(),
            ':updatedBy': userId
          },
          ReturnValues: 'ALL_NEW'
        }));

        return {
          vehicleId,
          materialId,
          currentQuantity: quantity,
          minQuantity: minQuantity !== undefined ? minQuantity : existingLevel.minQuantity,
          standardQuantity: standardQuantity !== undefined ? standardQuantity : existingLevel.standardQuantity,
          location: location || existingLevel.location,
          lastStockCheck: existingLevel.lastStockCheck,
          created: existingLevel.created,
          updated: new Date().toISOString(),
          createdBy: existingLevel.createdBy,
          updatedBy: userId
        };
      } else {
        // Create new inventory level
        const now = new Date().toISOString();
        const newLevel: IVehicleInventoryLevel = {
          vehicleId,
          materialId,
          currentQuantity: quantity,
          minQuantity,
          standardQuantity,
          location,
          created: now,
          updated: now,
          createdBy: userId,
          updatedBy: userId
        };

        await this.docClient.send(new PutCommand({
          TableName: config.dynamodb.tables.vehicleInventory,
          Item: {
            PK: `VEHICLE#${vehicleId}`,
            SK: `INVENTORY#${materialId}`,
            GSI1PK: `MATERIAL#${materialId}`,
            GSI1SK: `VEHICLE#${vehicleId}`,
            ...newLevel
          }
        }));

        return newLevel;
      }
    } catch (error) {
      this.logger.error('Error updating vehicle inventory level', { error, vehicleId, materialId });
      throw error;
    }
  }}