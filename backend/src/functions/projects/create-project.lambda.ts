// backend/src/functions/projects/create-project.lambda.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../../utils/logger';
import { validateAuth } from '../../utils/auth';
import { errorResponse, successResponse } from '../../utils/response';
import { ProjectService } from '../../services/project.service';
import { IProject, ProjectStatus } from '../../types/project.types';

// Initialize clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const logger = new Logger('create-project');
const projectService = new ProjectService(docClient, s3Client);

// Input validation schema
const ProjectAddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'ZIP code is required'),
  country: z.string().min(1, 'Country is required'),
  coordinates: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional()
  }).optional()
});

const ProjectCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: ProjectAddressSchema.optional()
});

const ProjectGeneralContractorSchema = z.object({
  name: z.string().min(1, 'General contractor name is required'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: ProjectAddressSchema.optional()
}).optional();

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  companyId: z.string().uuid('Company ID must be a valid UUID'),
  status: z.enum([
    'pending', 'active', 'on-hold', 'completed', 'cancelled'
  ]).default('pending'),
  address: ProjectAddressSchema,
  customer: ProjectCustomerSchema,
  generalContractor: ProjectGeneralContractorSchema,
  sqFootage: z.number().optional(),
  classification: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  members: z.array(z.any()).optional() // We'll validate members in the handler
});

type CreateProjectRequest = z.infer<typeof CreateProjectSchema>;

/**
 * Create a new project
 * 
 * @param event - API Gateway proxy event
 * @returns API Gateway proxy result
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // 1. Authenticate the request
    const user = validateAuth(event);
    if (!user) {
      return errorResponse(401, { message: 'Unauthorized' });
    }

    // 2. Validate request body
    if (!event.body) {
      return errorResponse(400, { message: 'Missing request body' });
    }

    let requestData: CreateProjectRequest;
    try {
      requestData = CreateProjectSchema.parse(JSON.parse(event.body));
    } catch (error) {
      logger.error('Validation error', { error });
      if (error instanceof z.ZodError) {
        return errorResponse(400, { 
          message: 'Invalid request format', 
          details: error.errors 
        });
      }
      return errorResponse(400, { message: 'Invalid request format' });
    }

    // 3. Ensure user is authorized to create projects for this company
    // In a real app, check if user belongs to the company or has admin privileges
    if (user.companyId !== requestData.companyId) {
      return errorResponse(403, { 
        message: 'You are not authorized to create projects for this company' 
      });
    }

    // 4. Create the project
    const projectData: Omit<IProject, 'projectId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'> = {
      name: requestData.name,
      companyId: requestData.companyId,
      status: requestData.status as ProjectStatus,
      address: requestData.address,
      customer: requestData.customer,
      generalContractor: requestData.generalContractor,
      sqFootage: requestData.sqFootage,
      classification: requestData.classification,
      startDate: requestData.startDate,
      endDate: requestData.endDate,
      tags: requestData.tags || [],
      notes: requestData.notes,
      members: requestData.members || []
    };

    // 5. Invoke the project service
    const project = await projectService.createProject(projectData, user.id);

    // 6. Return successful response
    return successResponse(201, { project });
  } catch (error) {
    // 7. Handle errors
    logger.error('Error creating project', { error });
    return errorResponse(500, { message: 'Failed to create project' });
  }
};
