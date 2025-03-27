// backend/src/services/permit.service.ts - Part 2

  /**
   * Create permit application from estimate
   * 
   * @param applicationData - Permit application request data
   * @param userId - User ID creating the permit
   * @returns Created permit data
   */
  async createPermitApplication(
    applicationData: IPermitApplicationRequest,
    userId: string
  ): Promise<IPermit> {
    try {
      // Validate input
      if (!applicationData.projectId || !applicationData.permitType) {
        throw new Error('Missing required fields: projectId, permitType');
      }

      // Get project data
      const project = await this.getProject(applicationData.projectId);
      if (!project) {
        throw new Error(`Project ${applicationData.projectId} not found`);
      }

      // Get latest estimate for the project
      const estimate = await this.getLatestEstimate(applicationData.projectId);
      if (!estimate) {
        throw new Error(`No estimates found for project ${applicationData.projectId}`);
      }

      // Generate permit application data
      const permitId = uuidv4();
      const now = new Date().toISOString();

      // Extract electrical data from estimate if it's an electrical permit
      let electricalData = {};
      if (applicationData.permitType === PermitType.ELECTRICAL) {
        electricalData = await this.extractElectricalDataFromEstimate(estimate);
      }

      // Create permit record
      const permit: IPermit = {
        permitId,
        projectId: applicationData.projectId,
        permitType: applicationData.permitType,
        status: PermitStatus.DRAFT,
        applicationData: {
          jurisdiction: applicationData.jurisdiction || project.address?.city || '',
          propertyOwner: applicationData.propertyOwner || {
            name: project.customer?.name || '',
            address: project.address?.street || '',
            phone: project.customer?.phone || '',
            email: project.customer?.email
          },
          jobAddress: project.address?.street || '',
          jobDescription: applicationData.jobDescription || project.name || '',
          valuation: applicationData.valuation || estimate.totalCost || 0,
          contractorInfo: {
            name: project.company?.name || '',
            license: project.company?.licenses?.[0] || '',
            address: project.company?.address || '',
            phone: project.company?.phone || '',
            email: project.company?.email || ''
          },
          ...(applicationData.permitType === PermitType.ELECTRICAL && { electrical: electricalData })
        },
        fees: {
          permitFee: 0,
          planReviewFee: 0,
          inspectionFees: 0,
          totalFees: 0
        },
        inspections: {
          required: this.getRequiredInspections(applicationData.permitType)
        },
        documents: [],
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save permit to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.permits,
        Item: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA',
          GSI1PK: `PROJECT#${applicationData.projectId}`,
          GSI1SK: `PERMIT#${permitId}`,
          ...permit
        }
      }));

      // Add timeline event if timeline service is available
      if (this.timelineService) {
        await this.timelineService.addEvent({
          projectId: applicationData.projectId,
          eventType: TimelineEventType.PERMIT_SUBMITTED,
          title: `${applicationData.permitType.charAt(0).toUpperCase() + applicationData.permitType.slice(1)} Permit Application Created`,
          status: TimelineEventStatus.PENDING,
          scheduledDate: now,
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId);
      }

      return permit;
    } catch (error) {
      this.logger.error('Error creating permit application', { error, applicationData });
      throw error;
    }
  }

  /**
   * Generate PDF permit form
   * 
   * @param permitId - Permit ID
   * @param userId - User ID generating the permit
   * @returns Permit generation response
   */
  async generatePermitForm(permitId: string, userId: string): Promise<IPermitGenerationResponse> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Generate PDF based on permit type
      const pdfBuffer = await this.createPermitPdf(permit);

      // Save PDF to S3
      const fileName = `${permit.permitType}_permit_${permitId}.pdf`;
      const s3Key = `permits/${permit.projectId}/${fileName}`;
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: 'application/pdf'
      }));

      // Update permit with document reference
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set documents = list_append(if_not_exists(documents, :empty_list), :document), updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':document': [{
            s3Key,
            name: fileName,
            type: 'application',
            uploadDate: new Date().toISOString()
          }],
          ':empty_list': [],
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        }
      }));

      // Generate download URL
      const downloadUrl = await this.getSignedDownloadUrl(s3Key);

      return {
        permitId,
        fileUrl: downloadUrl,
        previewUrl: downloadUrl,
        message: 'Permit form generated successfully'
      };
    } catch (error) {
      this.logger.error('Error generating permit form', { error, permitId });
      throw error;
    }
  }
