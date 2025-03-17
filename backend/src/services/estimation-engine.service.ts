// backend/src/services/estimation-engine.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { IBlueprint, DeviceType, IExtractedDevice, IExtractedRoom } from '../types/blueprint.types';
import { IEstimate, IEstimateItem, IEstimateRoom, IEstimatePhase, EstimateStatus } from '../types/estimation.types';

/**
 * Service for generating electrical estimates from blueprint data
 */
export class EstimationEngineService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assembliesCollection: any = null;
  private materialsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('EstimationEngineService');
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
        this.assembliesCollection = db.collection(config.mongodb.collections.assemblies);
        this.materialsCollection = db.collection(config.mongodb.collections.materials);
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Generate an electrical estimate from blueprint data
   * 
   * @param projectId - Project ID
   * @param blueprintId - Blueprint ID
   * @param companyId - Company ID
   * @param userId - User ID generating the estimate
   * @returns Generated estimate
   */
  async generateEstimate(
    projectId: string,
    blueprintId: string,
    companyId: string,
    userId: string
  ): Promise<IEstimate> {
    try {
      // Get blueprint data
      const blueprint = await this.getBlueprint(projectId, blueprintId);
      if (!blueprint) {
        throw new Error('Blueprint not found');
      }

      // Get company settings for pricing
      const company = await this.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      // Create new estimate
      const estimateId = uuidv4();
      const now = new Date().toISOString();
      
      // Convert blueprint rooms to estimate rooms
      const { rooms, phases } = await this.processRoomsAndDevices(blueprint.rooms, company);
      
      // Calculate totals
      const totalLaborHours = phases.reduce((sum, phase) => sum + phase.laborHours, 0);
      const totalMaterialCost = phases.reduce((sum, phase) => sum + phase.materialCost, 0);
      const totalLaborCost = totalLaborHours * company.hourlyRate;
      const subtotal = totalMaterialCost + totalLaborCost;
      const overheadAmount = subtotal * (company.overheadPercentage / 100);
      const profitAmount = (subtotal + overheadAmount) * (company.profitPercentage / 100);
      const totalCost = subtotal + overheadAmount + profitAmount;
      
      // Create estimate object
      const estimate: IEstimate = {
        estimateId,
        projectId,
        blueprintId,
        companyId,
        status: EstimateStatus.DRAFT,
        version: 1,
        customerName: company.customerName || '',
        jobName: blueprint.jobName,
        jobAddress: blueprint.jobAddress,
        jobNumber: blueprint.jobNumber,
        classificationCode: blueprint.classificationCode,
        squareFootage: blueprint.squareFootage,
        rooms,
        phases,
        financials: {
          laborRate: company.hourlyRate,
          totalLaborHours,
          totalLaborCost,
          totalMaterialCost,
          subtotal,
          overheadPercentage: company.overheadPercentage,
          overheadAmount,
          profitPercentage: company.profitPercentage,
          profitAmount,
          totalCost
        },
        notes: `Auto-generated from blueprint on ${new Date().toLocaleDateString()}`,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save estimate to DynamoDB
      await this.saveEstimate(estimate);

      return estimate;
    } catch (error) {
      this.logger.error('Error generating estimate', { error, projectId, blueprintId });
      throw error;
    }
  }
  /**
   * Process rooms and devices to generate estimate rooms and phases
   * 
   * @param blueprintRooms - Rooms extracted from blueprint
   * @param company - Company settings
   * @returns Estimate rooms and phases
   */
  private async processRoomsAndDevices(
    blueprintRooms: IExtractedRoom[],
    company: any
  ): Promise<{
    rooms: IEstimateRoom[];
    phases: IEstimatePhase[];
  }> {
    try {
      // Initialize phases
      const phases: Record<string, IEstimatePhase> = {
        rough: {
          phaseId: uuidv4(),
          name: 'Rough',
          description: 'Rough-in phase including boxes, wiring, and general preparation',
          laborHours: 0,
          materialCost: 0,
          totalCost: 0
        },
        trim: {
          phaseId: uuidv4(),
          name: 'Trim',
          description: 'Trim phase including devices, fixtures, and finishes',
          laborHours: 0,
          materialCost: 0,
          totalCost: 0
        },
        service: {
          phaseId: uuidv4(),
          name: 'Service',
          description: 'Service phase including panel, service entrance, and grounding',
          laborHours: 0,
          materialCost: 0,
          totalCost: 0
        }
      };
      
      // Process each room and its devices
      const estimateRooms: IEstimateRoom[] = [];
      
      for (const room of blueprintRooms) {
        const items: IEstimateItem[] = [];
        
        // Process each device in the room
        for (const device of room.devices) {
          // Get appropriate assembly for this device
          const assembly = await this.getAssemblyForDevice(device.type);
          if (!assembly) {
            this.logger.warn('No assembly found for device type', { deviceType: device.type });
            continue;
          }
          
          // Calculate costs for this device
          const laborHours = (assembly.laborMinutes / 60) * device.count;
          const materialCost = await this.calculateMaterialCost(assembly, device.count);
          
          // Create estimate item
          const item: IEstimateItem = {
            itemId: uuidv4(),
            assemblyId: assembly._id,
            assemblyCode: assembly.code,
            assemblyName: assembly.name,
            deviceType: device.type,
            quantity: device.count,
            laborHours,
            materialCost,
            totalCost: laborHours * company.hourlyRate + materialCost,
            phase: assembly.phase,
            notes: device.notes || ''
          };
          
          items.push(item);
          
          // Add to phase totals
          if (phases[assembly.phase]) {
            phases[assembly.phase].laborHours += laborHours;
            phases[assembly.phase].materialCost += materialCost;
            phases[assembly.phase].totalCost += item.totalCost;
          }
        }
        
        // Create estimate room
        const estimateRoom: IEstimateRoom = {
          roomId: room.roomId,
          name: room.name,
          floor: room.floor,
          items
        };
        
        estimateRooms.push(estimateRoom);
      }
      
      // Add service panel as a separate item
      const servicePanel = await this.addServicePanel(company);
      if (servicePanel) {
        // Create a "Electrical" room if it doesn't exist
        let electricalRoom = estimateRooms.find(r => r.name === 'Electrical Service');
        if (!electricalRoom) {
          electricalRoom = {
            roomId: uuidv4(),
            name: 'Electrical Service',
            floor: 1,
            items: []
          };
          estimateRooms.push(electricalRoom);
        }
        
        electricalRoom.items.push(servicePanel);
        
        // Add to service phase
        phases.service.laborHours += servicePanel.laborHours;
        phases.service.materialCost += servicePanel.materialCost;
        phases.service.totalCost += servicePanel.totalCost;
      }
      
      return {
        rooms: estimateRooms,
        phases: Object.values(phases)
      };
    } catch (error) {
      this.logger.error('Error processing rooms and devices', { error });
      throw error;
    }
  }

  /**
   * Get appropriate assembly for a device type
   * 
   * @param deviceType - Device type
   * @returns Assembly or null if not found
   */
  private async getAssemblyForDevice(deviceType: DeviceType): Promise<any | null> {
    try {
      await this.initMongo();
      
      // Map device type to assembly key
      const deviceToAssemblyMap: Record<DeviceType, string> = {
        [DeviceType.RECEPTACLE]: 'REC-STD',
        [DeviceType.GFCI_RECEPTACLE]: 'REC-GFCI',
        [DeviceType.WEATHER_RESISTANT_RECEPTACLE]: 'REC-WR',
        [DeviceType.FLOOR_RECEPTACLE]: 'REC-FLR',
        
        [DeviceType.SWITCH]: 'SW-SNGL',
        [DeviceType.DIMMER_SWITCH]: 'SW-DIM',
        [DeviceType.THREE_WAY_SWITCH]: 'SW-3WAY',
        [DeviceType.FOUR_WAY_SWITCH]: 'SW-4WAY',
        
        [DeviceType.CEILING_LIGHT]: 'LT-CEIL',
        [DeviceType.RECESSED_LIGHT]: 'LT-REC',
        [DeviceType.PENDANT_LIGHT]: 'LT-PEND',
        [DeviceType.TRACK_LIGHT]: 'LT-TRACK',
        [DeviceType.UNDER_CABINET_LIGHT]: 'LT-UC',
        
        [DeviceType.SMOKE_DETECTOR]: 'SD-STD',
        [DeviceType.CO_DETECTOR]: 'CO-STD',
        [DeviceType.THERMOSTAT]: 'THERM-STD',
        [DeviceType.DOORBELL]: 'DB-STD',
        [DeviceType.FAN]: 'FAN-STD',
        
        [DeviceType.CUSTOM]: 'MISC-STD'
      };
      
      const assemblyCode = deviceToAssemblyMap[deviceType] || 'MISC-STD';
      
      // Query for assembly
      const assembly = await this.assembliesCollection.findOne({ code: assemblyCode });
      
      if (!assembly) {
        // Fallback to default assembly if specific one not found
        return await this.assembliesCollection.findOne({ code: 'MISC-STD' });
      }
      
      return assembly;
    } catch (error) {
      this.logger.error('Error getting assembly for device', { error, deviceType });
      return null;
    }
  }

  /**
   * Calculate material cost for an assembly
   * 
   * @param assembly - Assembly
   * @param quantity - Quantity
   * @returns Material cost
   */
  private async calculateMaterialCost(assembly: any, quantity: number): Promise<number> {
    try {
      await this.initMongo();
      
      let totalCost = 0;
      
      // If assembly has materials array, calculate cost based on materials
      if (assembly.materials && Array.isArray(assembly.materials)) {
        for (const material of assembly.materials) {
          // Get material cost
          const materialDoc = await this.materialsCollection.findOne({ _id: material.materialId });
          if (materialDoc) {
            const materialCost = materialDoc.currentCost || 0;
            totalCost += materialCost * material.quantity * quantity;
          }
        }
      } else {
        // If no materials defined, use default cost
        totalCost = (assembly.defaultMaterialCost || 0) * quantity;
      }
      
      return totalCost;
    } catch (error) {
      this.logger.error('Error calculating material cost', { error, assembly, quantity });
      return 0;
    }
  }
  /**
   * Add service panel to estimate
   * 
   * @param company - Company settings
   * @returns Service panel estimate item
   */
  private async addServicePanel(company: any): Promise<IEstimateItem | null> {
    try {
      await this.initMongo();
      
      // Get service panel assembly
      const assembly = await this.assembliesCollection.findOne({ code: 'SVC-PNL' });
      if (!assembly) {
        return null;
      }
      
      // Calculate costs
      const laborHours = assembly.laborMinutes / 60;
      const materialCost = await this.calculateMaterialCost(assembly, 1);
      
      // Create estimate item
      const item: IEstimateItem = {
        itemId: uuidv4(),
        assemblyId: assembly._id,
        assemblyCode: assembly.code,
        assemblyName: assembly.name,
        deviceType: DeviceType.CUSTOM,
        quantity: 1,
        laborHours,
        materialCost,
        totalCost: laborHours * company.hourlyRate + materialCost,
        phase: 'service',
        notes: 'Main service panel'
      };
      
      return item;
    } catch (error) {
      this.logger.error('Error adding service panel', { error });
      return null;
    }
  }

  /**
   * Get blueprint by ID
   * 
   * @param projectId - Project ID
   * @param blueprintId - Blueprint ID
   * @returns Blueprint or null if not found
   */
  private async getBlueprint(projectId: string, blueprintId: string): Promise<IBlueprint | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.blueprints,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `BLUEPRINT#${blueprintId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IBlueprint;
    } catch (error) {
      this.logger.error('Error getting blueprint', { error, projectId, blueprintId });
      throw error;
    }
  }

  /**
   * Get company by ID
   * 
   * @param companyId - Company ID
   * @returns Company or null if not found
   */
  private async getCompany(companyId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.companies,
        Key: {
          PK: `COMPANY#${companyId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      // Add default values if not set
      return {
        ...result.Item,
        hourlyRate: result.Item.hourlyRate || 85,
        overheadPercentage: result.Item.overheadPercentage || 15,
        profitPercentage: result.Item.profitPercentage || 10
      };
    } catch (error) {
      this.logger.error('Error getting company', { error, companyId });
      throw error;
    }
  }

  /**
   * Save estimate to DynamoDB
   * 
   * @param estimate - Estimate data
   */
  private async saveEstimate(estimate: IEstimate): Promise<void> {
    try {
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.estimates,
        Item: {
          PK: `PROJECT#${estimate.projectId}`,
          SK: `ESTIMATE#${estimate.estimateId}`,
          GSI1PK: `ESTIMATE#${estimate.estimateId}`,
          GSI1SK: `PROJECT#${estimate.projectId}`,
          ...estimate
        }
      }));
    } catch (error) {
      this.logger.error('Error saving estimate', { error, estimate });
      throw error;
    }
  }

  /**
   * Update project estimate status
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param status - Estimate status
   * @param userId - User ID making the update
   */
  async updateEstimateStatus(
    projectId: string,
    estimateId: string,
    status: EstimateStatus,
    userId: string
  ): Promise<IEstimate | null> {
    try {
      // Update estimate status
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
          ':status': status,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IEstimate;
    } catch (error) {
      this.logger.error('Error updating estimate status', { error, projectId, estimateId, status });
      throw error;
    }
  }
}