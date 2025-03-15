// backend/src/types/blueprint.types.ts

/**
 * Blueprint template for extracting information from PDF blueprints
 */
export interface IBlueprintTemplate {
  _id: string;
  name: string;
  description: string;
  patterns: ITemplatePattern[];
  sampleFiles: string[];
  confidence: number;
  created: Date;
  updated: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Pattern for extracting specific information from a blueprint
 */
export interface ITemplatePattern {
  dataType: string;          // Type of data to extract (e.g., "jobName", "address")
  patternType: string;       // Pattern type (e.g., "regex", "coordinates", "keyword")
  pattern: string;           // Pattern definition (regex, coordinates, etc.)
  examples: string[];        // Example matches
  confidence: number;        // Confidence level (0-1)
}

/**
 * Room and device information extracted from a blueprint
 */
export interface IRoomDevice {
  name: string;              // Room name
  floor: number;             // Floor number
  devices: IDevice[];        // Devices in the room
}

/**
 * Device information extracted from a blueprint
 */
export interface IDevice {
  type: string;              // Device type (e.g., "receptacle", "switch", "light")
  count: number;             // Number of devices
  assembly: string;          // Reference to assembly code in MongoDB
}

/**
 * Blueprint information extracted from a PDF
 */
export interface IProjectBlueprint {
  jobInfo: {
    name: string;            // Project name
    address: string;         // Project address
    classificationCode: string;  // Construction classification code
    squareFootage: number;   // Square footage
    extractionConfidence: number; // Confidence in extraction (0-1)
  };
  rooms: IRoomDevice[];      // Rooms and devices
  estimation: {
    totalLaborHours: number; // Total estimated labor hours
    totalMaterialCost: number; // Total material cost
    totalCost: number;       // Total estimated cost
    phases: {
      name: string;          // Phase name (e.g., "rough", "finish")
      laborHours: number;    // Estimated labor hours
      materialCost: number;  // Material cost
      totalCost: number;     // Total phase cost
    }[];
  };
  extractionDate: string;    // Date of extraction
  status: string;            // Status of extraction
  templateUsed: string | null; // Template ID used for extraction
  confidence: number;        // Overall confidence in extraction
}

/**
 * Assembly definition from MongoDB
 */
export interface IAssembly {
  _id: string;
  code: string;              // Unique assembly code
  abbreviation: string;      // Short code for takeoffs (e.g., "hh")
  name: string;              // Assembly name
  description: string;       // Detailed description
  category: string;          // Category (e.g., "Receptacles", "Lighting")
  phase: string;             // Project phase (e.g., "Rough", "Finish")
  laborMinutes: number;      // Estimated labor minutes
  materials: {
    materialId: string;      // Reference to Materials collection
    quantity: number;        // Quantity needed
    wasteFactor: number;     // Override of material waste factor
    cost: number;            // Unit cost
  }[];
  laborFactors: {
    commercial: number;      // Factor for commercial projects
    multistory: number;      // Factor for multi-story buildings
    renovation: number;      // Factor for renovation projects
  };
  notes?: string;            // Additional notes
  created: Date;             // Creation timestamp
  updated: Date;             // Last update timestamp
  createdBy?: string;        // User who created the record
  updatedBy?: string;        // User who last updated the record
}

/**
 * Material definition from MongoDB
 */
export interface IMaterial {
  _id: string;
  sku: string;               // Unique SKU code
  name: string;              // Material name
  description: string;       // Detailed description
  category: string;          // Category (e.g., "Electrical", "Wiring")
  subcategory: string;       // Subcategory (e.g., "Outlets", "Switches")
  manufacturer: string;      // Manufacturer name
  unitOfMeasure: string;     // Unit of measure (e.g., "Each", "Foot")
  costHistory: {
    vendor: string;          // Vendor name
    cost: number;            // Cost per unit
    date: Date;              // Date of pricing
    sourceDocument: string;  // Reference to receipt/quote in S3
  }[];
  currentCost: number;       // Current standard cost
  wasteFactor: number;       // Default waste factor (e.g., 1.1 for 10% waste)
  attributes: Record<string, any>; // Material-specific attributes
  created: Date;             // Creation timestamp
  updated: Date;             // Last update timestamp
  createdBy?: string;        // User who created the record
  updatedBy?: string;        // User who last updated the record
}