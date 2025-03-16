#!/bin/bash
# Deployment script for Clear-Desk.com API

set -e

# Default values
ENVIRONMENT="dev"
STACK_NAME="clear-desk-api"
REGION="us-east-1"
SAM_TEMPLATE_FILE="../template.yml"
OUTPUT_TEMPLATE_FILE="../template-output.yml"
S3_BUCKET=""
CERTIFICATE_ARN=""
DOMAIN_NAME="api.clear-desk.com"
FORCE_DEPLOY=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --stack)
      STACK_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --s3-bucket)
      S3_BUCKET="$2"
      shift 2
      ;;
    --cert-arn)
      CERTIFICATE_ARN="$2"
      shift 2
      ;;
    --domain)
      DOMAIN_NAME="$2"
      shift 2
      ;;
    --force)
      FORCE_DEPLOY=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate that S3 bucket is provided
if [[ -z $S3_BUCKET ]]; then
  echo "ERROR: S3 bucket name is required (--s3-bucket)"
  exit 1
fi

# Set stack name with environment if not explicitly provided
if [[ $STACK_NAME == "clear-desk-api" ]]; then
  STACK_NAME="clear-desk-$ENVIRONMENT-api"
fi

# Print deployment info
echo "------------------------------------------------------------"
echo "Deploying Clear-Desk.com API"
echo "------------------------------------------------------------"
echo "Environment: $ENVIRONMENT"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo "S3 Bucket: $S3_BUCKET"
echo "Domain Name: $DOMAIN_NAME"
echo "Certificate ARN: ${CERTIFICATE_ARN:-None (HTTP only)}"
echo "------------------------------------------------------------"

# Confirm deployment
if [[ $FORCE_DEPLOY != true ]]; then
  read -p "Do you want to continue with the deployment? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
  fi
fi

# Check if the S3 bucket exists, create it if it doesn't
if ! aws s3 ls "s3://$S3_BUCKET" >/dev/null 2>&1; then
  echo "Creating S3 bucket: $S3_BUCKET"
  aws s3 mb "s3://$S3_BUCKET" --region "$REGION"
  
  # Enable versioning on the bucket
  aws s3api put-bucket-versioning \
    --bucket "$S3_BUCKET" \
    --versioning-configuration Status=Enabled
fi

# Package the CloudFormation template
echo "Packaging CloudFormation template..."
aws cloudformation package \
  --template-file "$SAM_TEMPLATE_FILE" \
  --s3-bucket "$S3_BUCKET" \
  --s3-prefix "clear-desk-$ENVIRONMENT" \
  --output-template-file "$OUTPUT_TEMPLATE_FILE" \
  --region "$REGION"

# Deploy the CloudFormation stack
echo "Deploying CloudFormation stack: $STACK_NAME..."
DEPLOY_ARGS=(
  --template-file "$OUTPUT_TEMPLATE_FILE"
  --stack-name "$STACK_NAME"
  --region "$REGION"
  --capabilities "CAPABILITY_IAM" "CAPABILITY_AUTO_EXPAND"
  --parameter-overrides "Environment=$ENVIRONMENT"
)

# Add certificate ARN parameter if provided
if [[ -n $CERTIFICATE_ARN ]]; then
  DEPLOY_ARGS+=("CertificateArn=$CERTIFICATE_ARN")
fi

# Add domain name parameter
DEPLOY_ARGS+=("DomainName=$DOMAIN_NAME")

# Execute the deployment command
aws cloudformation deploy "${DEPLOY_ARGS[@]}"

# Get the API Gateway URL from stack outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text)

# Print the deployment result
echo "------------------------------------------------------------"
echo "Deployment completed successfully!"
echo "API URL: $API_URL"
if [[ -n $CERTIFICATE_ARN ]]; then
  echo "Custom Domain: https://$DOMAIN_NAME"
fi
echo "------------------------------------------------------------"
