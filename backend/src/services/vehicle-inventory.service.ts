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
   * Record a vehicle inventory transaction
   * 
   * @param transaction - Transaction data without ID
   * @returns Created transaction
   */
  async recordVehicleTransaction(
    transaction: Omit<IVehicleInventoryTransaction, 'transactionId' | 'created'>
  ): Promise<IVehicleInventoryTransaction> {
    try {
      const transactionId = uuidv4();
      const now = new Date().toISOString();
      
      // Create transaction record
      const newTransaction: IVehicleInventoryTransaction = {
        transactionId,
        ...transaction,
        created: now
      };

      // Save transaction to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vehicleInventoryTransactions,
        Item: {
          PK: `VEHICLE#${transaction.vehicleId}`,
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
            // This is a transfer from warehouse/other vehicle to this vehicle
            quantityChange = transaction.quantity;
          } else {
            // This is a transfer from this vehicle to warehouse/other vehicle
            quantityChange = -transaction.quantity;
          }
          break;
        default:
          break;
      }

      if (quantityChange !== 0) {
        // Get current inventory level
        const currentLevel = await this.getVehicleInventoryLevel(transaction.vehicleId, transaction.materialId);
        const currentQuantity = currentLevel?.currentQuantity || 0;
        
        // Update inventory level
        await this.updateVehicleInventoryLevel(
          transaction.vehicleId,
          transaction.materialId,
          currentQuantity + quantityChange,
          transaction.createdBy,
          currentLevel?.minQuantity,
          currentLevel?.standardQuantity,
          currentLevel?.location
        );
      }

      return newTransaction;
    } catch (error) {
      this.logger.error('Error recording vehicle transaction', { error, transaction });
      throw error;
    }
  }

  /**
   * Transfer materials between warehouse and vehicle
   * 
   * @param fromWarehouse - Whether transfer is from warehouse to vehicle
   * @param vehicleId - Vehicle ID
   * @param materialId - Material ID
   * @param quantity - Quantity to transfer
   * @param userId - User ID making the transfer
   * @param companyId - Company ID (for warehouse inventory)
   * @returns Transaction ID
   */
  async transferMaterials(
    fromWarehouse: boolean,
    vehicleId: string,
    materialId: string,
    quantity: number,
    userId: string,
    companyId: string
  ): Promise<string> {
    try {
      // Create transaction record
      const transaction: Omit<IVehicleInventoryTransaction, 'transactionId' | 'created'> = {
        vehicleId,
        materialId,
        type: TransactionType.TRANSFER,
        quantity,
        sourceId: fromWarehouse ? 'WAREHOUSE' : undefined,
        createdBy: userId
      };

      // Record vehicle transaction
      const vehicleTransaction = await this.recordVehicleTransaction(transaction);

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
          notes: `Transfer to vehicle ${vehicleId}`,
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
          notes: `Transfer from vehicle ${vehicleId}`,
          createdBy: userId
        });
      }

      return vehicleTransaction.transactionId;
    } catch (error) {
      this.logger.error('Error transferring materials', { 
        error, fromWarehouse, vehicleId, materialId 
      });
      throw error;
    }
  }

  /**
   * Transfer materials between vehicles
   * 
   * @param fromVehicleId - Source vehicle ID
   * @param toVehicleId - Destination vehicle ID
   * @param materialId - Material ID
   * @param quantity - Quantity to transfer
   * @param userId - User ID making the transfer
   * @returns Array of transaction IDs [fromTransaction, toTransaction]
   */
  async transferBetweenVehicles(
    fromVehicleId: string,
    toVehicleId: string,
    materialId: string,
    quantity: number,
    userId: string
  ): Promise<string[]> {
    try {
      // Create transaction for source vehicle
      const fromTransaction: Omit<IVehicleInventoryTransaction, 'transactionId' | 'created'> = {
        vehicleId: fromVehicleId,
        materialId,
        type: TransactionType.TRANSFER,
        quantity,
        sourceId: toVehicleId, // Destination is the source of the transaction (to identify as outgoing)
        createdBy: userId
      };

      // Record source transaction
      const sourceTransaction = await this.recordVehicleTransaction(fromTransaction);

      // Create transaction for destination vehicle
      const toTransaction: Omit<IVehicleInventoryTransaction, 'transactionId' | 'created'> = {
        vehicleId: toVehicleId,
        materialId,
        type: TransactionType.TRANSFER,
        quantity,
        sourceId: fromVehicleId, // Source is the source of the material
        createdBy: userId
      };

      // Record destination transaction
      const destTransaction = await this.recordVehicleTransaction(toTransaction);

      return [sourceTransaction.transactionId, destTransaction.transactionId];
    } catch (error) {
      this.logger.error('Error transferring between vehicles', { 
        error, fromVehicleId, toVehicleId, materialId 
      });
      throw error;
    }
  }

  /**
   * Create a vehicle inventory check
   * 
   * @param vehicleId - Vehicle ID
   * @param userId - User ID performing the check
   * @returns Created inventory check
   */
  async createInventoryCheck(vehicleId: string, userId: string): Promise<IVehicleInventoryCheck> {
    try {
      const checkId = uuidv4();
      const now = new Date().toISOString();
      
      // Get current inventory
      const inventory = await this.getVehicleInventory(vehicleId);
      
      // Create check items
      const items = inventory.map(item => ({
        materialId: item.materialId,
        expectedQuantity: item.currentQuantity,
        actualQuantity: 0, // Will be filled in during the check
        notes: ''
      }));
      
      // Create check record
      const check: IVehicleInventoryCheck = {
        checkId,
        vehicleId,
        date: now,
        performedBy: userId,
        items,
        completed: false,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save check to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vehicleInventoryChecks,
        Item: {
          PK: `VEHICLE#${vehicleId}`,
          SK: `CHECK#${checkId}`,
          GSI1PK: `CHECK#${checkId}`,
          GSI1SK: `VEHICLE#${vehicleId}`,
          ...check
        }
      }));

      return check;
    } catch (error) {
      this.logger.error('Error creating inventory check', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Update inventory check item
   * 
   * @param checkId - Check ID
   * @param vehicleId - Vehicle ID
   * @param materialId - Material ID
   * @param actualQuantity - Actual quantity
   * @param notes - Optional notes
   * @param userId - User ID making the update
   * @returns Updated inventory check
   */
  async updateInventoryCheckItem(
    checkId: string,
    vehicleId: string,
    materialId: string,
    actualQuantity: number,
    notes: string | undefined,
    userId: string
  ): Promise<IVehicleInventoryCheck | null> {
    try {
      // Get existing check
      const check = await this.getInventoryCheck(checkId, vehicleId);
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
        TableName: config.dynamodb.tables.vehicleInventoryChecks,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
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

      return result.Attributes as IVehicleInventoryCheck;
    } catch (error) {
      this.logger.error('Error updating inventory check item', { 
        error, checkId, vehicleId, materialId 
      });
      throw error;
    }
  }

  /**
   * Complete inventory check
   * 
   * @param checkId - Check ID
   * @param vehicleId - Vehicle ID
   * @param updateInventory - Whether to update inventory levels
   * @param userId - User ID completing the check
   * @returns Completed inventory check
   */
  async completeInventoryCheck(
    checkId: string,
    vehicleId: string,
    updateInventory: boolean,
    userId: string
  ): Promise<IVehicleInventoryCheck | null> {
    try {
      // Get existing check
      const check = await this.getInventoryCheck(checkId, vehicleId);
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
          await this.updateVehicleInventoryLevel(
            vehicleId,
            item.materialId,
            item.actualQuantity,
            userId
          );
        }
      }

      // Update the check in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.vehicleInventoryChecks,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
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

      // Update last stock check date for vehicle inventory
      for (const item of check.items) {
        // Get current inventory level
        const level = await this.getVehicleInventoryLevel(vehicleId, item.materialId);
        if (level) {
          // Update last stock check date
          await this.docClient.send(new UpdateCommand({
            TableName: config.dynamodb.tables.vehicleInventory,
            Key: {
              PK: `VEHICLE#${vehicleId}`,
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

      return result.Attributes as IVehicleInventoryCheck;
    } catch (error) {
      this.logger.error('Error completing inventory check', { error, checkId, vehicleId });
      throw error;
    }
  }

  /**
   * Get inventory check
   * 
   * @param checkId - Check ID
   * @param vehicleId - Vehicle ID
   * @returns Inventory check or null if not found
   */
  async getInventoryCheck(checkId: string, vehicleId: string): Promise<IVehicleInventoryCheck | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicleInventoryChecks,
        Key: {
          PK: `VEHICLE#${vehicleId}`,
          SK: `CHECK#${checkId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IVehicleInventoryCheck;
    } catch (error) {
      this.logger.error('Error getting inventory check', { error, checkId, vehicleId });
      throw error;
    }
  }

  /**
   * Get recent inventory checks for a vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @param limit - Optional result limit
   * @returns List of inventory checks
   */
  async getRecentInventoryChecks(vehicleId: string, limit?: number): Promise<IVehicleInventoryCheck[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vehicleInventoryChecks,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `VEHICLE#${vehicleId}`,
          ':sk': 'CHECK#'
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IVehicleInventoryCheck[];
    } catch (error) {
      this.logger.error('Error getting recent inventory checks', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Create inventory template
   * 
   * @param template - Template data without ID
   * @returns Created template
   */
  async createInventoryTemplate(
    template: Omit<IVehicleInventoryTemplate, 'templateId' | 'created' | 'updated'>
  ): Promise<IVehicleInventoryTemplate> {
    try {
      const templateId = uuidv4();
      const now = new Date().toISOString();
      
      // Create template record
      const newTemplate: IVehicleInventoryTemplate = {
        templateId,
        ...template,
        created: now,
        updated: now
      };

      // Save template to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vehicleInventoryTemplates,
        Item: {
          PK: `COMPANY#${template.companyId}`,
          SK: `TEMPLATE#${templateId}`,
          GSI1PK: `TEMPLATE#${template.name}`,
          GSI1SK: `COMPANY#${template.companyId}`,
          ...newTemplate
        }
      }));

      return newTemplate;
    } catch (error) {
      this.logger.error('Error creating inventory template', { error, template });
      throw error;
    }
  }

  /**
   * Get inventory template
   * 
   * @param templateId - Template ID
   * @param companyId - Company ID
   * @returns Template or null if not found
   */
  async getInventoryTemplate(templateId: string, companyId: string): Promise<IVehicleInventoryTemplate | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicleInventoryTemplates,
        Key: {
          PK: `COMPANY#${companyId}`,
          SK: `TEMPLATE#${templateId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IVehicleInventoryTemplate;
    } catch (error) {
      this.logger.error('Error getting inventory template', { error, templateId, companyId });
      throw error;
    }
  }

  /**
   * Get all inventory templates for a company
   * 
   * @param companyId - Company ID
   * @returns List of templates
   */
  async getInventoryTemplates(companyId: string): Promise<IVehicleInventoryTemplate[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vehicleInventoryTemplates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`,
          ':sk': 'TEMPLATE#'
        }
      }));

      return (result.Items || []) as IVehicleInventoryTemplate[];
    } catch (error) {
      this.logger.error('Error getting inventory templates', { error, companyId });
      throw error;
    }
  }

  /**
   * Apply inventory template to vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @param templateId - Template ID
   * @param companyId - Company ID
   * @param userId - User ID applying the template
   * @returns Number of items updated
   */
  async applyInventoryTemplate(
    vehicleId: string,
    templateId: string,
    companyId: string,
    userId: string
  ): Promise<number> {
    try {
      // Get template
      const template = await this.getInventoryTemplate(templateId, companyId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Apply each item in the template
      let updateCount = 0;
      for (const item of template.items) {
        await this.updateVehicleInventoryLevel(
          vehicleId,
          item.materialId,
          item.standardQuantity, // Set current quantity to standard
          userId,
          item.minQuantity,
          item.standardQuantity,
          item.location
        );
        updateCount++;
      }

      return updateCount;
    } catch (error) {
      this.logger.error('Error applying inventory template', { error, vehicleId, templateId });
      throw error;
    }
  }

  /**
   * Import vehicle inventory from CSV
   * 
   * @param vehicleId - Vehicle ID
   * @param fileKey - S3 file key for the CSV
   * @param userId - User ID performing the import
   * @returns Import result
   */
  async importVehicleInventoryFromCsv(
    vehicleId: string,
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
          await this.updateVehicleInventoryLevel(
            vehicleId,
            row.materialId,
            parseFloat(row.quantity),
            userId,
            row.minQuantity ? parseFloat(row.minQuantity) : undefined,
            row.standardQuantity ? parseFloat(row.standardQuantity) : undefined,
            row.location
          );

          successRows++;
        } catch (error) {
          failedRows++;
          this.logger.error('Error processing CSV row', { 
            error, vehicleId, row, rowIndex: totalRows 
          });
        }
      }

      return { totalRows, successRows, failedRows };
    } catch (error) {
      this.logger.error('Error importing vehicle inventory from CSV', { error, vehicleId, fileKey });
      throw error;
    }
  }

  /**
   * Export vehicle inventory to CSV
   * 
   * @param vehicleId - Vehicle ID
   * @returns S3 file key for the generated CSV
   */
  async exportVehicleInventoryToCsv(vehicleId: string): Promise<string> {
    try {
      // Get vehicle details
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }

      // Get all inventory levels
      const inventory = await this.getVehicleInventory(vehicleId);
      
      // Create CSV data
      const csvData = await this.createInventoryCsv(inventory, vehicle);
      
      // Upload to S3
      const fileKey = `exports/vehicles/${vehicleId}/inventory-${new Date().toISOString()}.csv`;
      await this.uploadToS3(fileKey, csvData, 'text/csv');
      
      return fileKey;
    } catch (error) {
      this.logger.error('Error exporting vehicle inventory to CSV', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Get low stock items for a vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @returns List of low stock items
   */
  async getVehicleLowStockItems(vehicleId: string): Promise<{
    materialId: string;
    name: string;
    currentQuantity: number;
    minQuantity: number;
    standardQuantity: number;
    deficit: number;
  }[]> {
    try {
      // Get all inventory levels
      const inventory = await this.getVehicleInventory(vehicleId);
      
      // Filter for low stock items
      const lowStockItems = [];
      
      for (const item of inventory) {
        if (
          item.minQuantity !== undefined && 
          item.currentQuantity < item.minQuantity
        ) {
          // Get material name from MongoDB
          const material = await this.getMaterial(item.materialId);
          
          lowStockItems.push({
            materialId: item.materialId,
            name: material?.name || 'Unknown Material',
            currentQuantity: item.currentQuantity,
            minQuantity: item.minQuantity,
            standardQuantity: item.standardQuantity || item.minQuantity,
            deficit: item.minQuantity - item.currentQuantity
          });
        }
      }
      
      // Sort by deficit (highest first)
      return lowStockItems.sort((a, b) => b.deficit - a.deficit);
    } catch (error) {
      this.logger.error('Error getting vehicle low stock items', { error, vehicleId });
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
   * @param inventory - Vehicle inventory levels
   * @param vehicle - Vehicle details
   * @returns CSV data as string
   */
  private async createInventoryCsv(inventory: IVehicleInventoryLevel[], vehicle: IVehicle): Promise<string> {
    try {
      const rows = [];
      
      // Add header row
      rows.push([
        'materialId',
        'name',
        'category',
        'currentQuantity',
        'minQuantity',
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
          item.minQuantity || '',
          item.standardQuantity || '',
          this.escapeCsvValue(item.location || ''),
          item.lastStockCheck || ''
        ].join(','));
      }
      
      return rows.join('\n');
    } catch (error) {
      this.logger.error('Error creating inventory CSV', { error, vehicleId: vehicle.vehicleId });
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
  }