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
  }

  /**
   * Transfer materials between warehouse and case
   * 
   * @param fromWarehouse - Whether transfer is from warehouse to case
   * @param caseId - Case ID
   * @param materialId - Material ID
   * @param quantity - Quantity to transfer
   * @param userId - User ID making the transfer
   * @param companyId - Company ID (for warehouse inventory)
   * @returns Transaction ID
   */
  async transferMaterials(
    fromWarehouse: boolean,
    caseId: string,
    materialId: string,
    quantity: number,
    userId: string,
    companyId: string
  ): Promise<string> {
    try {
      // Create transaction record
      const transaction: Omit<ICaseInventoryTransaction, 'transactionId' | 'created'> = {
        caseId,
        materialId,
        type: TransactionType.TRANSFER,
        quantity,
        sourceId: fromWarehouse ? 'WAREHOUSE' : undefined,
        createdBy: userId
      };

      // Record case transaction
      const caseTransaction = await this.recordCaseTransaction(transaction);

      // If we're transferring from warehouse, we need to update the warehouse inventory
      if (fromWarehouse) {
        // Get InventoryService instance to update warehouse inventory
        const InventoryService = require('./inventory.service').InventoryService;
        const inventoryService = new InventoryService(this.docClient, this.s3Client);
        
        // Record warehouse transaction
        await inventoryService.recordTransaction({
          companyId,
          materialId,
          type: TransactionType.ALLOCATION,
          quantity,
          notes: `Transfer to employee case ${caseId}`,
          createdBy: userId
        });
      } else {
        // Transferring to warehouse, update warehouse inventory
        const InventoryService = require('./inventory.service').InventoryService;
        const inventoryService = new InventoryService(this.docClient, this.s3Client);
        
        // Record warehouse transaction
        await inventoryService.recordTransaction({
          companyId,
          materialId,
          type: TransactionType.RETURN,
          quantity,
          notes: `Transfer from employee case ${caseId}`,
          createdBy: userId
        });
      }

      return caseTransaction.transactionId;
    } catch (error) {
      this.logger.error('Error transferring materials', { 
        error, fromWarehouse, caseId, materialId 
      });
      throw error;
    }
  }

  /**
   * Create a case inventory check
   * 
   * @param caseId - Case ID
   * @param userId - User ID performing the check
   * @returns Created inventory check
   */
  async createInventoryCheck(caseId: string, userId: string): Promise<ICaseInventoryCheck> {
    try {
      const checkId = uuidv4();
      const now = new Date().toISOString();
      
      // Get current inventory
      const inventory = await this.getCaseInventory(caseId);
      
      // Create check items
      const items = inventory.map(item => ({
        materialId: item.materialId,
        expectedQuantity: item.standardQuantity,
        actualQuantity: 0, // Will be filled in during the check
        notes: ''
      }));
      
      // Create check record
      const check: ICaseInventoryCheck = {
        checkId,
        caseId,
        date: now,
        performedBy: userId,
        items,
        variance: {
          missing: [],
          extra: []
        },
        completed: false,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save check to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.caseInventoryChecks,
        Item: {
          PK: `CASE#${caseId}`,
          SK: `CHECK#${checkId}`,
          GSI1PK: `CHECK#${checkId}`,
          GSI1SK: `CASE#${caseId}`,
          ...check
        }
      }));

      return check;
    } catch (error) {
      this.logger.error('Error creating inventory check', { error, caseId });
      throw error;
    }
  }

  /**
   * Update inventory check item
   * 
   * @param checkId - Check ID
   * @param caseId - Case ID
   * @param materialId - Material ID
   * @param actualQuantity - Actual quantity
   * @param notes - Optional notes
   * @param userId - User ID making the update
   * @returns Updated inventory check
   */
  async updateInventoryCheckItem(
    checkId: string,
    caseId: string,
    materialId: string,
    actualQuantity: number,
    notes: string | undefined,
    userId: string
  ): Promise<ICaseInventoryCheck | null> {
    try {
      // Get existing check
      const check = await this.getInventoryCheck(checkId, caseId);
      if (!check) {
        throw new Error('Inventory check not found');
      }

      // Find and update the item
      const itemIndex = check.items.findIndex(item => item.materialId === materialId);
      if (itemIndex === -1) {
        throw new Error('Material not found in inventory check');
      }

      // Update check items
      const updatedItems = [...check.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        actualQuantity,
        notes: notes || updatedItems[itemIndex].notes
      };

      // Update the check in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.caseInventoryChecks,
        Key: {
          PK: `CASE#${caseId}`,
          SK: `CHECK#${checkId}`
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

      return result.Attributes as ICaseInventoryCheck;
    } catch (error) {
      this.logger.error('Error updating inventory check item', { 
        error, checkId, caseId, materialId 
      });
      throw error;
    }
  }

  /**
   * Complete inventory check
   * 
   * @param checkId - Check ID
   * @param caseId - Case ID
   * @param updateInventory - Whether to update inventory levels
   * @param userId - User ID completing the check
   * @returns Completed inventory check
   */
  async completeInventoryCheck(
    checkId: string,
    caseId: string,
    updateInventory: boolean,
    userId: string
  ): Promise<ICaseInventoryCheck | null> {
    try {
      // Get existing check
      const check = await this.getInventoryCheck(checkId, caseId);
      if (!check) {
        throw new Error('Inventory check not found');
      }

      // Calculate variances
      const variance = {
        missing: [] as { materialId: string; quantity: number }[],
        extra: [] as { materialId: string; quantity: number }[]
      };

      for (const item of check.items) {
        const diff = item.actualQuantity - item.expectedQuantity;
        if (diff < 0) {
          variance.missing.push({
            materialId: item.materialId,
            quantity: Math.abs(diff)
          });
        } else if (diff > 0) {
          variance.extra.push({
            materialId: item.materialId,
            quantity: diff
          });
        }
      }

      // Update inventory levels if requested
      if (updateInventory) {
        for (const item of check.items) {
          await this.updateCaseInventoryLevel(
            caseId,
            item.materialId,
            item.actualQuantity,
            userId
          );
        }
      }

      // Update the check in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.caseInventoryChecks,
        Key: {
          PK: `CASE#${caseId}`,
          SK: `CHECK#${checkId}`
        },
        UpdateExpression: 'set completed = :completed, variance = :variance, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':completed': true,
          ':variance': variance,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      // Update last stock check date for case inventory
      for (const item of check.items) {
        // Get current inventory level
        const level = await this.getCaseInventoryLevel(caseId, item.materialId);
        if (level) {
          // Update last stock check date
          await this.docClient.send(new UpdateCommand({
            TableName: config.dynamodb.tables.caseInventory,
            Key: {
              PK: `CASE#${caseId}`,
              SK: `INVENTORY#${item.materialId}`
            },
            UpdateExpression: 'set lastStockCheck = :date, updated = :updated, updatedBy = :updatedBy',
            ExpressionAttributeValues: {
              ':date': new Date().toISOString(),
              ':updated': new Date().toISOString(),
              ':updatedBy': userId
            }
          }));
        }
      }

      return result.Attributes as ICaseInventoryCheck;
    } catch (error) {
      this.logger.error('Error completing inventory check', { error, checkId, caseId });
      throw error;
    }
  }

  /**
   * Get inventory check
   * 
   * @param checkId - Check ID
   * @param caseId - Case ID
   * @returns Inventory check or null if not found
   */
  async getInventoryCheck(checkId: string, caseId: string): Promise<ICaseInventoryCheck | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.caseInventoryChecks,
        Key: {
          PK: `CASE#${caseId}`,
          SK: `CHECK#${checkId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as ICaseInventoryCheck;
    } catch (error) {
      this.logger.error('Error getting inventory check', { error, checkId, caseId });
      throw error;
    }
  }

  /**
   * Get recent inventory checks for a case
   * 
   * @param caseId - Case ID
   * @param limit - Optional result limit
   * @returns List of inventory checks
   */
  async getRecentInventoryChecks(caseId: string, limit?: number): Promise<ICaseInventoryCheck[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.caseInventoryChecks,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `CASE#${caseId}`,
          ':sk': 'CHECK#'
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as ICaseInventoryCheck[];
    } catch (error) {
      this.logger.error('Error getting recent inventory checks', { error, caseId });
      throw error;
    }
  }

  /**
   * Create case template
   * 
   * @param template - Template data without ID
   * @returns Created template
   */
  async createCaseTemplate(
    template: Omit<ICaseTemplate, 'templateId' | 'created' | 'updated'>
  ): Promise<ICaseTemplate> {
    try {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      
      // Create template record
      const newTemplate: ICaseTemplate = {
        templateId,
        ...template,
        created: now,
        updated: now
      };

      // Save template to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.caseTemplates,
        Item: {
          PK: `COMPANY#${template.companyId}`,
          SK: `TEMPLATE#${templateId}`,
          GSI1PK: `TEMPLATE#${template.caseType}`,
          GSI1SK: `COMPANY#${template.companyId}`,
          ...newTemplate
        }
      }));

      return newTemplate;
    } catch (error) {
      this.logger.error('Error creating case template', { error, template });
      throw error;
    }
  }

  /**
   * Get case template
   * 
   * @param templateId - Template ID
   * @param companyId - Company ID
   * @returns Template or null if not found
   */
  async getCaseTemplate(templateId: string, companyId: string): Promise<ICaseTemplate | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.caseTemplates,
        Key: {
          PK: `COMPANY#${companyId}`,
          SK: `TEMPLATE#${templateId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as ICaseTemplate;
    } catch (error) {
      this.logger.error('Error getting case template', { error, templateId, companyId });
      throw error;
    }
  }

  /**
   * Get all case templates for a company
   * 
   * @param companyId - Company ID
   * @param caseType - Optional case type filter
   * @returns List of templates
   */
  async getCaseTemplates(companyId: string, caseType?: string): Promise<ICaseTemplate[]> {
    try {
      let params: any = {
        TableName: config.dynamodb.tables.caseTemplates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`,
          ':sk': 'TEMPLATE#'
        }
      };

      // Use case type filter if provided
      if (caseType) {
        params = {
          TableName: config.dynamodb.tables.caseTemplates,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `TEMPLATE#${caseType}`,
            ':sk': `COMPANY#${companyId}`
          }
        };
      }

      const result = await this.docClient.send(new QueryCommand(params));

      return (result.Items || []) as ICaseTemplate[];
    } catch (error) {
      this.logger.error('Error getting case templates', { error, companyId, caseType });
      throw error;
    }
  }

  /**
   * Apply case template to a case
   * 
   * @param caseId - Case ID
   * @param templateId - Template ID
   * @param companyId - Company ID
   * @param userId - User ID applying the template
   * @returns Number of items updated
   */
  async applyCaseTemplate(
    caseId: string,
    templateId: string,
    companyId: string,
    userId: string
  ): Promise<number> {
    try {
      // Get template
      const template = await this.getCaseTemplate(templateId, companyId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Apply each item in the template
      let updateCount = 0;
      for (const item of template.items) {
        await this.updateCaseInventoryLevel(
          caseId,
          item.materialId,
          item.standardQuantity, // Set current quantity to standard
          userId,
          item.standardQuantity,
          item.location
        );
        updateCount++;
      }

      return updateCount;
    } catch (error) {
      this.logger.error('Error applying case template', { error, caseId, templateId });
      throw error;
    }
  }

  /**
   * Import case inventory from CSV
   * 
   * @param caseId - Case ID
   * @param fileKey - S3 file key for the CSV
   * @param userId - User ID performing the import
   * @returns Import result
   */
  async importCaseInventoryFromCsv(
    caseId: string,
    fileKey: string,
    userId: string
  ): Promise<{ totalRows: number; successRows: number; failedRows: number }> {
    try {
      // Get CSV file from S3
      const fileData = await this.getFileFromS3(fileKey);
      
      // Parse CSV
      const parsedData = await this.parseCSV(fileData);
      
      let totalRows = 0;
      let successRows = 0;
      let failedRows = 0;

      // Process each row
      for (const row of parsedData.data) {
        totalRows++;
        try {
          // Validate row
          if (!row.materialId) {
            throw new Error('Material ID is required');
          }
          
          if (row.quantity === undefined || row.quantity === null) {
            throw new Error('Quantity is required');
          }

          // Update inventory level
          await this.updateCaseInventoryLevel(
            caseId,
            row.materialId,
            parseFloat(row.quantity),
            userId,
            row.standardQuantity ? parseFloat(row.standardQuantity) : undefined,
            row.location
          );

          successRows++;
        } catch (error) {
          failedRows++;
          this.logger.error('Error processing CSV row', { 
            error, caseId, row, rowIndex: totalRows 
          });
        }
      }

      return { totalRows, successRows, failedRows };
    } catch (error) {
      this.logger.error('Error importing case inventory from CSV', { error, caseId, fileKey });
      throw error;
    }
  }

  /**
   * Export case inventory to CSV
   * 
   * @param caseId - Case ID
   * @returns S3 file key for the generated CSV
   */
  async exportCaseInventoryToCsv(caseId: string): Promise<string> {
    try {
      // Get case details
      const employeeCase = await this.getCase(caseId, ''); // Use GSI1 to get case by caseId
      if (!employeeCase) {
        throw new Error('Case not found');
      }

      // Get all inventory levels
      const inventory = await this.getCaseInventory(caseId);
      
      // Create CSV data
      const csvData = await this.createInventoryCsv(inventory, employeeCase);
      
      // Upload to S3
      const fileKey = `exports/cases/${caseId}/inventory-${new Date().toISOString()}.csv`;
      await this.uploadToS3(fileKey, csvData, 'text/csv');
      
      return fileKey;
    } catch (error) {
      this.logger.error('Error exporting case inventory to CSV', { error, caseId });
      throw error;
    }
  }

  /**
   * Get missing items for a case
   * 
   * @param caseId - Case ID
   * @returns List of missing items
   */
  async getCaseMissingItems(caseId: string): Promise<{
    materialId: string;
    name: string;
    currentQuantity: number;
    standardQuantity: number;
    deficit: number;
  }[]> {
    try {
      // Get all inventory levels
      const inventory = await this.getCaseInventory(caseId);
      
      // Filter for missing items
      const missingItems = [];
      
      for (const item of inventory) {
        if (
          item.standardQuantity !== undefined && 
          item.currentQuantity < item.standardQuantity
        ) {
          // Get material name from MongoDB
          const material = await this.getMaterial(item.materialId);
          
          missingItems.push({
            materialId: item.materialId,
            name: material?.name || 'Unknown Material',
            currentQuantity: item.currentQuantity,
            standardQuantity: item.standardQuantity,
            deficit: item.standardQuantity - item.currentQuantity
          });
        }
      }
      
      // Sort by deficit (highest first)
      return missingItems.sort((a, b) => b.deficit - a.deficit);
    } catch (error) {
      this.logger.error('Error getting case missing items', { error, caseId });
      throw error;
    }
  }

  /**
   * Get file from S3
   * 
   * @param fileKey - S3 file key
   * @returns File data as string
   */
  private async getFileFromS3(fileKey: string): Promise<string> {
    try {
      const result = await this.s3Client.send(new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey
      }));

      const streamToString = (stream: any): Promise<string> => {
        return new Promise((resolve, reject) => {
          const chunks: any[] = [];
          stream.on('data', (chunk: any) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
      };

      if (!result.Body) {
        throw new Error('Empty file');
      }

      return streamToString(result.Body);
    } catch (error) {
      this.logger.error('Error getting file from S3', { error, fileKey });
      throw error;
    }
  }

  /**
   * Upload file to S3
   * 
   * @param fileKey - S3 file key
   * @param data - File data
   * @param contentType - Content type
   * @returns S3 file key
   */
  private async uploadToS3(fileKey: string, data: string, contentType: string): Promise<string> {
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey,
        Body: data,
        ContentType: contentType
      }));

      return fileKey;
    } catch (error) {
      this.logger.error('Error uploading to S3', { error, fileKey });
      throw error;
    }
  }

  /**
   * Parse CSV data
   * 
   * @param csvData - CSV data as string
   * @returns Parsed CSV data
   */
  private parseCSV(csvData: string): Promise<Papa.ParseResult<any>> {
    return new Promise((resolve, reject) => {
      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          resolve(results);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  }

  /**
   * Create CSV data from inventory levels
   * 
   * @param inventory - Case inventory levels
   * @param employeeCase - Case details
   * @returns CSV data as string
   */
  private async createInventoryCsv(inventory: ICaseInventoryLevel[], employeeCase: IEmployeeCase): Promise<string> {
    try {
      const rows = [];
      
      // Add header row
      rows.push([
        'materialId',
        'name',
        'category',
        'currentQuantity',
        'standardQuantity',
        'location',
        'lastStockCheck'
      ].join(','));
      
      // Add data rows
      for (const item of inventory) {
        // Get material details from MongoDB
        const material = await this.getMaterial(item.materialId);
        
        rows.push([
          item.materialId,
          this.escapeCsvValue(material?.name || 'Unknown'),
          this.escapeCsvValue(material?.category || ''),
          item.currentQuantity,
          item.standardQuantity || '',
          this.escapeCsvValue(item.location || ''),
          item.lastStockCheck || ''
        ].join(','));
      }
      
      return rows.join('\n');
    } catch (error) {
      this.logger.error('Error creating inventory CSV', { error, caseId: employeeCase.caseId });
      throw error;
    }
  }

  /**
   * Escape CSV value
   * 
   * @param value - Value to escape
   * @returns Escaped value
   */
  private escapeCsvValue(value: string): string {
    if (value == null) return '';
    
    // If value contains comma, quote, or newline, wrap in quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      // Double up quotes for escaping
      return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
  }

  /**
   * Get material details from MongoDB
   * 
   * @param materialId - Material ID
   * @returns Material details
   */
  private async getMaterial(materialId: string): Promise<any> {
    try {
      await this.initMongo();
      
      // Query for material
      const material = await this.materialsCollection.findOne({ _id: materialId });
      
      return material;
    } catch (error) {
      this.logger.error('Error getting material', { error, materialId });
      return null;
    }
  }
}