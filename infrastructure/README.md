# Clear-Desk.com API Infrastructure

This directory contains the AWS SAM (Serverless Application Model) template and deployment scripts for the Clear-Desk.com API infrastructure.

## Infrastructure Components

The infrastructure consists of:

- **API Gateway**: RESTful API endpoints for all project operations
- **Lambda Functions**: Serverless functions for handling API requests
- **DynamoDB Tables**: NoSQL database tables for storing project data
- **S3 Bucket**: For storing project files and documents
- **IAM Roles and Policies**: For secure access to AWS resources
- **Custom Domain**: Optional custom domain configuration

## Directory Structure

```
infrastructure/
├── README.md                  # This file
├── template.yml               # AWS SAM template
├── template-output.yml        # Generated template (after packaging)
└── scripts/
    └── deploy.sh              # Deployment script
```

## Prerequisites

Before deploying the infrastructure, ensure you have:

1. **AWS CLI** installed and configured with appropriate credentials
2. **AWS SAM CLI** installed
3. An S3 bucket for storing deployment artifacts (or the deployment script will create one)
4. (Optional) A registered domain name and SSL certificate in AWS Certificate Manager

## Deployment

To deploy the infrastructure, use the provided deployment script:

```bash
cd infrastructure/scripts
chmod +x deploy.sh
./deploy.sh --s3-bucket YOUR_DEPLOYMENT_BUCKET --env dev
```

### Deployment Options

The deployment script supports the following options:

- `--env`: Environment to deploy to (dev, staging, prod)
- `--stack`: CloudFormation stack name (defaults to clear-desk-{env}-api)
- `--region`: AWS region (defaults to us-east-1)
- `--s3-bucket`: S3 bucket for deployment artifacts (required)
- `--cert-arn`: SSL certificate ARN for custom domain (optional)
- `--domain`: Custom domain name (defaults to api.clear-desk.com)
- `--force`: Skip deployment confirmation prompt

Example with custom domain:

```bash
./deploy.sh \
  --env prod \
  --s3-bucket clear-desk-deployments \
  --region us-east-1 \
  --cert-arn arn:aws:acm:us-east-1:123456789012:certificate/abcdef12-3456-7890-abcd-ef1234567890 \
  --domain api.clear-desk.com
```

## API Endpoints

The API Gateway creates the following endpoints:

### Project Management

- **POST /projects**: Create a new project
- **GET /projects/{projectId}**: Get a project by ID
- **PUT /projects/{projectId}**: Update a project
- **DELETE /projects/{projectId}**: Delete a project
- **GET /companies/{companyId}/projects**: Get all projects for a company
- **PUT /projects/{projectId}/status**: Update project status
- **GET /projects/{projectId}/dashboard**: Get project dashboard data

### Team Management

- **POST /projects/{projectId}/members**: Add a member to a project
- **DELETE /projects/{projectId}/members/{memberId}**: Remove a member from a project

### Project Activities

- **GET /projects/{projectId}/activities**: Get project activities

### Project Comments

- **POST /projects/{projectId}/comments**: Add a comment to a project

## DynamoDB Tables

The template creates the following DynamoDB tables:

- **Projects Table**: Stores project data and activities
- **Users Table**: Stores user data and authentication info
- **Comments Table**: Stores project comments and replies

Each table uses a composite primary key (PK, SK) and includes Global Secondary Indexes (GSIs) for efficient queries.

## Security

The API Gateway is secured with a JWT authorizer. Every request must include a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

## Monitoring and Logs

All Lambda functions are configured to send logs to CloudWatch Logs. You can view logs for each function in the CloudWatch console.

## Customization

To modify the API or infrastructure:

1. Edit the `template.yml` file to add or modify resources
2. Add new Lambda functions in the `backend/src/functions` directory
3. Update the API Gateway endpoints in the template
4. Redeploy using the deployment script

## Cleanup

To delete the infrastructure, use the AWS CLI:

```bash
aws cloudformation delete-stack --stack-name clear-desk-dev-api --region us-east-1
```

## Troubleshooting

If you encounter deployment issues:

1. Check the CloudFormation events in the AWS Management Console
2. Review the Lambda function logs in CloudWatch Logs
3. Verify that the IAM roles have the necessary permissions
4. Ensure that the S3 bucket exists and is accessible
