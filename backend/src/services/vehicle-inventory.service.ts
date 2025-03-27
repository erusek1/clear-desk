// backend/src/services/vehicle-inventory.service.ts

import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';

// Type definitions
interface VehicleItem {
  id: string;
  vehicleId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  minQuantity?: number;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

interface Vehicle {
  id: string;
  companyId: string;
  name: string;
  type: string;
  licensePlate?: string;
  vin?: string;
  model?: string;
  year?: number;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

interface TransferResult {
  sourceId: string;
  targetId: string;
  materialId: string;
  quantity: number;
  sourceInventory: VehicleItem | null;
  targetInventory: VehicleItem | null;
}

/**
 * Service for managing vehicle inventory
 */
export class VehicleInventoryService {
  private logger: Logger;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('VehicleInventoryService');
  }

  /**
   * Get all vehicles for a company
   * 
   * @param companyId - Company ID
   * @returns List of vehicles
   */
  async getCompanyVehicles(companyId: string): Promise<Vehicle[]> {
    try {
      // Validate input
      if (!companyId || typeof companyId !== 'string') {
        throw new Error('Invalid company ID');
      }
      
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vehicles,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: {
          ':companyId': companyId
        }
      }));

      return result.Items as Vehicle[] || [];
    } catch (error) {
      this.logger.error('Error getting company vehicles', { error, companyId });
      throw error;
    }
  }

  /**
   * Get vehicle details
   * 
   * @param vehicleId - Vehicle ID
   * @returns Vehicle details
   */
  async getVehicle(vehicleId: string): Promise<Vehicle | null> {
    try {
      // Validate input
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicles,
        Key: { id: vehicleId }
      }));

      return result.Item as Vehicle || null;
    } catch (error) {
      this.logger.error('Error getting vehicle', { error, vehicleId });
      throw error;
    }
  }

  /**
   * Create a new vehicle
   * 
   * @param companyId - Company ID
   * @param data - Vehicle data
   * @param userId - User ID creating the vehicle
   * @returns Created vehicle
   */
  async createVehicle(
    companyId: string, 
    data: Omit<Vehicle, 'id' | 'companyId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>,
    userId: string
  ): Promise<Vehicle> {
    try {
      // Validate inputs
      if (!companyId || typeof companyId !== 'string') {
        throw new Error('Invalid company ID');
      }
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid vehicle data');
      }
      
      if (!data.name || typeof data.name !== 'string') {
        throw new Error('Vehicle name is required');
      }
      
      if (!data.type || typeof data.type !== 'string') {
        throw new Error('Vehicle type is required');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      const vehicleId = uuidv4();
      const now = new Date().toISOString();
      
      const vehicle: Vehicle = {
        id: vehicleId,
        companyId,
        name: data.name,
        type: data.type,
        licensePlate: data.licensePlate,
        vin: data.vin,
        model: data.model,
        year: data.year,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.vehicles,
        Item: vehicle
      }));

      return vehicle;
    } catch (error) {
      this.logger.error('Error creating vehicle', { error, companyId });
      throw error;
    }
  }

  /**
   * Update vehicle details
   * 
   * @param vehicleId - Vehicle ID
   * @param data - Updated vehicle data
   * @param userId - User ID updating the vehicle
   * @returns Updated vehicle
   */
  async updateVehicle(
    vehicleId: string,
    data: Partial<Omit<Vehicle, 'id' | 'companyId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>>,
    userId: string
  ): Promise<Vehicle | null> {
    try {
      // Validate inputs
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid vehicle data');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Get existing vehicle
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      
      // Create update expression and attribute values
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      
      // Add fields to update
      Object.keys(data).forEach((key) => {
        // Skip id, companyId, created, and createdBy
        if (['id', 'companyId', 'created', 'createdBy'].includes(key)) {
          return;
        }
        
        updateExpression += `, ${key} = :${key}`;
        expressionAttributeValues[`:${key}`] = data[key as keyof typeof data];
      });
      
      // Update vehicle
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.vehicles,
        Key: { id: vehicleId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      return result.Attributes as Vehicle || null;
    } catch (error) {
      this.logger.error('Error updating vehicle', { error, vehicleId });
      throw error;
    }
  }
  
  /**
   * Delete a vehicle
   * 
   * @param vehicleId - Vehicle ID
   * @returns Success status
   */
  async deleteVehicle(vehicleId: string): Promise<boolean> {
    try {
      // Validate input
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      // Get vehicle to ensure it exists
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      
      // Delete vehicle
      await this.docClient.send(new DeleteCommand({
        TableName: config.dynamodb.tables.vehicles,
        Key: { id: vehicleId }
      }));
      
      // Delete all vehicle inventory items
      const inventoryItems = await this.getVehicleInventory(vehicleId);
      for (const item of inventoryItems) {
        await this.docClient.send(new DeleteCommand({
          TableName: config.dynamodb.tables.vehicleInventory,
          Key: { id: item.id }
        }));
      }
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting vehicle', { error, vehicleId });
      throw error;
    }
  }
  
  /**
   * Get vehicle inventory
   * 
   * @param vehicleId - Vehicle ID
   * @returns List of inventory items
   */
  async getVehicleInventory(vehicleId: string): Promise<VehicleItem[]> {
    try {
      // Validate input
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        IndexName: 'VehicleIndex',
        KeyConditionExpression: 'vehicleId = :vehicleId',
        ExpressionAttributeValues: {
          ':vehicleId': vehicleId
        }
      }));

      return result.Items as VehicleItem[] || [];
    } catch (error) {
      this.logger.error('Error getting vehicle inventory', { error, vehicleId });
      throw error;
    }
  }
  
  /**
   * Get vehicle inventory item
   * 
   * @param itemId - Item ID
   * @returns Inventory item
   */
  async getVehicleInventoryItem(itemId: string): Promise<VehicleItem | null> {
    try {
      // Validate input
      if (!itemId || typeof itemId !== 'string') {
        throw new Error('Invalid item ID');
      }
      
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        Key: { id: itemId }
      }));

      return result.Item as VehicleItem || null;
    } catch (error) {
      this.logger.error('Error getting vehicle inventory item', { error, itemId });
      throw error;
    }
  }
  
  /**
   * Update vehicle inventory item
   * 
   * @param itemId - Item ID
   * @param quantity - New quantity
   * @param minQuantity - Minimum quantity threshold
   * @param userId - User ID
   * @returns Updated item
   */
  async updateVehicleInventoryItem(
    itemId: string,
    quantity: number,
    minQuantity: number | null,
    userId: string
  ): Promise<VehicleItem | null> {
    try {
      // Validate inputs
      if (!itemId || typeof itemId !== 'string') {
        throw new Error('Invalid item ID');
      }
      
      if (typeof quantity !== 'number' || quantity < 0) {
        throw new Error('Quantity must be a non-negative number');
      }
      
      if (minQuantity !== null && (typeof minQuantity !== 'number' || minQuantity < 0)) {
        throw new Error('Min quantity must be a non-negative number');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Get existing item
      const item = await this.getVehicleInventoryItem(itemId);
      if (!item) {
        throw new Error('Inventory item not found');
      }
      
      // Build update expression
      let updateExpression = 'set quantity = :quantity, updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':quantity': quantity,
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      
      // Add min quantity if provided
      if (minQuantity !== null) {
        updateExpression += ', minQuantity = :minQuantity';
        expressionAttributeValues[':minQuantity'] = minQuantity;
      }
      
      // Update item
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        Key: { id: itemId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      return result.Attributes as VehicleItem || null;
    } catch (error) {
      this.logger.error('Error updating vehicle inventory item', { error, itemId });
      throw error;
    }
  }
  
  /**
   * Add material to vehicle inventory
   * 
   * @param vehicleId - Vehicle ID
   * @param materialId - Material ID
   * @param materialName - Material name
   * @param quantity - Quantity to add
   * @param minQuantity - Minimum quantity threshold
   * @param userId - User ID
   * @returns Created or updated item
   */
  async addMaterialToVehicle(
    vehicleId: string,
    materialId: string,
    materialName: string,
    quantity: number,
    minQuantity: number | undefined,
    userId: string
  ): Promise<VehicleItem> {
    try {
      // Validate inputs
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      if (!materialId || typeof materialId !== 'string') {
        throw new Error('Invalid material ID');
      }
      
      if (!materialName || typeof materialName !== 'string') {
        throw new Error('Material name is required');
      }
      
      if (typeof quantity !== 'number' || quantity < 0) {
        throw new Error('Quantity must be a non-negative number');
      }
      
      if (minQuantity !== undefined && (typeof minQuantity !== 'number' || minQuantity < 0)) {
        throw new Error('Min quantity must be a non-negative number');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Check if vehicle exists
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      
      // Check if material already exists in vehicle inventory
      const existingItems = await this.getVehicleInventory(vehicleId);
      const existingItem = existingItems.find(item => item.materialId === materialId);
      
      if (existingItem) {
        // Update existing item
        const newQuantity = existingItem.quantity + quantity;
        return (await this.updateVehicleInventoryItem(
          existingItem.id,
          newQuantity,
          minQuantity ?? null,
          userId
        )) as VehicleItem;
      } else {
        // Create new item
        const itemId = uuidv4();
        const now = new Date().toISOString();
        
        const item: VehicleItem = {
          id: itemId,
          vehicleId,
          materialId,
          materialName,
          quantity,
          minQuantity,
          created: now,
          updated: now,
          createdBy: userId,
          updatedBy: userId
        };
        
        await this.docClient.send(new PutCommand({
          TableName: config.dynamodb.tables.vehicleInventory,
          Item: item
        }));
        
        return item;
      }
    } catch (error) {
      this.logger.error('Error adding material to vehicle', { error, vehicleId, materialId });
      throw error;
    }
  }
  
  /**
   * Remove material from vehicle inventory
   * 
   * @param itemId - Item ID
   * @param userId - User ID
   * @returns Success status
   */
  async removeMaterialFromVehicle(itemId: string, userId: string): Promise<boolean> {
    try {
      // Validate inputs
      if (!itemId || typeof itemId !== 'string') {
        throw new Error('Invalid item ID');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Check if item exists
      const item = await this.getVehicleInventoryItem(itemId);
      if (!item) {
        throw new Error('Inventory item not found');
      }
      
      // Delete item
      await this.docClient.send(new DeleteCommand({
        TableName: config.dynamodb.tables.vehicleInventory,
        Key: { id: itemId }
      }));
      
      return true;
    } catch (error) {
      this.logger.error('Error removing material from vehicle', { error, itemId });
      throw error;
    }
  }
  
  /**
   * Transfer material between vehicles
   * 
   * @param sourceVehicleId - Source vehicle ID
   * @param targetVehicleId - Target vehicle ID
   * @param materialId - Material ID
   * @param quantity - Quantity to transfer
   * @param userId - User ID
   * @returns Transfer result
   */
  async transferMaterial(
    sourceVehicleId: string,
    targetVehicleId: string,
    materialId: string,
    quantity: number,
    userId: string
  ): Promise<TransferResult> {
    try {
      // Validate inputs
      if (!sourceVehicleId || typeof sourceVehicleId !== 'string') {
        throw new Error('Invalid source vehicle ID');
      }
      
      if (!targetVehicleId || typeof targetVehicleId !== 'string') {
        throw new Error('Invalid target vehicle ID');
      }
      
      if (!materialId || typeof materialId !== 'string') {
        throw new Error('Invalid material ID');
      }
      
      if (typeof quantity !== 'number' || quantity <= 0) {
        throw new Error('Quantity must be a positive number');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Check if vehicles exist
      const sourceVehicle = await this.getVehicle(sourceVehicleId);
      if (!sourceVehicle) {
        throw new Error('Source vehicle not found');
      }
      
      const targetVehicle = await this.getVehicle(targetVehicleId);
      if (!targetVehicle) {
        throw new Error('Target vehicle not found');
      }
      
      // Get source and target inventory items
      const sourceItems = await this.getVehicleInventory(sourceVehicleId);
      const sourceItem = sourceItems.find(item => item.materialId === materialId);
      
      if (!sourceItem) {
        throw new Error('Material not found in source vehicle');
      }
      
      if (sourceItem.quantity < quantity) {
        throw new Error('Insufficient quantity in source vehicle');
      }
      
      const targetItems = await this.getVehicleInventory(targetVehicleId);
      const targetItem = targetItems.find(item => item.materialId === materialId);
      
      // Update source item
      const newSourceQuantity = sourceItem.quantity - quantity;
      let updatedSourceItem: VehicleItem | null = null;
      
      if (newSourceQuantity > 0) {
        updatedSourceItem = await this.updateVehicleInventoryItem(
          sourceItem.id,
          newSourceQuantity,
          sourceItem.minQuantity ?? null,
          userId
        );
      } else {
        // Remove source item if quantity becomes 0
        await this.removeMaterialFromVehicle(sourceItem.id, userId);
      }
      
      // Update or create target item
      let updatedTargetItem: VehicleItem | null = null;
      
      if (targetItem) {
        // Update existing target item
        const newTargetQuantity = targetItem.quantity + quantity;
        updatedTargetItem = await this.updateVehicleInventoryItem(
          targetItem.id,
          newTargetQuantity,
          targetItem.minQuantity ?? null,
          userId
        );
      } else {
        // Create new target item
        updatedTargetItem = await this.addMaterialToVehicle(
          targetVehicleId,
          materialId,
          sourceItem.materialName,
          quantity,
          sourceItem.minQuantity,
          userId
        );
      }
      
      return {
        sourceId: sourceVehicleId,
        targetId: targetVehicleId,
        materialId,
        quantity,
        sourceInventory: updatedSourceItem,
        targetInventory: updatedTargetItem
      };
    } catch (error) {
      this.logger.error('Error transferring material', { 
        error, 
        sourceVehicleId, 
        targetVehicleId, 
        materialId 
      });
      throw error;
    }
  }
  
  /**
   * Get all low stock items across vehicles
   * 
   * @param companyId - Company ID
   * @returns List of low stock items with vehicle info
   */
  async getLowStockItems(companyId: string): Promise<any[]> {
    try {
      // Validate input
      if (!companyId || typeof companyId !== 'string') {
        throw new Error('Invalid company ID');
      }
      
      // Get all company vehicles
      const vehicles = await this.getCompanyVehicles(companyId);
      
      // Get inventory for each vehicle and check for low stock
      const lowStockItems: any[] = [];
      
      for (const vehicle of vehicles) {
        const inventoryItems = await this.getVehicleInventory(vehicle.id);
        
        for (const item of inventoryItems) {
          if (item.minQuantity !== undefined && item.quantity <= item.minQuantity) {
            lowStockItems.push({
              ...item,
              vehicleName: vehicle.name,
              vehicleType: vehicle.type
            });
          }
        }
      }
      
      return lowStockItems;
    } catch (error) {
      this.logger.error('Error getting low stock items', { error, companyId });
      throw error;
    }
  }
  
  /**
   * Import vehicle inventory from CSV
   * 
   * @param vehicleId - Vehicle ID
   * @param csvData - CSV data
   * @param userId - User ID
   * @returns Import result
   */
  async importInventoryFromCsv(
    vehicleId: string,
    csvData: string,
    userId: string
  ): Promise<{ added: number; updated: number; errors: string[] }> {
    try {
      // Validate inputs
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      if (!csvData || typeof csvData !== 'string') {
        throw new Error('Invalid CSV data');
      }
      
      if (!userId || typeof userId !== 'string') {
        throw new Error('Invalid user ID');
      }
      
      // Check if vehicle exists
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      
      // Parse CSV data
      const lines = csvData.split('\n');
      const headers = lines[0].split(',').map(header => header.trim());
      
      // Validate CSV structure
      const requiredHeaders = ['materialId', 'materialName', 'quantity'];
      for (const header of requiredHeaders) {
        if (!headers.includes(header)) {
          throw new Error(`Missing required header: ${header}`);
        }
      }
      
      // Process CSV rows
      const results = {
        added: 0,
        updated: 0,
        errors: [] as string[]
      };
      
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) {
          continue; // Skip empty lines
        }
        
        try {
          const values = lines[i].split(',').map(value => value.trim());
          const row: Record<string, string> = {};
          
          // Create object from CSV row
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          
          // Validate row data
          if (!row.materialId) {
            throw new Error('Missing material ID');
          }
          
          if (!row.materialName) {
            throw new Error('Missing material name');
          }
          
          const quantity = parseInt(row.quantity, 10);
          if (isNaN(quantity) || quantity < 0) {
            throw new Error('Invalid quantity');
          }
          
          const minQuantity = row.minQuantity ? parseInt(row.minQuantity, 10) : undefined;
          if (minQuantity !== undefined && (isNaN(minQuantity) || minQuantity < 0)) {
            throw new Error('Invalid min quantity');
          }
          
          // Add or update material
          const existingItems = await this.getVehicleInventory(vehicleId);
          const existingItem = existingItems.find(item => item.materialId === row.materialId);
          
          if (existingItem) {
            // Update existing item
            await this.updateVehicleInventoryItem(
              existingItem.id,
              quantity,
              minQuantity ?? null,
              userId
            );
            results.updated++;
          } else {
            // Create new item
            await this.addMaterialToVehicle(
              vehicleId,
              row.materialId,
              row.materialName,
              quantity,
              minQuantity,
              userId
            );
            results.added++;
          }
        } catch (error) {
          results.errors.push(`Row ${i}: ${(error as Error).message}`);
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error('Error importing inventory from CSV', { error, vehicleId });
      throw error;
    }
  }
  
  /**
   * Export vehicle inventory to CSV
   * 
   * @param vehicleId - Vehicle ID
   * @returns CSV data
   */
  async exportInventoryToCsv(vehicleId: string): Promise<string> {
    try {
      // Validate input
      if (!vehicleId || typeof vehicleId !== 'string') {
        throw new Error('Invalid vehicle ID');
      }
      
      // Check if vehicle exists
      const vehicle = await this.getVehicle(vehicleId);
      if (!vehicle) {
        throw new Error('Vehicle not found');
      }
      
      // Get vehicle inventory
      const inventoryItems = await this.getVehicleInventory(vehicleId);
      
      // Generate CSV
      const headers = ['materialId', 'materialName', 'quantity', 'minQuantity'];
      let csv = headers.join(',') + '\n';
      
      for (const item of inventoryItems) {
        const row = [
          item.materialId,
          item.materialName,
          item.quantity.toString(),
          item.minQuantity !== undefined ? item.minQuantity.toString() : ''
        ];
        csv += row.join(',') + '\n';
      }
      
      return csv;
    } catch (error) {
      this.logger.error('Error exporting inventory to CSV', { error, vehicleId });
      throw error;
    }
  }
}