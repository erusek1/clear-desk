// backend/src/types/inventory.types.ts

/**
 * Inventory transaction type enum
 */
export enum TransactionType {
  PURCHASE = 'purchase',
  ALLOCATION = 'allocation',
  RETURN = 'return',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer'
}

/**
 * Purchase order status enum
 */
export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  ORDERED = 'ordered',
  RECEIVED_PARTIAL = 'received_partial',
  RECEIVED_COMPLETE = 'received_complete',
  CANCELLED = 'cancelled'
}

/**
 * Inventory level interface
 */
export interface IInventoryLevel {
  materialId: string;
  companyId: string;
  currentQuantity: number;
  location?: string;
  lowStockThreshold?: number;
  lastStockCheck?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Inventory transaction interface
 */
export interface IInventoryTransaction {
  transactionId: string;
  companyId: string;
  materialId: string;
  type: TransactionType;
  quantity: number;
  projectId?: string;
  purchaseOrderId?: string;
  receivedDate?: string;
  notes?: string;
  receipt?: {
    s3Key: string;
    vendorId: string;
    date: string;
    amount: number;
  };
  created: string;
  createdBy: string;
}

/**
 * Purchase order interface
 */
export interface IPurchaseOrder {
  purchaseOrderId: string;
  projectId: string;
  companyId: string;
  vendorId: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  deliveryMethod: string;
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  items: {
    materialId: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    receivedQuantity: number;
  }[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  notes?: string;
  attachments?: {
    s3Key: string;
    fileName: string;
    uploadDate: string;
    uploadedBy: string;
  }[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Vendor interface
 */
export interface IVendor {
  vendorId: string;
  companyId: string;
  name: string;
  status: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  contacts: {
    contactId: string;
    name: string;
    role: string;
    email: string;
    phone: string;
    isPrimary: boolean;
  }[];
  accountNumber?: string;
  preferredPaymentTerms?: string;
  notes?: string;
  portalCredentials?: {
    website: string;
    username: string;
    lastAccessed: string;
  };
  performanceMetrics?: {
    averageResponseTime: number;
    deliveryReliability: number;
    pricingCompetitiveness: number;
  };
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Material takeoff interface
 */
export interface IMaterialTakeoff {
  takeoffId: string;
  projectId: string;
  estimateId: string;
  status: string;
  version: number;
  items: {
    materialId: string;
    quantity: number;
    wasteFactor: number;
    adjustedQuantity: number;
    unitCost: number;
    totalCost: number;
    inventoryAllocated: number;
    purchaseNeeded: number;
  }[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * CSV import result interface
 */
export interface ICsvImportResult {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: {
    row: number;
    message: string;
  }[];
  importedItems: {
    materialId: string;
    name: string;
    quantity: number;
  }[];
}
