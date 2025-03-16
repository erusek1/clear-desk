// backend/src/services/inventory.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { 
  IInventoryLevel, 
  IInventoryTransaction, 
  IPurchaseOrder, 
  IVendor,
  IMaterialTakeoff,
  ICsvImportResult,
  TransactionType,
  PurchaseOrderStatus
} from '../types/inventory.types';
import Papa from 'papaparse';

/**
 * Inventory service for managing inventory operations
 */
export class InventoryService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private materialsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('InventoryService');
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
   * Get inventory levels for a company
   * 
   * @param companyId - Company ID
   * @returns List of inventory levels
   */
  async getInventoryLevels(companyId: string): Promise<IInventoryLevel[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.inventory,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`
        }
      }));

      return result.Items?.map(item => ({
        materialId: item.materialId,
        companyId: item.companyId,
        currentQuantity: item.currentQuantity,
        location: item.location,
        lowStockThreshold: item.lowStockThreshold,
        lastStockCheck: item.lastStockCheck,
        created: item.created,
        updated: item.updated,
        createdBy: item.createdBy,
        updatedBy: item.updatedBy
      })) || [];
    } catch (error) {
      this.logger.error('Error getting inventory levels', { error, companyId });
      throw error;
    }
  }

  /**
   * Get inventory level for a specific material
   * 
   * @param companyId - Company ID
   * @param materialId - Material ID
   * @returns Inventory level or null if not found
   */
  async getInventoryLevel(companyId: string, materialId: string): Promise<IInventoryLevel | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.inventory,
        Key: {
          PK: `COMPANY#${companyId}`,
          SK: `INVENTORY#${materialId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return {
        materialId: result.Item.materialId,
        companyId: result.Item.companyId,
        currentQuantity: result.Item.currentQuantity,
        location: result.Item.location,
        lowStockThreshold: result.Item.lowStockThreshold,
        lastStockCheck: result.Item.lastStockCheck,
        created: result.Item.created,
        updated: result.Item.updated,
        createdBy: result.Item.createdBy,
        updatedBy: result.Item.updatedBy
      };
    } catch (error) {
      this.logger.error('Error getting inventory level', { error, companyId, materialId });
      throw error;
    }
  }

  /**
   * Update inventory level for a material
   * 
   * @param companyId - Company ID
   * @param materialId - Material ID
   * @param quantity - New quantity
   * @param userId - User ID making the update
   * @param location - Optional storage location
   * @param lowStockThreshold - Optional low stock threshold
   * @returns Updated inventory level
   */
  async updateInventoryLevel(
    companyId: string, 
    materialId: string, 
    quantity: number, 
    userId: string,
    location?: string,
    lowStockThreshold?: number
  ): Promise<IInventoryLevel> {
    try {
      // Check if inventory level exists
      const existingLevel = await this.getInventoryLevel(companyId, materialId);
      
      if (existingLevel) {
        // Update existing inventory level
        const result = await this.docClient.send(new UpdateCommand({
          TableName: config.dynamodb.tables.inventory,
          Key: {
            PK: `COMPANY#${companyId}`,
            SK: `INVENTORY#${materialId}`
          },
          UpdateExpression: 'set currentQuantity = :qty, location = :loc, lowStockThreshold = :threshold, updated = :updated, updatedBy = :updatedBy',
          ExpressionAttributeValues: {
            ':qty': quantity,
            ':loc': location || existingLevel.location,
            ':threshold': lowStockThreshold !== undefined ? lowStockThreshold : existingLevel.lowStockThreshold,
            ':updated': new Date().toISOString(),
            ':updatedBy': userId
          },
          ReturnValues: 'ALL_NEW'
        }));

        return {
          materialId,
          companyId,
          currentQuantity: quantity,
          location: location || existingLevel.location,
          lowStockThreshold: lowStockThreshold !== undefined ? lowStockThreshold : existingLevel.lowStockThreshold,
          lastStockCheck: existingLevel.lastStockCheck,
          created: existingLevel.created,
          updated: new Date().toISOString(),
          createdBy: existingLevel.createdBy,
          updatedBy: userId
        };
      } else {
        // Create new inventory level
        const now = new Date().toISOString();
        const newLevel: IInventoryLevel = {
          materialId,
          companyId,
          currentQuantity: quantity,
          location,
          lowStockThreshold,
          created: now,
          updated: now,
          createdBy: userId,
          updatedBy: userId
        };

        await this.docClient.send(new PutCommand({
          TableName: config.dynamodb.tables.inventory,
          Item: {
            PK: `COMPANY#${companyId}`,
            SK: `INVENTORY#${materialId}`,
            GSI1PK: `INVENTORY#${materialId}`,
            GSI1SK: `COMPANY#${companyId}`,
            ...newLevel
          }
        }));

        return newLevel;
      }
    } catch (error) {
      this.logger.error('Error updating inventory level', { error, companyId, materialId });
      throw error;
    }
  }

  /**
   * Record an inventory transaction
   * 
   * @param transaction - Transaction data without ID
   * @returns Created transaction
   */
  async recordTransaction(
    transaction: Omit<IInventoryTransaction, 'transactionId' | 'created'>
  ): Promise<IInventoryTransaction> {
    try {
      const transactionId = uuidv4();
      const now = new Date().toISOString();
      
      // Create transaction record
      const newTransaction: IInventoryTransaction = {
        transactionId,
        ...transaction,
        created: now
      };

      // Save transaction to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.inventoryTransactions,
        Item: {
          PK: `INVENTORY_TXN#${transactionId}`,
          SK: 'METADATA',
          GSI1PK: `COMPANY#${transaction.companyId}`,
          GSI1SK: `INVENTORY_TXN#${now}`,
          GSI2PK: `MATERIAL#${transaction.materialId}`,
          GSI2SK: `INVENTORY_TXN#${now}`,
          ...(transaction.projectId ? {
            GSI3PK: `PROJECT#${transaction.projectId}`,
            GSI3SK: `INVENTORY_TXN#${now}`
          } : {}),
          ...newTransaction
        }
      }));

      // Update inventory level based on transaction type
      let quantityChange = 0;
      switch (transaction.type) {
        case TransactionType.PURCHASE:
          quantityChange = transaction.quantity;
          break;
        case TransactionType.ALLOCATION:
          quantityChange = -transaction.quantity;
          break;
        case TransactionType.RETURN:
          quantityChange = transaction.quantity;
          break;
        case TransactionType.ADJUSTMENT:
          quantityChange = transaction.quantity; // Quantity is the adjustment amount (positive or negative)
          break;
        default:
          break;
      }

      if (quantityChange !== 0) {
        // Get current inventory level
        const currentLevel = await this.getInventoryLevel(transaction.companyId, transaction.materialId);
        const currentQuantity = currentLevel?.currentQuantity || 0;
        
        // Update inventory level
        await this.updateInventoryLevel(
          transaction.companyId,
          transaction.materialId,
          currentQuantity + quantityChange,
          transaction.createdBy,
          currentLevel?.location,
          currentLevel?.lowStockThreshold
        );
      }

      return newTransaction;
    } catch (error) {
      this.logger.error('Error recording transaction', { error, transaction });
      throw error;
    }
  }

  /**
   * Get transactions for a material
   * 
   * @param companyId - Company ID
   * @param materialId - Material ID
   * @param limit - Optional result limit
   * @returns List of transactions
   */
  async getMaterialTransactions(
    companyId: string,
    materialId: string,
    limit?: number
  ): Promise<IInventoryTransaction[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.inventoryTransactions,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `MATERIAL#${materialId}`
        },
        Limit: limit,
        ScanIndexForward: false // Get newest first
      }));

      return (result.Items || []) as IInventoryTransaction[];
    } catch (error) {
      this.logger.error('Error getting material transactions', { error, companyId, materialId });
      throw error;
    }
  }

  /**
   * Create a purchase order
   * 
   * @param purchaseOrder - Purchase order data without ID
   * @returns Created purchase order
   */
  async createPurchaseOrder(
    purchaseOrder: Omit<IPurchaseOrder, 'purchaseOrderId' | 'created' | 'updated'>
  ): Promise<IPurchaseOrder> {
    try {
      const purchaseOrderId = uuidv4();
      const now = new Date().toISOString();
      
      // Create PO record
      const newPO: IPurchaseOrder = {
        purchaseOrderId,
        ...purchaseOrder,
        created: now,
        updated: now
      };

      // Save PO to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.purchaseOrders,
        Item: {
          PK: `PO#${purchaseOrderId}`,
          SK: 'METADATA',
          GSI1PK: `COMPANY#${purchaseOrder.companyId}`,
          GSI1SK: `PO#${now}`,
          GSI2PK: `VENDOR#${purchaseOrder.vendorId}`,
          GSI2SK: `PO#${now}`,
          GSI3PK: `PROJECT#${purchaseOrder.projectId}`,
          GSI3SK: `PO#${now}`,
          ...newPO
        }
      }));

      return newPO;
    } catch (error) {
      this.logger.error('Error creating purchase order', { error, purchaseOrder });
      throw error;
    }
  }

  /**
   * Get purchase order by ID
   * 
   * @param purchaseOrderId - Purchase order ID
   * @returns Purchase order or null if not found
   */
  async getPurchaseOrder(purchaseOrderId: string): Promise<IPurchaseOrder | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.purchaseOrders,
        Key: {
          PK: `PO#${purchaseOrderId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IPurchaseOrder;
    } catch (error) {
      this.logger.error('Error getting purchase order', { error, purchaseOrderId });
      throw error;
    }
  }

  /**
   * Update purchase order status
   * 
   * @param purchaseOrderId - Purchase order ID
   * @param status - New status
   * @param userId - User ID making the update
   * @returns Updated purchase order
   */
  async updatePurchaseOrderStatus(
    purchaseOrderId: string,
    status: PurchaseOrderStatus,
    userId: string
  ): Promise<IPurchaseOrder | null> {
    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.purchaseOrders,
        Key: {
          PK: `PO#${purchaseOrderId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set #status = :status, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IPurchaseOrder;
    } catch (error) {
      this.logger.error('Error updating purchase order status', { error, purchaseOrderId });
      throw error;
    }
  }

  /**
   * Get a list of purchase orders
   * 
   * @param companyId - Company ID
   * @param status - Optional status filter
   * @param vendorId - Optional vendor filter
   * @param projectId - Optional project filter
   * @returns List of purchase orders
   */
  async listPurchaseOrders(
    companyId: string,
    status?: PurchaseOrderStatus,
    vendorId?: string,
    projectId?: string
  ): Promise<IPurchaseOrder[]> {
    try {
      let queryParams: any = {
        TableName: config.dynamodb.tables.purchaseOrders,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`
        }
      };

      // Add filters if provided
      if (status || vendorId || projectId) {
        let filterExpression = '';
        const expressionAttributeValues: any = {
          ':pk': `COMPANY#${companyId}`
        };

        if (status) {
          filterExpression += '#status = :status';
          expressionAttributeValues[':status'] = status;
        }

        if (vendorId) {
          if (filterExpression) filterExpression += ' AND ';
          filterExpression += 'vendorId = :vendorId';
          expressionAttributeValues[':vendorId'] = vendorId;
        }

        if (projectId) {
          if (filterExpression) filterExpression += ' AND ';
          filterExpression += 'projectId = :projectId';
          expressionAttributeValues[':projectId'] = projectId;
        }

        queryParams.FilterExpression = filterExpression;
        queryParams.ExpressionAttributeValues = expressionAttributeValues;

        if (status) {
          queryParams.ExpressionAttributeNames = {
            '#status': 'status'
          };
        }
      }

      const result = await this.docClient.send(new QueryCommand(queryParams));

      return (result.Items || []) as IPurchaseOrder[];
    } catch (error) {
      this.logger.error('Error listing purchase orders', { error, companyId });
      throw error;
    }
  }}