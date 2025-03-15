# Clear-Desk.com

A comprehensive system for electrical contractors to handle blueprint processing, estimation, inventory management, field operations, and more.

## System Overview

Clear-Desk.com is a serverless application built on AWS that provides electrical contractors with tools to streamline their workflows:

- Blueprint Processing & Estimation Engine
- Costing & Pricing System
- Material Management
- Project Management
- Field Operations
- Inspection Management
- Analytics & Reporting
- Customer Communication

## Getting Started

### Prerequisites

- Node.js 18 or higher
- AWS CLI configured with appropriate credentials
- MongoDB account/cluster
- SendGrid account for email functionality

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with required environment variables (see `.env.example`)

4. Deploy to AWS:
   ```
   npm run deploy
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with required environment variables (see `.env.example`)

4. Start the development server:
   ```
   npm run dev
   ```

## Technology Stack

### Frontend
- React with Vite
- TypeScript
- Tailwind CSS
- React Query
- React Hook Form with Zod

### Backend
- AWS Lambda
- AWS API Gateway
- AWS DynamoDB
- AWS S3
- AWS CloudFront
- MongoDB

### Deployment
- AWS SAM/CloudFormation
- GitHub Actions CI/CD

## Contributing

See the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## License

This project is proprietary software. All rights reserved.