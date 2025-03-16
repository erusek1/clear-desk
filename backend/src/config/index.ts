// backend/src/config/index.ts

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment validation
 */
const requiredEnvVars = [
  'NODE_ENV',
  'AWS_REGION',
  'JWT_SECRET'
];

// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Skip AWS validation if in development mode
const skipAwsValidation = process.env.SKIP_AWS_VALIDATION === 'true';

/**
 * Application configuration
 */
const config = {
  // Common
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  skipAwsValidation,

  // Auth
  auth: {
    jwtSecret: process.env.JWT_SECRET as string,
    jwtExpiration: process.env.JWT_EXPIRATION || '7d',
    hashRounds: 10
  },

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    profile: process.env.AWS_PROFILE
  },

  // DynamoDB
  dynamodb: {
    endpoint: process.env.DYNAMODB_ENDPOINT,
    tables: {
      users: process.env.USERS_TABLE || 'clear-desk-users',
      projects: process.env.PROJECTS_TABLE || 'clear-desk-projects',
      tasks: process.env.TASKS_TABLE || 'clear-desk-tasks',
      comments: process.env.COMMENTS_TABLE || 'clear-desk-comments',
      formResponses: process.env.FORM_RESPONSES_TABLE || 'clear-desk-form-responses',
      emails: process.env.EMAILS_TABLE || 'clear-desk-emails',
      files: process.env.FILES_TABLE || 'clear-desk-files',
      companies: process.env.COMPANIES_TABLE || 'clear-desk-companies',
      inventory: process.env.INVENTORY_TABLE || 'clear-desk-inventory',
      inventoryTransactions: process.env.INVENTORY_TRANSACTIONS_TABLE || 'clear-desk-inventory-transactions',
      purchaseOrders: process.env.PURCHASE_ORDERS_TABLE || 'clear-desk-purchase-orders',
      vendors: process.env.VENDORS_TABLE || 'clear-desk-vendors',
      timeTracking: process.env.TIME_TRACKING_TABLE || 'clear-desk-time-tracking',
      dailyReports: process.env.DAILY_REPORTS_TABLE || 'clear-desk-daily-reports',
      communications: process.env.COMMUNICATIONS_TABLE || 'clear-desk-communications',
      selections: process.env.SELECTIONS_TABLE || 'clear-desk-selections',
      // New tables for inspection functionality
      inspectionChecklists: process.env.INSPECTION_CHECKLISTS_TABLE || 'clear-desk-inspection-checklists',
      inspectionTemplates: process.env.INSPECTION_TEMPLATES_TABLE || 'clear-desk-inspection-templates',
      // Vehicle and employee case tables
      vehicles: process.env.VEHICLES_TABLE || 'clear-desk-vehicles',
      vehicleInventory: process.env.VEHICLE_INVENTORY_TABLE || 'clear-desk-vehicle-inventory',
      vehicleInventoryTransactions: process.env.VEHICLE_INVENTORY_TRANSACTIONS_TABLE || 'clear-desk-vehicle-inventory-transactions',
      vehicleInventoryChecks: process.env.VEHICLE_INVENTORY_CHECKS_TABLE || 'clear-desk-vehicle-inventory-checks',
      vehicleInventoryTemplates: process.env.VEHICLE_INVENTORY_TEMPLATES_TABLE || 'clear-desk-vehicle-inventory-templates',
      employeeCases: process.env.EMPLOYEE_CASES_TABLE || 'clear-desk-employee-cases',
      caseInventory: process.env.CASE_INVENTORY_TABLE || 'clear-desk-case-inventory',
      caseInventoryTransactions: process.env.CASE_INVENTORY_TRANSACTIONS_TABLE || 'clear-desk-case-inventory-transactions',
      caseInventoryChecks: process.env.CASE_INVENTORY_CHECKS_TABLE || 'clear-desk-case-inventory-checks',
      caseTemplates: process.env.CASE_TEMPLATES_TABLE || 'clear-desk-case-templates',
      // Chatbot tables
      projectKnowledgeBase: process.env.PROJECT_KNOWLEDGE_BASE_TABLE || 'clear-desk-project-knowledge-base',
      chatThreads: process.env.CHAT_THREADS_TABLE || 'clear-desk-chat-threads',
      chatMessages: process.env.CHAT_MESSAGES_TABLE || 'clear-desk-chat-messages',
      privateNotes: process.env.PRIVATE_NOTES_TABLE || 'clear-desk-private-notes'
    }
  },

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/clear-desk',
    dbName: process.env.MONGODB_DB_NAME || 'clear-desk',
    collections: {
      assemblies: 'assemblies',
      materials: 'materials',
      blueprintTemplates: 'blueprintTemplates'
    },
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // S3
  s3: {
    buckets: {
      files: process.env.FILES_BUCKET || 'clear-desk-files',
      website: process.env.WEBSITE_BUCKET || 'clear-desk-website'
    }
  },

  // SendGrid
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    senderEmail: process.env.SENDGRID_SENDER_EMAIL || 'no-reply@clear-desk.com',
    templates: {
      projectInvitation: process.env.SENDGRID_PROJECT_INVITATION_TEMPLATE || 'd-project-invitation-template',
      formSubmission: process.env.SENDGRID_FORM_SUBMISSION_TEMPLATE || 'd-form-submission-template',
      estimateApproval: process.env.SENDGRID_ESTIMATE_APPROVAL_TEMPLATE || 'd-estimate-approval-template',
      dailyReport: process.env.SENDGRID_DAILY_REPORT_TEMPLATE || 'd-daily-report-template'
    }
  },

  // Frontend URLs
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
    projectUrl: (projectId: string) => `${process.env.FRONTEND_URL || 'http://localhost:3000'}/projects/${projectId}`,
    formUrl: (formId: string) => `${process.env.FRONTEND_URL || 'http://localhost:3000'}/forms/${formId}`
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },

  // PDF Processing
  pdfProcessing: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedExtensions: ['pdf']
  },

  // Camera Integration
  cameraIntegration: {
    enabled: process.env.CAMERA_INTEGRATION_ENABLED === 'true',
    providers: {
      blink: {
        enabled: process.env.BLINK_INTEGRATION_ENABLED === 'true',
        apiKey: process.env.BLINK_API_KEY || ''
      },
      ring: {
        enabled: process.env.RING_INTEGRATION_ENABLED === 'true',
        apiKey: process.env.RING_API_KEY || ''
      }
    }
  }
};

export default config;