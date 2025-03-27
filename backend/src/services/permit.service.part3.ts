// backend/src/services/permit.service.ts - Part 3

  /**
   * Submit permit to authority
   * 
   * @param permitId - Permit ID
   * @param submissionNotes - Optional submission notes
   * @param userId - User ID submitting the permit
   * @returns Permit submission response
   */
  async submitPermit(
    permitId: string, 
    submissionNotes?: string,
    userId?: string
  ): Promise<IPermitSubmissionResponse> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Update permit status
      const submissionDate = new Date().toISOString();
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set #status = :status, submissionDate = :submissionDate, notes = :notes, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': PermitStatus.SUBMITTED,
          ':submissionDate': submissionDate,
          ':notes': submissionNotes || permit.notes || '',
          ':updated': submissionDate,
          ':updatedBy': userId || permit.createdBy
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        throw new Error(`Failed to update permit ${permitId}`);
      }

      const updatedPermit = result.Attributes as IPermit;

      // Update timeline event
      if (this.timelineService) {
        await this.timelineService.addEvent({
          projectId: permit.projectId,
          eventType: TimelineEventType.PERMIT_SUBMITTED,
          title: `${permit.permitType.charAt(0).toUpperCase() + permit.permitType.slice(1)} Permit Submitted`,
          description: submissionNotes,
          status: TimelineEventStatus.COMPLETED,
          scheduledDate: submissionDate,
          actualDate: submissionDate,
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId || permit.createdBy);
      }

      // Trigger pre-construction checklist if applicable
      await this.triggerPreConstructionChecklist(permit.projectId, permit.permitType);

      return {
        permitId,
        status: PermitStatus.SUBMITTED,
        submissionDate,
        message: 'Permit submitted successfully'
      };
    } catch (error) {
      this.logger.error('Error submitting permit', { error, permitId });
      throw error;
    }
  }

  /**
   * Update permit status
   * 
   * @param permitId - Permit ID
   * @param status - New status
   * @param permitNumber - Optional permit number (for approved permits)
   * @param expirationDate - Optional expiration date (for approved permits)
   * @param userId - User ID updating the status
   * @returns Updated permit
   */
  async updatePermitStatus(
    permitId: string,
    status: PermitStatus,
    permitNumber?: string,
    expirationDate?: string,
    userId?: string
  ): Promise<IPermit | null> {
    try {
      // Get permit data
      const permit = await this.getPermit(permitId);
      if (!permit) {
        throw new Error(`Permit ${permitId} not found`);
      }

      // Prepare update expression
      let updateExpression = 'set #status = :status, updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeNames = {
        '#status': 'status'
      };
      const expressionAttributeValues: Record<string, any> = {
        ':status': status,
        ':updated': new Date().toISOString(),
        ':updatedBy': userId || permit.updatedBy
      };

      // Add permit number and expiration date if provided
      if (status === PermitStatus.APPROVED) {
        if (permitNumber) {
          updateExpression += ', permitNumber = :permitNumber';
          expressionAttributeValues[':permitNumber'] = permitNumber;
        }
        
        updateExpression += ', approvalDate = :approvalDate';
        expressionAttributeValues[':approvalDate'] = new Date().toISOString();
        
        if (expirationDate) {
          updateExpression += ', expirationDate = :expirationDate';
          expressionAttributeValues[':expirationDate'] = expirationDate;
        }
      }

      // Update permit status
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      const updatedPermit = result.Attributes as IPermit;

      // Update timeline event
      if (this.timelineService && status === PermitStatus.APPROVED) {
        await this.timelineService.addEvent({
          projectId: permit.projectId,
          eventType: TimelineEventType.PERMIT_APPROVED,
          title: `${permit.permitType.charAt(0).toUpperCase() + permit.permitType.slice(1)} Permit Approved`,
          description: `Permit number: ${permitNumber || 'Not assigned'}`,
          status: TimelineEventStatus.COMPLETED,
          scheduledDate: new Date().toISOString(),
          actualDate: new Date().toISOString(),
          relatedEntityType: 'permit',
          relatedEntityId: permitId,
          isPrediction: false
        }, userId || permit.updatedBy);
      }

      return updatedPermit;
    } catch (error) {
      this.logger.error('Error updating permit status', { error, permitId });
      throw error;
    }
  }

  /**
   * Get permit types
   * 
   * @returns List of permit types
   */
  getPermitTypes(): string[] {
    return Object.values(PermitType);
  }

  /**
   * Get required inspections for a permit type
   * 
   * @param permitType - Permit type
   * @returns List of required inspections
   */
  private getRequiredInspections(permitType: PermitType): string[] {
    switch (permitType) {
      case PermitType.ELECTRICAL:
        return ['Rough-In', 'Service', 'Final'];
      case PermitType.FIRE:
        return ['Rough-In', 'Final'];
      case PermitType.BUILDING:
        return ['Foundation', 'Framing', 'Final'];
      case PermitType.MECHANICAL:
        return ['Rough-In', 'Final'];
      case PermitType.PLUMBING:
        return ['Underground', 'Rough-In', 'Final'];
      default:
        return ['Final'];
    }
  }
