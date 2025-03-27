// backend/src/functions/permits/generate-permit.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { PermitService } from '../../services/permit.service';
import { PermitType } from '../../types/permit.types';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import config from '../../config';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('generate-permit');
const permitService = new PermitService(docClient, s3Client);

// Input validation schema for electrical permits
const ElectricalPermitSchema = z.object({
  projectId: z.string().uuid(),
  jurisdictionName: z.string().min(1),
  formData: z.object({
    jobAddress: z.string().min(1),
    jobCity: z.string().min(1),
    jobState: z.string().min(1),
    jobZip: z.string().min(5),
    ownerName: z.string().min(1),
    ownerPhone: z.string().optional(),
    ownerEmail: z.string().email().optional(),
    contractorName: z.string().min(1),
    contractorLicense: z.string().min(1),
    contractorPhone: z.string().min(1),
    contractorEmail: z.string().email(),
    serviceSize: z.number().int().positive(),
    serviceSizeUpgrade: z.boolean().optional(),
    serviceSizePrevious: z.number().int().positive().optional(),
    phases: z.number().int().min(1).max(3),
    voltage: z.number().int().positive(),
    temporaryService: z.boolean().optional(),
    temporaryPoleRequired: z.boolean().optional(),
    receptacles: z.number().int().min(0),
    switches: z.number().int().min(0),
    lightFixtures: z.number().int().min(0),
    fanFixtures: z.number().int().min(0).optional(),
    rangeCircuits: z.number().int().min(0).optional(),
    dryerCircuits: z.number().int().min(0).optional(),
    waterHeaterCircuits: z.number().int().min(0).optional(),
    hvacCircuits: z.number().int().min(0).optional(),
    subPanels: z.number().int().min(0).optional(),
    generatorDetails: z.object({
      size: z.number().positive(),
      transferSwitch: z.boolean(),
      location: z.string().min(1)
    }).optional(),
    evChargerDetails: z.object({
      quantity: z.number().int().positive(),
      amperage: z.number().int().positive()
    }).optional(),
    solarDetails: z.object({
      size: z.number().positive(),
      inverterType: z.string().min(1),
      panels: z.number().int().positive()
    }).optional(),
    estimatedValue: z.number().positive(),
    specialConditions: z.string().optional(),
    additionalNotes: z.string().optional()
  }),
  notes: z.string().optional()
});

// Input validation schema for creating a permit from estimate
const EstimatePermitSchema = z.object({
  projectId: z.string().uuid(),
  estimateId: z.string().uuid(),
  jurisdictionName: z.string().min(1),
  additionalData: z.record(z.any()).optional(),
  notes: z.string().optional()
});

// Combined schema with discriminated union
const RequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(PermitType.ELECTRICAL),
    data: ElectricalPermitSchema
  }),
  z.object({
    type: z.literal('from_estimate'),
    data: EstimatePermitSchema
  })
]);

type RequestType = z.infer<typeof RequestSchema>;

/**
 * Lambda function to generate a permit
 * 
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Authenticate & authorize request
    const user = validateAuth(event);
    if (!user) {
      return errorResponse(401, { message: 'Unauthorized' });
    }

    // 2. Validate request body
    if (!event.body) {
      return errorResponse(400, { message: 'Missing request body' });
    }

    let requestData: RequestType;
    try {
      requestData = RequestSchema.parse(JSON.parse(event.body));
    } catch (error) {
      logger.error('Validation error', { error });
      return errorResponse(400, { message: 'Invalid request format', details: error });
    }

    // 3. Log operation start
    logger.info('Generating permit', { 
      type: requestData.type,
      userId: user.id
    });

    // 4. Generate permit based on request type
    let permit;
    
    if (requestData.type === 'from_estimate') {
      // Create permit from estimate
      const { projectId, estimateId, jurisdictionName, additionalData, notes } = requestData.data;
      
      permit = await permitService.createElectricalPermitFromEstimate(
        projectId,
        estimateId,
        jurisdictionName,
        additionalData || {},
        user.id
      );
      
      // Add notes if provided
      if (notes) {
        await permitService.updatePermit(
          permit.id,
          { notes },
          user.id
        );
      }
    } else {
      // Create permit directly
      const { projectId, jurisdictionName, formData, notes } = requestData.data;
      
      permit = await permitService.createPermit(
        projectId,
        requestData.type,
        jurisdictionName,
        formData,
        notes,
        user.id
      );
    }

    // 5. Generate PDF
    const pdfS3Key = await permitService.generatePermitPdf(permit.id, user.id);
    
    // 6. Get PDF download URL
    const pdfUrl = await permitService.getPermitPdfDownloadUrl(permit.id);
    
    // 7. Return successful response
    return successResponse(201, { 
      message: 'Permit generated successfully',
      data: {
        permit,
        pdfUrl
      }
    });
  } catch (error) {
    // 8. Handle and log errors
    logger.error('Error generating permit', { error });
    
    if (error instanceof Error) {
      // Return appropriate error response based on error type
      if (error.name === 'ResourceNotFoundException') {
        return errorResponse(404, { message: 'Project or estimate not found' });
      } else if (error.name === 'ValidationError') {
        return errorResponse(400, { message: error.message });
      } else if (error.name === 'AccessDeniedException') {
        return errorResponse(403, { message: 'Access denied' });
      }
    }
    
    // Default internal server error
    return errorResponse(500, { message: 'Internal server error' });
  }
};