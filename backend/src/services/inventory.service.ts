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
  }

  /**
   * Create a vendor
   * 
   * @param vendor - Vendor data without ID
   * @returns Created vendor
   */
  async createVendor(
    vendor: Omit<IVendor, 'vendorId' | 'created' | 'updated'>
  ): Promise<IVendor> {
    try {
      const vendorId = uuidv4();
      const now = new Date().toISOString();
      
      // Create vendor record
      const newVendor: IVendor = {
        vendorId,
        ...vendor,
        created: now,
        updated: now
      };

      // Save vendor to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vendors,
        Item: {
          PK: `VENDOR#${vendorId}`,
          SK: 'METADATA',
          GSI1PK: `COMPANY#${vendor.companyId}`,
          GSI1SK: `VENDOR#${vendor.name}`,
          ...newVendor
        }
      }));

      return newVendor;
    } catch (error) {
      this.logger.error('Error creating vendor', { error, vendor });
      throw error;
    }
  }

  /**
   * Get vendor by ID
   * 
   * @param vendorId - Vendor ID
   * @returns Vendor or null if not found
   */
  async getVendor(vendorId: string): Promise<IVendor | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vendors,
        Key: {
          PK: `VENDOR#${vendorId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IVendor;
    } catch (error) {
      this.logger.error('Error getting vendor', { error, vendorId });
      throw error;
    }
  }

  /**
   * Get all vendors for a company
   * 
   * @param companyId - Company ID
   * @returns List of vendors
   */
  async getVendors(companyId: string): Promise<IVendor[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vendors,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`
        }
      }));

      return (result.Items || []) as IVendor[];
    } catch (error) {
      this.logger.error('Error getting vendors', { error, companyId });
      throw error;
    }
  }

  /**
   * Create a material takeoff from an estimate
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param userId - User ID creating the takeoff
   * @returns Created material takeoff
   */
  async createMaterialTakeoff(
    projectId: string,
    estimateId: string,
    userId: string
  ): Promise<IMaterialTakeoff> {
    try {
      // Get the estimate
      const estimate = await this.getEstimate(estimateId, projectId);
      if (!estimate) {
        throw new Error('Estimate not found');
      }

      // Get company ID from the project
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const companyId = project.companyId;
      const takeoffId = uuidv4();
      const now = new Date().toISOString();

      // Calculate materials needed based on estimate
      const materials = await this.calculateMaterialsFromEstimate(estimate, companyId);
      
      // Create takeoff record
      const takeoff: IMaterialTakeoff = {
        takeoffId,
        projectId,
        estimateId,
        status: 'created',
        version: 1,
        items: materials,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save takeoff to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.materialsTakeoff,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `TAKEOFF#${takeoffId}`,
          GSI1PK: `TAKEOFF#${takeoffId}`,
          GSI1SK: `PROJECT#${projectId}`,
          ...takeoff
        }
      }));

      return takeoff;
    } catch (error) {
      this.logger.error('Error creating material takeoff', { error, projectId, estimateId });
      throw error;
    }
  }

  /**
   * Get a material takeoff by ID
   * 
   * @param projectId - Project ID
   * @param takeoffId - Takeoff ID
   * @returns Material takeoff or null if not found
   */
  async getMaterialTakeoff(projectId: string, takeoffId: string): Promise<IMaterialTakeoff | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.materialsTakeoff,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `TAKEOFF#${takeoffId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IMaterialTakeoff;
    } catch (error) {
      this.logger.error('Error getting material takeoff', { error, projectId, takeoffId });
      throw error;
    }
  }

  /**
   * Get all material takeoffs for a project
   * 
   * @param projectId - Project ID
   * @returns List of material takeoffs
   */
  async getProjectMaterialTakeoffs(projectId: string): Promise<IMaterialTakeoff[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.materialsTakeoff,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'TAKEOFF#'
        }
      }));

      return (result.Items || []) as IMaterialTakeoff[];
    } catch (error) {
      this.logger.error('Error getting project material takeoffs', { error, projectId });
      throw error;
    }
  }

  /**
   * Import inventory from CSV
   * 
   * @param companyId - Company ID
   * @param fileKey - S3 file key for the CSV
   * @param userId - User ID performing the import
   * @returns Import result
   */
  async importInventoryFromCsv(
    companyId: string,
    fileKey: string,
    userId: string
  ): Promise<ICsvImportResult> {
    try {
      // Get CSV file from S3
      const fileData = await this.getFileFromS3(fileKey);
      
      // Parse CSV
      const parsedData = await this.parseCSV(fileData);
      
      const result: ICsvImportResult = {
        totalRows: parsedData.data.length,
        successRows: 0,
        failedRows: 0,
        errors: [],
        importedItems: []
      };

      // Process each row
      for (let i = 0; i < parsedData.data.length; i++) {
        const row = parsedData.data[i];
        try {
          // Validate row
          if (!row.id && !row.sku && !row.materialId) {
            throw new Error('Material identifier (id, sku, or materialId) is required');
          }
          
          if (row.quantity === undefined || row.quantity === null) {
            throw new Error('Quantity is required');
          }

          // Get material ID (prefer materialId, then id, then sku)
          const materialId = row.materialId || row.id || row.sku;
          const quantity = parseFloat(row.quantity);
          
          if (isNaN(quantity)) {
            throw new Error('Quantity must be a number');
          }

          // Update inventory level
          await this.updateInventoryLevel(
            companyId,
            materialId,
            quantity,
            userId,
            row.location,
            row.lowStockThreshold ? parseFloat(row.lowStockThreshold) : undefined
          );

          // Add to imported items
          result.importedItems.push({
            materialId,
            name: row.name || 'Unknown',
            quantity
          });

          result.successRows++;
        } catch (error: any) {
          result.failedRows++;
          result.errors.push({
            row: i + 1, // 1-based row number for user-friendliness
            message: error.message || 'Unknown error'
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Error importing inventory from CSV', { error, companyId, fileKey });
      throw error;
    }
  }

  /**
   * Export inventory to CSV
   * 
   * @param companyId - Company ID
   * @returns S3 file key for the generated CSV
   */
  async exportInventoryToCsv(companyId: string): Promise<string> {
    try {
      // Get all inventory levels
      const inventoryLevels = await this.getInventoryLevels(companyId);
      
      // Create CSV data
      const csvData = await this.createInventoryCsv(inventoryLevels, companyId);
      
      // Upload to S3
      const fileKey = `exports/${companyId}/inventory-${new Date().toISOString()}.csv`;
      await this.uploadToS3(fileKey, csvData, 'text/csv');
      
      return fileKey;
    } catch (error) {
      this.logger.error('Error exporting inventory to CSV', { error, companyId });
      throw error;
    }
  }

  /**
   * Get low stock items
   * 
   * @param companyId - Company ID
   * @returns List of low stock items
   */
  async getLowStockItems(companyId: string): Promise<{
    materialId: string;
    name: string;
    currentQuantity: number;
    lowStockThreshold: number;
    deficit: number;
  }[]> {
    try {
      // Get all inventory levels
      const inventoryLevels = await this.getInventoryLevels(companyId);
      
      // Filter for low stock items
      const lowStockItems = [];
      
      for (const item of inventoryLevels) {
        if (
          item.lowStockThreshold !== undefined && 
          item.currentQuantity < item.lowStockThreshold
        ) {
          // Get material name from MongoDB
          const material = await this.getMaterial(item.materialId);
          
          lowStockItems.push({
            materialId: item.materialId,
            name: material?.name || 'Unknown Material',
            currentQuantity: item.currentQuantity,
            lowStockThreshold: item.lowStockThreshold,
            deficit: item.lowStockThreshold - item.currentQuantity
          });
        }
      }
      
      // Sort by deficit (highest first)
      return lowStockItems.sort((a, b) => b.deficit - a.deficit);
    } catch (error) {
      this.logger.error('Error getting low stock items', { error, companyId });
      throw error;
    }
  }

  /**
   * Get materials needed for project completion
   * 
   * @param projectId - Project ID
   * @returns List of materials needed
   */
  async getMaterialsNeededForProject(projectId: string): Promise<{
    materialId: string;
    name: string;
    quantityNeeded: number;
    quantityInStock: number;
    quantityToOrder: number;
  }[]> {
    try {
      // Get project
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const companyId = project.companyId;

      // Get the latest material takeoff
      const takeoffs = await this.getProjectMaterialTakeoffs(projectId);
      if (takeoffs.length === 0) {
        return [];
      }

      // Get the most recent takeoff
      const latestTakeoff = takeoffs.sort((a, b) => 
        new Date(b.created).getTime() - new Date(a.created).getTime()
      )[0];

      // Get current inventory levels
      const inventoryMap = new Map<string, number>();
      const inventoryLevels = await this.getInventoryLevels(companyId);
      
      for (const level of inventoryLevels) {
        inventoryMap.set(level.materialId, level.currentQuantity);
      }

      // Calculate materials needed
      const materialsNeeded = [];
      
      for (const item of latestTakeoff.items) {
        const currentStock = inventoryMap.get(item.materialId) || 0;
        const toOrder = Math.max(0, item.adjustedQuantity - currentStock);
        
        // Get material name from MongoDB
        const material = await this.getMaterial(item.materialId);
        
        materialsNeeded.push({
          materialId: item.materialId,
          name: material?.name || 'Unknown Material',
          quantityNeeded: item.adjustedQuantity,
          quantityInStock: currentStock,
          quantityToOrder: toOrder
        });
      }
      
      // Sort by quantity to order (highest first)
      return materialsNeeded.sort((a, b) => b.quantityToOrder - a.quantityToOrder);
    } catch (error) {
      this.logger.error('Error getting materials needed for project', { error, projectId });
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
   * @param inventoryLevels - Inventory levels
   * @param companyId - Company ID
   * @returns CSV data as string
   */
  private async createInventoryCsv(inventoryLevels: IInventoryLevel[], companyId: string): Promise<string> {
    try {
      const rows = [];
      
      // Add header row
      rows.push([
        'materialId',
        'name',
        'category',
        'subcategory',
        'currentQuantity',
        'location',
        'lowStockThreshold',
        'lastStockCheck'
      ].join(','));
      
      // Add data rows
      for (const level of inventoryLevels) {
        // Get material details from MongoDB
        const material = await this.getMaterial(level.materialId);
        
        rows.push([
          level.materialId,
          this.escapeCsvValue(material?.name || 'Unknown'),
          this.escapeCsvValue(material?.category || ''),
          this.escapeCsvValue(material?.subcategory || ''),
          level.currentQuantity,
          this.escapeCsvValue(level.location || ''),
          level.lowStockThreshold || '',
          level.lastStockCheck || ''
        ].join(','));
      }
      
      return rows.join('\n');
    } catch (error) {
      this.logger.error('Error creating inventory CSV', { error, companyId });
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
   * Calculate materials from estimate
   * 
   * @param estimate - Estimate data
   * @param companyId - Company ID
   * @returns List of materials
   */
  private async calculateMaterialsFromEstimate(estimate: any, companyId: string): Promise<any[]> {
    try {
      // Connect to MongoDB to get assembly details
      await this.initMongo();
      
      const db = this.mongoClient?.db(config.mongodb.dbName);
      const assembliesCollection = db?.collection('assemblies');
      
      if (!assembliesCollection) {
        throw new Error('Could not connect to assemblies collection');
      }
      
      // Map to track materials
      const materialsMap = new Map<string, {
        materialId: string;
        quantity: number;
        wasteFactor: number;
        adjustedQuantity: number;
        unitCost: number;
        totalCost: number;
        inventoryAllocated: number;
        purchaseNeeded: number;
      }>();
      
      // Process each room in the estimate
      for (const room of estimate.rooms || []) {
        for (const item of room.items || []) {
          // Get assembly details
          const assembly = await assembliesCollection.findOne({ _id: item.assemblyId });
          
          if (assembly) {
            // Process materials in the assembly
            for (const material of assembly.materials || []) {
              const materialId = material.materialId.toString();
              const quantity = material.quantity * item.quantity;
              
              // If material already exists in map, update quantity
              if (materialsMap.has(materialId)) {
                const existing = materialsMap.get(materialId)!;
                existing.quantity += quantity;
                existing.adjustedQuantity = Math.ceil(existing.quantity * existing.wasteFactor);
                existing.totalCost = existing.adjustedQuantity * existing.unitCost;
              } else {
                // Get material details for cost
                const materialDetails = await this.getMaterial(materialId);
                const unitCost = materialDetails?.currentCost || 0;
                const wasteFactor = material.wasteFactor || materialDetails?.wasteFactor || 1.1;
                
                materialsMap.set(materialId, {
                  materialId,
                  quantity,
                  wasteFactor,
                  adjustedQuantity: Math.ceil(quantity * wasteFactor),
                  unitCost,
                  totalCost: Math.ceil(quantity * wasteFactor) * unitCost,
                  inventoryAllocated: 0,
                  purchaseNeeded: Math.ceil(quantity * wasteFactor)
                });
              }
            }
          }
        }
      }
      
      // Get current inventory levels
      const inventoryLevels = await this.getInventoryLevels(companyId);
      const inventoryMap = new Map<string, number>();
      
      for (const level of inventoryLevels) {
        inventoryMap.set(level.materialId, level.currentQuantity);
      }
      
      // Calculate allocation and purchase needs
      const materials = Array.from(materialsMap.values());
      
      for (const material of materials) {
        const inStock = inventoryMap.get(material.materialId) || 0;
        material.inventoryAllocated = Math.min(inStock, material.adjustedQuantity);
        material.purchaseNeeded = Math.max(0, material.adjustedQuantity - material.inventoryAllocated);
      }
      
      return materials;
    } catch (error) {
      this.logger.error('Error calculating materials from estimate', { error });
      throw error;
    }
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

  /**
   * Get estimate by ID
   * 
   * @param estimateId - Estimate ID
   * @param projectId - Project ID
   * @returns Estimate or null if not found
   */
  private async getEstimate(estimateId: string, projectId: string): Promise<any | null> {
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
      this.logger.error('Error getting estimate', { error, estimateId, projectId });
      return null;
    }
  }

  /**
   * Get project by ID
   * 
   * @param projectId - Project ID
   * @returns Project or null if not found
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