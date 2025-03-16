// backend/src/services/employee-case.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { TransactionType } from '../types/inventory.types';
import { 
  IEmployeeCase, 
  ICaseInventoryLevel, 
  ICaseInventoryTransaction, 
  ICaseInventoryCheck,
  ICaseTemplate,
  CaseStatus
} from '../types/employee-case.types';
import Papa from 'papaparse';

/**
 * Employee case service
 */
export class EmployeeCaseService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private materialsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('EmployeeCaseService');
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
   * Create a new employee case
   * 
   * @param employeeCase - Case data without ID
   * @returns Created case
   */
  async createCase(
    employeeCase: Omit<IEmployeeCase, 'caseId' | 'created' | 'updated'>
  ): Promise<IEmployeeCase> {
    try {
      const caseId = uuidv4();
      const now = new Date().toISOString();
      
      // Create case record
      const newCase: IEmployeeCase = {
        caseId,
        ...employeeCase,
        created: now,
        updated: now
      };

      // Save case to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.employeeCases,
        Item: {
          PK: `EMPLOYEE#${employeeCase.userId}`,
          SK: `CASE#${caseId}`,
          GSI1PK: `COMPANY#${employeeCase.companyId}`,
          GSI1SK: `CASE#${caseId}`,
          ...newCase
        }
      }));

      return newCase;
    } catch (error) {
      this.logger.error('Error creating employee case', { error, employeeCase });
      throw error;
    }
  }

  /**
   * Get employee case by ID
   * 
   * @param caseId - Case ID
   * @param userId - User ID
   * @returns Case or null if not found
   */
  async getCase(caseId: string, userId: string): Promise<IEmployeeCase | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.employeeCases,
        Key: {
          PK: `EMPLOYEE#${userId}`,
          SK: `CASE#${caseId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IEmployeeCase;
    } catch (error) {
      this.logger.error('Error getting employee case', { error, caseId, userId });
      throw error;
    }
  }

  /**
   * Update employee case
   * 
   * @param caseId - Case ID
   * @param userId - User ID
   * @param updates - Case updates
   * @param adminUserId - User ID making the update
   * @returns Updated case
   */
  async updateCase(
    caseId: string,
    userId: string,
    updates: Partial<IEmployeeCase>,
    adminUserId: string
  ): Promise<IEmployeeCase | null> {
    try {
      // Get current case data
      const employeeCase = await this.getCase(caseId, userId);
      if (!employeeCase) {
        throw new Error('Employee case not found');
      }

      // Build update expression
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': adminUserId
      };
      const expressionAttributeNames: Record<string, string> = {};

      // Add each update field to the expression
      for (const [key, value] of Object.entries(updates)) {
        // Skip caseId, userId, companyId, created, and createdBy as they shouldn't be updated
        if (['caseId', 'userId', 'companyId', 'created', 'createdBy'].includes(key)) {
          continue;
        }

        updateExpression += `, #${key} = :${key}`;
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }

      // Update case in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.employeeCases,
        Key: {
          PK: `EMPLOYEE#${userId}`,
          SK: `CASE#${caseId}`
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IEmployeeCase;
    } catch (error) {
      this.logger.error('Error updating employee case', { error, caseId, userId, updates });
      throw error;
    }
  }

  /**
   * Get cases for an employee
   * 
   * @param userId - User ID
   * @returns List of cases
   */
  async getEmployeeCases(userId: string): Promise<IEmployeeCase[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.employeeCases,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `EMPLOYEE#${userId}`,
          ':sk': 'CASE#'
        }
      }));

      return (result.Items || []) as IEmployeeCase[];
    } catch (error) {
      this.logger.error('Error getting employee cases', { error, userId });
      throw error;
    }
  }

  /**
   * Get cases for a company
   * 
   * @param companyId - Company ID
   * @param status - Optional status filter
   * @returns List of cases
   */
  async getCompanyCases(companyId: string, status?: CaseStatus): Promise<IEmployeeCase[]> {
    try {
      const params: any = {
        TableName: config.dynamodb.tables.employeeCases,
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

      return (result.Items || []) as IEmployeeCase[];
    } catch (error) {
      this.logger.error('Error getting company cases', { error, companyId });
      throw error;
    }
  }

  /**
   * Get case inventory level
   * 
   * @param caseId - Case ID
   * @param materialId - Material ID
   * @returns Inventory level or null if not found
   */
  async getCaseInventoryLevel(caseId: string, materialId: string): Promise<ICaseInventoryLevel | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.caseInventory,
        Key: {
          PK: `CASE#${caseId}`,
          SK: `INVENTORY#${materialId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as ICaseInventoryLevel;
    } catch (error) {
      this.logger.error('Error getting case inventory level', { error, caseId, materialId });
      throw error;
    }
  }

  /**
   * Get all inventory levels for a case
   * 
   * @param caseId - Case ID
   * @returns List of inventory levels
   */
  async getCaseInventory(caseId: string): Promise<ICaseInventoryLevel[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.caseInventory,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `CASE#${caseId}`,
          ':sk': 'INVENTORY#'
        }
      }));

      return (result.Items || []) as ICaseInventoryLevel[];
    } catch (error) {
      this.logger.error('Error getting case inventory', { error, caseId });
      throw error;
    }
  }

  /**
   * Update case inventory level
   * 
   * @param caseId - Case ID
   * @param materialId - Material ID
   * @param quantity - New quantity
   * @param userId - User ID making the update
   * @param standardQuantity - Optional standard quantity
   * @param location - Optional location within case
   * @returns Updated inventory level
   */
  async updateCaseInventoryLevel(
    caseId: string,
    materialId: string,
    quantity: number,
    userId: string,
    standardQuantity?: number,
    location?: string
  ): Promise<ICaseInventoryLevel> {
    try {
      // Check if inventory level exists
      const existingLevel = await this.getCaseInventoryLevel(caseId, materialId);
      
      if (existingLevel) {
        // Update existing inventory level
        const result = await this.docClient.send(new UpdateCommand({
          TableName: config.dynamodb.tables.caseInventory,
          Key: {
            PK: `CASE#${caseId}`,
            SK: `INVENTORY#${materialId}`
          },
          UpdateExpression: 'set currentQuantity = :qty, standardQuantity = :std, location = :loc, updated = :updated, updatedBy = :updatedBy',
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':std': standardQuantity !== undefined ? standardQuantity : existingLevel.standardQuantity,
            ':loc': location || existingLevel.location,
            ':updated': new Date().toISOString(),
            ':updatedBy': userId
          },
          ReturnValues: 'ALL_NEW'
        }));

        return {
          caseId,
          materialId,
          currentQuantity: quantity,
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
        const newLevel: ICaseInventoryLevel = {
          caseId,
          materialId,
          currentQuantity: quantity,
          standardQuantity: standardQuantity || quantity,
          location,
          created: now,
          updated: now,
          createdBy: userId,
          updatedBy: userId
        };

        await this.docClient.send(new PutCommand({
          TableName: config.dynamodb.tables.caseInventory,
          Item: {
            PK: `CASE#${caseId}`,
            SK: `INVENTORY#${materialId}`,
            GSI1PK: `MATERIAL#${materialId}`,
            GSI1SK: `CASE#${caseId}`,
            ...newLevel
          }
        }));

        return newLevel;
      }
    } catch (error) {
      this.logger.error('Error updating case inventory level', { error, caseId, materialId });
      throw error;
    }
  }

  /**
   * Record a case inventory transaction
   * 
   * @param transaction - Transaction data without ID
   * @returns Created transaction
   */
  async recordCaseTransaction(
    transaction: Omit<ICaseInventoryTransaction, 'transactionId' | 'created'>
  ): Promise<ICaseInventoryTransaction> {
    try {
      const transactionId = uuidv4();
      const now = new Date().toISOString();
      
      // Create transaction record
      const newTransaction: ICaseInventoryTransaction = {
        transactionId,
        ...transaction,
        created: now
      };

      // Save transaction to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.caseInventoryTransactions,
        Item: {
          PK: `CASE#${transaction.caseId}`,
          SK: `TRANSACTION#${now}`,
          GSI1PK: `MATERIAL#${transaction.materialId}`,
          GSI1SK: `TRANSACTION#${now}`,
          ...newTransaction
        }
      }));

      // Update inventory level based on transaction type
      let quantityChange = 0;
      switch (transaction.type) {
        case TransactionType.PURCHASE:
        case TransactionType.RETURN:
          quantityChange = transaction.quantity;
          break;
        case TransactionType.ALLOCATION:
          quantityChange = -transaction.quantity;
          break;
        case TransactionType.ADJUSTMENT:
          quantityChange = transaction.quantity; // Quantity is the adjustment amount (positive or negative)
          break;
        case TransactionType.TRANSFER:
          if (transaction.sourceId) {
            // This is a transfer from warehouse/vehicle to this case
            quantityChange = transaction.quantity;
          } else {
            // This is a transfer from this case to warehouse/vehicle
            quantityChange = -transaction.quantity;
          }
          break;
        default:
          break;
      }

      if (quantityChange !== 0) {
        // Get current inventory level
        const currentLevel = await this.getCaseInventoryLevel(transaction.caseId, transaction.materialId);
        const currentQuantity = currentLevel?.currentQuantity || 0;
        
        // Update inventory level
        await this.updateCaseInventoryLevel(
          transaction.caseId,
          transaction.materialId,
          currentQuantity + quantityChange,
          transaction.createdBy,
          currentLevel?.standardQuantity,
          currentLevel?.location
        );
      }

      return newTransaction;
    } catch (error) {
      this.logger.error('Error recording case transaction', { error, transaction });
      throw error;
    }
  }}