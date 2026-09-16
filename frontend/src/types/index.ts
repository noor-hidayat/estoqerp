export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  active: boolean;
  avatarHue: number;
  createdAt?: string;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  createdAt?: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  menu: string;
  action: string;
}

export interface BranchAccess {
  id: string;
  roleId: string;
  entityType: "BRANCH" | "WAREHOUSE";
  entityId: string;
}

export interface Workspace {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  icon: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceAccess {
  id: string;
  roleId: string;
  workspaceId: string;
}

export interface UserSetting {
  id: string;
  userId: string;
  key: string;
  value: unknown;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface Warehouse {
  id: string;
  branchId: string;
  parentId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  picName?: string | null;
  picPhone?: string | null;
  picEmail?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface ItemGroup {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  itemGroupId: string;
  hue: number;
  uomId?: string;
  alternativeCode?: string;
  uomQty?: number;
  description?: string;
  valuationRate: string | number;
  isActive?: boolean;
  isFinishGood?: boolean;
  createdAt?: string;
}

export interface StockBalance {
  id: string;
  warehouseId: string;
  itemId: string;
  balanceDate: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
}

export type SegmentField =
  | "ITEM_CODE"
  | "ITEM_GROUP"
  | "DATE"
  | "SEQUENCE"
  | "BARCODE_ID"
  | "BATCH"
  | "CUSTOM";

export interface BarcodeSegment {
  id: string;
  field: SegmentField;
  start: number;
  end: number;
  label?: string;
  /** Wajib untuk field BATCH — menunjuk format batch yang dipakai memparse nomor batch. */
  batchFormatId?: string;
}

export interface BarcodeFormat {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  qtyPerFormat: boolean;
  uniqueBarcode?: boolean;
  segments: BarcodeSegment[];
  createdAt?: string;
  updatedAt?: string;
}

export type BatchSegmentField =
  | "DATE"
  | "SHIFT"
  | "SEQUENCE"
  | "ALTERNATIVE_CODE"
  | "CUSTOM";
export type BatchSegmentMode = "POSITION" | "DELIMITER";
export type BatchDateFormat = "YYMMDD" | "DDMMYY" | "YYYYMMDD" | "YYYY-MM-DD";

export interface BatchSegment {
  id: string;
  field: BatchSegmentField;
  mode: BatchSegmentMode;
  start?: number;
  end?: number;
  delimiter?: string;
  index?: number;
  dateFormat?: BatchDateFormat;
  label?: string;
}

export interface BatchFormat {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  segments: BatchSegment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchParseResult {
  formatId: string;
  formatName: string;
  values: Record<string, string>;
  productionDate: string | null;
  shift: string | null;
  alternativeCode: string | null;
  meta: Record<string, string>;
  matched: boolean;
}

export type OpnameMode = "COMPARE" | "SCRATCH";

export type ProjectStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "APPROVED"
  | "CANCELLED";

export type OpnameWhStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type OpnameScanStatus = "DRAFT" | "POSTED" | "CANCELED";

export interface OpnameProject {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  name: string;
  mode: OpnameMode;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  cutOffDate?: string | null;
  cutOffTime?: string | null;
  opnameDate?: string;
  createdBy?: string;
  description?: string;
}

export interface OpnameProjectListItem extends OpnameProject {
  jumlahGudang: number;
  progress: { counted: number; total: number; pct: number };
  warehouses: {
    id: string;
    warehouseId: string;
    warehouseName: string;
    status: OpnameWhStatus;
    pct?: number;
    countedLokasi?: number;
    totalLokasi?: number;
  }[];
}

export interface OpnameWarehouse {
  id: string;
  opnameId: string;
  warehouseId: string;
  status: OpnameWhStatus;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  warehouseName?: string;
  branchName?: string;
  totalLokasi?: number;
  countedLokasi?: number;
  pct?: number;
}

export interface OpnameProjectDetail {
  parent: OpnameProject;
  warehouses: OpnameWarehouse[];
  summary: {
    jumlahGudang: number;
    totalLokasi: number;
    countedLokasi: number;
    pct: number;
    status: ProjectStatus;
  };
}

export interface OpnameScan {
  id: string;
  opnameId: string;
  scannedBy?: string;
  status: OpnameScanStatus;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  barcodes?: number;
  qty?: number;
  itemCount?: number;
  warehouses?: string[];
  locations?: string[];
  lastItemId?: string | null;
  lastItemName?: string;
  lastItemUnit?: string;
}

export interface OpnameScanDetailsResponse {
  scans: OpnameScan[];
  totalBarcodes: number;
  totalQty: number;
  itemCount: number;
}

export type ScanSource = "SCANNER" | "CAMERA" | "MANUAL";

export interface OpnameScanDetail {
  id: string;
  scanId: string;
  opnameId: string;
  warehouseId: string;
  locationId?: string;
  itemId: string;
  barcode: string;
  batch?: string;
  batchId?: string;
  parsed: Record<string, string>;
  quantity: number;
  qtyMode: "AUTO" | "MANUAL";
  source: ScanSource;
  scannedAt: string;
  itemCode?: string;
  itemName?: string;
  warehouseName?: string;
  locationCode?: string;
}

export interface OpnameStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  progressByWh: Record<string, { total: number; counted: number; pct: number }>;
  variance: {
    itemId: string;
    itemCode: string;
    itemName: string;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    systemQty: number;
    countedQty: number;
    diff: number;
  }[];
}

export interface MovementType {
  id: string;
  code: string;
  name: string;
  kind: "RECEIPT" | "ISSUE" | "TRANSFER" | "OTHER" | string;
  series: string;
  builtin: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Uom {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MovementStatus = "DRAFT" | "POSTED" | "CANCELED";

export interface StockMovement {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  typeId: string;
  movementDate: string;
  status: MovementStatus;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementListRow extends StockMovement {
  typeCode?: string;
  typeName?: string;
  createdByName?: string;
  detailCount: number;
  totalQty: number;
}

export interface StockMovementDetailRow {
  id: string;
  movementId: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  fromWarehouseId?: string;
  fromWarehouseCode?: string;
  fromWarehouseName?: string;
  toWarehouseId?: string;
  toWarehouseCode?: string;
  toWarehouseName?: string;
  qty: number;
  incomingRate?: number | null;
  uomId?: string;
  uomCode?: string;
  uomName?: string;
  batchId?: string;
  batchNumber?: string;
  barcode?: string | null;
  serialNumber?: string | null;
  createdAt: string;
}

export interface ScanHistoryRow {
  id: string;
  movementId: string;
  movementDate: string;
  movementType?: string;
  movementStatus?: string;
  barcode: string;
  batchNumber?: string | null;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  serialNumber?: string | null;
  qty: number;
  createdAt: string;
}

export interface StockMovementDetailFull extends StockMovementListRow {
  details: StockMovementDetailRow[];
}

export type StockLedgerRow = {
  id: string;
  transactionId: string;
  transactionType: string;
  transactionDate: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  locationId?: string;
  locationName?: string;
  qtyIn: number;
  qtyOut: number;
  qtyBalance: number;
  valuationRate: number;
  stockValue: number;
  referenceType?: string;
  referenceId?: string;
  batchId?: string;
  batchNumber?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
};

export type BatchStatus = "ACTIVE" | "EMPTY";

export interface Batch {
  id: string;
  itemId: string;
  batchNumber: string;
  status: BatchStatus;
  productionDate?: string | null;
  expiryDate?: string | null;
  shift?: string | null;
  meta?: Record<string, string>;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockBatch {
  id: string;
  batchId: string;
  warehouseId: string;
  qty: number;
  updatedAt: string;
}

export interface StockBarcode {
  barcode: string;
  warehouseId: string;
  itemId: string;
  batchId: string | null;
  updatedAt: string;
}

export interface MovementInput {
  typeId: string;
  movementDate?: string | null;
  status: MovementStatus;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  customerId?: string | null;
  details: {
    itemId: string;
    fromWarehouseId?: string | null;
    toWarehouseId?: string | null;
    qty: number;
    uomId?: string | null;
    batchNumber?: string | null;
    incomingRate?: number | null;
  }[];
}

// ---- Supply Chain ----

export type DocStatus = "DRAFT" | "POSTED" | "CANCELED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type ReceivingStatus = "DRAFT" | "PENDING_QC" | "COMPLETED" | "CANCELED" | "POSTED";

/** Suppliers & Customers share an identical field shape. */
export interface Party {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type Supplier = Party;
export type Customer = Party;

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId?: string;
  itemId: string;
  uomId: string;
  /** Arrives as string from API; send as string or number. */
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
  deliveryDate?: string | null;
}

export interface TaxCategory {
  id: string;
  code: string;
  name: string;
  percentage: string | number;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrder {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  /** Equals the row id. */
  poNo: string | number;
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  department?: string | null;
  costCenter?: string | null;
  paymentTerms?: string | null;
  priceListId?: string | null;
  priceListName?: string | null;
  currency?: string | null;
  exchangeRate?: string | number | null;
  status: DocStatus;
  taxRate?: string | null;
  taxCategoryId?: string | null;
  taxCategoryName?: string | null;
  taxCategoryPercentage?: string | null;
  allowEditOrderDate?: boolean;
  qcRequired?: boolean;
  needApproval?: boolean;
  currentApprovalLevel?: number;
  approvalWorkflowId?: string | null;
  preparedSignature?: string | null;
  preparedSignedAt?: string | null;
  preparedBy?: string | null;
  preparedByName?: string | null;
  preparedByRole?: string | null;
  approvedSignature?: string | null;
  approvedSignedAt?: string | null;
  approvedBy?: string | null;
  approvedByRole?: string | null;
  approvedByName?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: PurchaseOrderLine[];
  /** Linked Goods Receipts (populated on detail fetch). */
  receipts?: GoodsReceipt[];
}

export interface PurchaseRequestLine {
  id: string;
  purchaseRequestId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  discount?: string | null;
  batchNumber?: string | null;
  note?: string | null;
  deliveryDate?: string | null;
}

export interface PurchaseRequest {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  prNo: string | number;
  supplierId?: string | null;
  warehouseId: string;
  requestDate: string;
  expectedDate?: string | null;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  notes?: string | null;
  department?: string | null;
  toDepartment?: string | null;
  costCenter?: string | null;
  currency?: string | null;
  exchangeRate?: string | number | null;
  status: DocStatus;
  needApproval?: boolean;
  currentApprovalLevel?: number;
  approvalWorkflowId?: string | null;
  globalDiscountPercent?: string | number | null;
  additionalCharges?: { type: string; amount: string }[] | null;
  taxRate?: string | null;
  taxCategoryId?: string | null;
  taxCategoryName?: string | null;
  taxCategoryPercentage?: string | null;
  preparedSignature?: string | null;
  preparedSignedAt?: string | null;
  preparedBy?: string | null;
  preparedByName?: string | null;
  approvedSignature?: string | null;
  approvedSignedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: PurchaseRequestLine[];
}

export interface MaterialRequestLine {
  id: string;
  materialRequestId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  discount?: string | null;
  batchNumber?: string | null;
  note?: string | null;
  deliveryDate?: string | null;
}

export interface MaterialRequest {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  mrNo: string | number;
  warehouseId: string;
  requestDate: string;
  expectedDate?: string | null;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  notes?: string | null;
  department?: string | null;
  toDepartment?: string | null;
  costCenter?: string | null;
  status: DocStatus;
  needApproval?: boolean;
  currentApprovalLevel?: number;
  approvalWorkflowId?: string | null;
  preparedSignature?: string | null;
  preparedSignedAt?: string | null;
  preparedBy?: string | null;
  preparedByName?: string | null;
  approvedSignature?: string | null;
  approvedSignedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: MaterialRequestLine[];
}

export interface SalesOrderLine {
  id: string;
  salesOrderId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface SalesOrder {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  soNo: string | number;
  customerId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: SalesOrderLine[];
}

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId?: string;
  purchaseOrderId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface GoodsReceipt {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  grNo: string | number;
  purchaseOrderId: string;
  warehouseId: string;
  receiptDate: string;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: GoodsReceiptLine[];
}

/** Receiving — tahap awal inbound (Receiving → QC → GRN → stok). Bukan Goods Receipt. */
export interface ReceivingLine {
  id: string;
  receivingId?: string;
  itemId: string;
  uomId: string;
  qty: string; // qtyReceived
  qtyAccepted?: string | null;
  qtyRejected?: string | null;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
  rejectReason?: string | null;
}

export interface Receiving {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  rcvNo: string | number;
  purchaseOrderId: string;
  warehouseId: string;
  receiptDate: string;
  notes?: string | null;
  status: ReceivingStatus;
  submittedAt?: string | null;
  submittedBy?: string | null;
  qcInspectedAt?: string | null;
  qcInspectedBy?: string | null;
  qcNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: ReceivingLine[];
}

export type QcInspectionStatus = "DRAFT" | "COMPLETED" | "CANCELED";
export interface QcParameter {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
export interface QcInspectionLineParam {
  id: string;
  parameterId: string;
  parameterCode?: string | null;
  parameterName?: string | null;
  qty: string;
  note?: string | null;
}
export interface QcInspectionLine {
  id: string;
  qcInspectionId?: string;
  receivingLineId?: string | null;
  itemId: string;
  uomId?: string | null;
  qtyReceived: string;
  qtyRejected: string;
  qtyAccepted: string;
  batchNumber?: string | null;
  rejectReason?: string | null;
  params?: QcInspectionLineParam[];
}
export interface QcInspection {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  receivingId: string;
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  warehouseId?: string | null;
  inspectionDate: string;
  status: QcInspectionStatus;
  notes?: string | null;
  qcNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: QcInspectionLine[];
}

export interface DeliveryLine {
  id: string;
  deliveryId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface Delivery {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  deliveryNo: string | number;
  salesOrderId?: string | null;
  customerId?: string | null;
  warehouseId: string;
  deliveryDate: string;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: DeliveryLine[];
}

export interface DocumentType {
  id: string;
  publicId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentSeries {
  id: string;
  publicId: string;
  documentTypeId: string;
  typeName?: string;
  name: string;
  prefix: string;
  format: string;
  padding: number;
  resetPolicy: "MONTHLY" | "YEARLY" | "NEVER" | "DAILY";
  isDefault: boolean;
  branchSpecific: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  nextNumber?: number;
  preview?: string;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  companyCode: string;
  address?: string | null;
  taxId?: string | null;
  country: string;
  baseCurrency: string;
  timezone: string;
  fiscalYear: string;
  logo?: string | null;
  updatedAt?: string;
}

export interface PriceList {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  type: "PURCHASE" | "SALES";
  supplierId?: string | null;
  supplierName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  currency: string;
  isActive: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PriceListLine {
  id: string;
  priceListId: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  uomId?: string | null;
  uomName?: string | null;
  type: "PURCHASE" | "SALES";
  supplierId?: string | null;
  supplierName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  unitPrice: string | number;
  currency: string;
  minQty: string | number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workflow {
  id: string;
  code?: string;
  name: string;
  documentType: string;
  status: "DRAFT" | "ACTIVE";
  isActive: boolean;
  isDefault: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowState {
  id: string;
  workflowId: string;
  code: string;
  name: string;
  color: string;
  type: "initial" | "intermediate" | "final" | "rejected";
  orderNo: number;
  requiresSignature?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowTransition {
  id: string;
  workflowId: string;
  code: string;
  name: string;
  fromStateId: string | null;
  toStateId: string;
  trigger: "submit" | "approve" | "reject" | "cancel" | "custom";
  allowedRoleIds: string[];
  condition?: { minAmount?: number; maxAmount?: number } | null;
  requiresComment: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type RfqStatus = "DRAFT" | "SENT" | "QUOTED" | "QUOTATION_RECEIVED" | "EVALUATION" | "AWARDED" | "PO_CREATED" | "CLOSED" | "CANCELED";
export type QuotationStatus = "DRAFT" | "SUBMITTED" | "REJECTED" | "AWARDED";

export interface RfqLine {
  id: string;
  rfqId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  note?: string | null;
}

export interface RfqSupplier {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  supplierCode?: string;
  status: string;
}

export interface SupplierQuotationLine {
  id: string;
  quotationId?: string;
  rfqLineId?: string | null;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  uomId: string;
  uomName?: string;
  qty: string;
  unitPrice?: string | null;
  discount?: string | null;
  subtotal?: string | null;
  note?: string | null;
}

export interface SupplierQuotation {
  id: string;
  _internalId?: number;
  rfqId: string;
  supplierId: string;
  supplierName?: string;
  quotationNo?: string | null;
  quotationDate: string;
  validUntil?: string | null;
  currency: string;
  notes?: string | null;
  status: QuotationStatus;
  totalAmount: string;
  deliveryLeadTime?: string | null;
  paymentTerm?: string | null;
  createdAt?: string;
  lines?: SupplierQuotationLine[];
}

export interface Rfq {
  id: string;
  publicId?: string;
  documentNo?: string | null;
  warehouseId: string;
  warehouseName?: string | null;
  purchaseRequestId?: string | null;
  purchaseRequestNo?: string | null;
  requestDate: string;
  quotationDeadline?: string | null;
  expectedDate?: string | null;
  status: RfqStatus;
  notes?: string | null;
  currency: string;
  awardedSupplierId?: string | null;
  awardedSupplierName?: string | null;
  awardedAt?: string | null;
  branchId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lines?: RfqLine[];
  suppliers?: RfqSupplier[];
  quotations?: SupplierQuotation[];
  linesCount?: number;
  suppliersCount?: number;
  quotationsCount?: number;
}


