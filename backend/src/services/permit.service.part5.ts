// backend/src/services/permit.service.ts - Part 5

  /**
   * Get project data by ID
   * 
   * @param projectId - Project ID
   * @returns Project data or null if not found
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
      throw error;
    }
  }

  /**
   * Get latest estimate for a project
   * 
   * @param projectId - Project ID
   * @returns Latest estimate data or null if not found
   */
  private async getLatestEstimate(projectId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.estimates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'ESTIMATE#'
        },
        ScanIndexForward: false, // Get newest first
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0];
    } catch (error) {
      this.logger.error('Error getting latest estimate', { error, projectId });
      throw error;
    }
  }

  /**
   * Get signed URL for downloading a file from S3
   * 
   * @param s3Key - S3 object key
   * @returns Signed URL
   */
  private async getSignedDownloadUrl(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      this.logger.error('Error generating signed download URL', { error, s3Key });
      throw error;
    }
  }

  /**
   * Trigger pre-construction checklist based on permit submission
   * 
   * @param projectId - Project ID
   * @param permitType - Permit type
   */
  private async triggerPreConstructionChecklist(projectId: string, permitType: PermitType): Promise<void> {
    try {
      // Get project data
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Determine the appropriate form section to trigger based on permit type
      let formSection = '';
      switch (permitType) {
        case PermitType.ELECTRICAL:
          formSection = 'electrical';
          break;
        case PermitType.MECHANICAL:
          formSection = 'mechanical';
          break;
        case PermitType.PLUMBING:
          formSection = 'plumbing';
          break;
        case PermitType.FIRE:
          formSection = 'fire';
          break;
        case PermitType.BUILDING:
          formSection = 'building';
          break;
        default:
          formSection = 'general';
      }

      // Check if pre-construction checklist is already triggered for this section
      const formResult = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.formResponses,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': `FORM#${formSection}`
        }
      }));

      if (formResult.Items && formResult.Items.length > 0) {
        // Form already exists, no need to trigger
        this.logger.info(`Pre-construction checklist for ${formSection} already exists for project ${projectId}`);
        return;
      }

      // Create form request in database
      const formId = uuidv4();
      const now = new Date().toISOString();
      
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.formResponses,
        Item: {
          PK: `FORM#${formId}`,
          SK: 'METADATA',
          GSI1PK: `PROJECT#${projectId}`,
          GSI1SK: `FORM#${formSection}`,
          formId,
          projectId,
          formType: formSection,
          status: 'pending',
          dueDate: this.calculateDueDate(now, 7), // Due in 7 days
          created: now,
          updated: now
        }
      }));

      // Send email notification
      if (project.customer && project.customer.email) {
        try {
          // Use SendGrid service to send email notification
          const emailService = new (require('../services/sendgrid.service')).SendGridService();
          
          await emailService.sendFormSubmissionNotification(
            formSection.charAt(0).toUpperCase() + formSection.slice(1),
            projectId,
            project.name || 'Your Project',
            project.customer.email,
            project.company?.name || 'Your Contractor'
          );
        } catch (emailError) {
          this.logger.error('Error sending form notification email', { emailError });
          // Continue even if email fails
        }
      }

      this.logger.info(`Triggered pre-construction checklist for ${formSection} for project ${projectId}`);
    } catch (error) {
      this.logger.error('Error triggering pre-construction checklist', { error, projectId, permitType });
      // Don't rethrow, as this is a secondary action that shouldn't affect the permit submission
    }
  }

  /**
   * Calculate due date from start date and days
   * 
   * @param startDate - Start date (ISO string)
   * @param days - Number of days
   * @returns Due date (ISO string)
   */
  private calculateDueDate(startDate: string, days: number): string {
    const date = new Date(startDate);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }
}
