// backend/src/services/permit.service.ts - Part 4

  /**
   * Extract electrical data from estimate
   * 
   * @param estimate - Project estimate
   * @returns Electrical permit data
   */
  private async extractElectricalDataFromEstimate(estimate: any): Promise<any> {
    try {
      await this.initMongo();

      // Initialize counters
      const electricalData = {
        serviceSize: 200, // Default value
        serviceType: 'Permanent', // Default value
        voltageType: '120/240V', // Default value
        phase: 'Single-phase', // Default value
        newCircuits: 0,
        outlets: 0,
        switches: 0,
        fixtures: 0,
        appliances: 0,
        hvacUnits: 0
      };

      // Get list of all assemblies used in estimate
      const assemblyIds: string[] = [];
      if (estimate.rooms && Array.isArray(estimate.rooms)) {
        for (const room of estimate.rooms) {
          if (room.items && Array.isArray(room.items)) {
            for (const item of room.items) {
              if (item.assemblyId) {
                assemblyIds.push(item.assemblyId);
              }
            }
          }
        }
      }

      // Get unique assembly IDs
      const uniqueAssemblyIds = [...new Set(assemblyIds)];

      // Get assembly data from MongoDB
      const assemblies = await this.assembliesCollection.find({
        _id: { $in: uniqueAssemblyIds }
      }).toArray();

      // Get permit mappings from MongoDB
      const permitMappings = await this.permitMappingsCollection.find({
        assemblyId: { $in: uniqueAssemblyIds },
        permitType: PermitType.ELECTRICAL
      }).toArray();

      // Create a mapping of assembly IDs to their permit field mappings
      const assemblyPermitMappings: Record<string, IPermitAssemblyMapping> = {};
      for (const mapping of permitMappings) {
        assemblyPermitMappings[mapping.assemblyId] = mapping;
      }

      // Count items by permit field mapping
      if (estimate.rooms && Array.isArray(estimate.rooms)) {
        for (const room of estimate.rooms) {
          if (room.items && Array.isArray(room.items)) {
            for (const item of room.items) {
              if (item.assemblyId && assemblyPermitMappings[item.assemblyId]) {
                const mapping = assemblyPermitMappings[item.assemblyId];
                const field = mapping.permitFieldMapping;
                const quantity = (item.quantity || 1) * (mapping.countFactor || 1);
                
                if (field && field in electricalData) {
                  // @ts-ignore - dynamically accessing property
                  electricalData[field] += quantity;
                }
                
                // Count circuits based on certain assembly types
                if (field === 'outlets' || field === 'fixtures' || field === 'appliances') {
                  // Every 8 devices count as a new circuit (simplified estimate)
                  electricalData.newCircuits += Math.ceil(quantity / 8);
                }
              }
            }
          }
        }
      }

      // Look for specific service information in the estimate
      if (estimate.selections) {
        // Extract service size
        if (estimate.selections.electrical?.serviceSize) {
          electricalData.serviceSize = parseInt(estimate.selections.electrical.serviceSize, 10) || 200;
        }
        
        // Extract service type
        if (estimate.selections.electrical?.serviceType) {
          electricalData.serviceType = estimate.selections.electrical.serviceType;
        }
        
        // Extract voltage type
        if (estimate.selections.electrical?.voltageType) {
          electricalData.voltageType = estimate.selections.electrical.voltageType;
        }
        
        // Extract phase
        if (estimate.selections.electrical?.phase) {
          electricalData.phase = estimate.selections.electrical.phase;
        }
      }

      return electricalData;
    } catch (error) {
      this.logger.error('Error extracting electrical data from estimate', { error });
      // Return default values if there's an error
      return {
        serviceSize: 200,
        serviceType: 'Permanent',
        voltageType: '120/240V',
        phase: 'Single-phase',
        newCircuits: 20,
        outlets: 40,
        switches: 20,
        fixtures: 30,
        appliances: 5,
        hvacUnits: 1
      };
    }
  }

  /**
   * Create permit PDF
   * 
   * @param permit - Permit data
   * @returns PDF buffer
   */
  private async createPermitPdf(permit: IPermit): Promise<Buffer> {
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add a page
      const page = pdfDoc.addPage([612, 792]); // Letter size
      
      // Load the standard font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Set font size
      const fontSize = 10;
      const titleFontSize = 16;
      const subtitleFontSize = 12;
      
      // Get page dimensions
      const { width, height } = page.getSize();
      
      // Set margins
      const margin = 50;
      
      // Draw title
      page.drawText(`${permit.permitType.toUpperCase()} PERMIT APPLICATION`, {
        x: width / 2 - boldFont.widthOfTextAtSize(`${permit.permitType.toUpperCase()} PERMIT APPLICATION`, titleFontSize) / 2,
        y: height - margin,
        size: titleFontSize,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      
      // Draw jurisdiction
      page.drawText(`JURISDICTION: ${permit.applicationData.jurisdiction}`, {
        x: width / 2 - font.widthOfTextAtSize(`JURISDICTION: ${permit.applicationData.jurisdiction}`, subtitleFontSize) / 2,
        y: height - margin - 25,
        size: subtitleFontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      
      // Draw status
      page.drawText(`STATUS: ${permit.status.toUpperCase()}`, {
        x: width - margin - font.widthOfTextAtSize(`STATUS: ${permit.status.toUpperCase()}`, subtitleFontSize),
        y: height - margin - 45,
        size: subtitleFontSize,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      
      // Draw permit ID
      page.drawText(`PERMIT ID: ${permit.permitId}`, {
        x: margin,
        y: height - margin - 45,
        size: subtitleFontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      
      // Draw horizontal line
      page.drawLine({
        start: { x: margin, y: height - margin - 60 },
        end: { x: width - margin, y: height - margin - 60 },
        thickness: 1,
        color: rgb(0, 0, 0)
      });
      
      // Export PDF as buffer
      return Buffer.from(await pdfDoc.save());
    } catch (error) {
      this.logger.error('Error creating permit PDF', { error });
      throw error;
    }
  }
