export type Role = 'owner' | 'manager' | 'staff' | 'client';

export type PermissionAction =
  | 'viewAssigned'
  | 'viewAll'
  | 'create'
  | 'update'
  | 'trash'
  | 'markPaid'
  | 'complete'
  | 'duplicate'
  | 'archive'
  | 'import'
  | 'assignTemplate';

export type PermissionModule = 'jobs' | 'tasks' | 'clients' | 'staffs' | 'invoices' | 'secretary' | 'people';

export type Permissions = Partial<Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>>;

export type User = {
  id: string;
  name: string;
  email: string;
  position?: string;
  role: Role;
  permissions?: Permissions;
  passwordHash: string;
  createdAt: string;
};

export type Session = {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type Client = {
  id: string;
  code: string;
  name: string;
  fka?: string;
  companyRegistrationNo?: string;
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessActivities?: string;
  ssicPrimaryCode?: string;
  ssicSecondaryCode?: string;
  paidUpCapitalCurrency?: Currency;
  paidUpCapitalAmount?: number;
  totalShares?: number;
  incorporationDate?: string;
  registeredOfficeAddress?: string;
  entityStatus?: string;
  isStruckOff?: boolean;
  tags: string[];
  deletedAt?: string;
  createdAt: string;
};

export type Currency = 'SGD' | 'USD' | 'CNY' | 'MYR';

export type InvoiceIssuer = 'BBY_SG' | 'BYBRIDGE';

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'VOID';

export type InvoiceItem = {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type InvoiceRecipient = {
  to: string[];
  cc: string[];
};

export type InvoiceBillTo =
  | {
      type: 'CLIENT';
      clientId: string;
      companyName: string;
      address?: string;
      contactNo?: string;
      email?: string;
    }
  | {
      type: 'ONE_OFF';
      companyName: string;
      address?: string;
      contactNo?: string;
      email?: string;
    };

export type Invoice = {
  id: string;
  issuer: InvoiceIssuer;
  invoiceNo: string;
  publicToken?: string;
  billTo: InvoiceBillTo;
  jobId?: string;
  issueDate: string;
  dueDate?: string;
  creditTerm?: string;
  doNo?: string;
  paymentMethod?: string;
  currency: Currency;
  fxUsdRate?: number;
  fxCnyRate?: number;
  recipients?: InvoiceRecipient;
  items: InvoiceItem[];
  discount?: number;
  tax?: number;
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  paidAt?: string;
  paymentNote?: string;
  sentAt?: string;
  notes?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type InvoiceEmailHistoryKey =
  | { type: 'CLIENT'; clientId: string }
  | { type: 'ONE_OFF'; companyNameKey: string };

export type InvoiceEmailHistory = {
  id: string;
  key: InvoiceEmailHistoryKey;
  toEmails: string[];
  ccEmails: string[];
  createdAt: string;
  updatedAt: string;
};

export type PersonIdType = 'NRIC' | 'FIN' | 'PASSPORT' | 'IC' | 'OTHER';

export type Person = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  idType?: PersonIdType;
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
  memberSince?: string;
  lastLoginDate?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
};

export type AuditArea = 'jobs' | 'clients' | 'invoices' | 'secretary' | 'members';

export type AuditLog = {
  id: string;
  createdAt: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: Role;
  area: AuditArea;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
};

export type PartyType = 'PERSON' | 'COMPANY';

export type Party = {
  id: string;
  type: PartyType;
  displayName: string;
  personId?: string;
  clientId?: string;
  externalCompanyId?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ExternalCompany = {
  id: string;
  name: string;
  registrationNo?: string;
  jurisdiction?: string;
  address?: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ClientPartyRoleType = 'DIRECTOR' | 'SHAREHOLDER' | 'RORC' | 'SECRETARY';

export type ClientPartyRole = {
  id: string;
  clientId: string;
  partyId: string;
  role: ClientPartyRoleType;
  appointmentDate?: string;
  resignationDate?: string;
  shareClass?: string;
  shares?: number;
  fromDate?: string;
  toDate?: string;
  createdAt: string;
  updatedAt?: string;
};

export type CompanyRepresentativeScope = 'GLOBAL';

export type CompanyRepresentative = {
  id: string;
  companyPartyId: string;
  representativePersonId: string;
  scope: CompanyRepresentativeScope;
  evidenceDocumentId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt?: string;
};

export type DocumentType = 'RDR_AUTH' | 'STA' | 'BR' | 'DIR_CHG' | 'CO_UPD' | 'RORC_DECL' | 'AGM_MIN';

export type Document = {
  id: string;
  type: DocumentType;
  title: string;
  html: string;
  sha256: string;
  createdAt: string;
};

export type SignaturePacketKind = 'RDR' | 'STA' | 'BR' | 'DIR_CHG' | 'CO_UPD' | 'RORC_DECL' | 'AGM_MIN';

export type SignaturePacketStatus = 'DRAFT' | 'SIGNING' | 'SIGNED';

export type SignaturePacket = {
  id: string;
  kind: SignaturePacketKind;
  relatedType: 'RDR' | 'SHARE_TRANSFER' | 'DIRECTOR_CHANGE' | 'COMPANY_UPDATE' | 'RORC_DECLARATION' | 'ANNUAL_GENERAL_MEETING';
  relatedId: string;
  documentId: string;
  status: SignaturePacketStatus;
  createdAt: string;
  updatedAt?: string;
};

export type DirectorChangeRequestStatus =
  | 'DRAFT'
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'APPROVED'
  | 'REJECTED';

export type DirectorChangeRequest = {
  id: string;
  clientId: string;
  createdByUserId: string;
  status: DirectorChangeRequestStatus;
  effectiveDate: string;
  resignationDateYmd?: string;
  message?: string;
  useByBridgeNomineeDirector?: boolean;
  removeDirectorRoleIds: string[];
  addDirectors: Array<{
    fullName: string;
    email: string;
    idTypeLabel?: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.' | 'ID No.';
    idNo?: string;
    nationality?: string;
    dob?: string;
    address?: string;
    phone?: string;
    isByBridgeNominee?: boolean;
  }>;
  packetId: string;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  signedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type SignatureRequestStatus = 'PENDING' | 'OTP_SENT' | 'SIGNED' | 'EXPIRED' | 'REVOKED';

export type SignatureRequest = {
  id: string;
  packetId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  status: SignatureRequestStatus;
  rdrRepresentativeName?: string;
  rdrRepresentativeEmail?: string;
  otpHash?: string;
  otpExpiresAt?: string;
  otpSentAt?: string;
  signedAt?: string;
  signedIp?: string;
  signedUserAgent?: string;
  createdAt: string;
  updatedAt?: string;
};

export type RepresentativeDesignationTriggerType = 'AUTO_FOR_CHANGE_REQUEST' | 'MANUAL_MAINTENANCE';

export type RepresentativeDesignationRequestStatus = 'SIGNING' | 'EFFECTIVE' | 'REVOKED';

export type RepresentativeDesignationRequest = {
  id: string;
  triggerType: RepresentativeDesignationTriggerType;
  companyPartyId: string;
  representativePersonId?: string;
  representativeName?: string;
  representativeEmail?: string;
  packetId: string;
  status: RepresentativeDesignationRequestStatus;
  createdAt: string;
  updatedAt?: string;
};

export type ShareTransferStatus = 'SIGNING' | 'BLOCKED_REPRESENTATIVE' | 'SIGNED' | 'APPLIED';

export type ShareTransfer = {
  id: string;
  clientId: string;
  transferorPartyId: string;
  transfereePartyId: string;
  shareClass?: string;
  shares: number;
  effectiveDate: string;
  status: ShareTransferStatus;
  staPacketId: string;
  brPacketId: string;
  blockingRdrIds?: string[];
  createdAt: string;
  updatedAt?: string;
};

export type SecretaryServiceApplicationType =
  | 'SHARE_TRANSFER'
  | 'DIRECTOR_CHANGE'
  | 'TRANSFER_COMPANY_SECRETARY'
  | 'RORC_DECLARATION'
  | 'ANNUAL_GENERAL_MEETING'
  | 'CHANGE_COMPANY_NAME'
  | 'CHANGE_FINANCIAL_YEAR_END'
  | 'CHANGE_REGISTERED_OFFICE_ADDRESS'
  | 'CHANGE_BUSINESS_ACTIVITIES'
  | 'CHANGE_SECRETARY';

export type SecretaryServiceApplicationStatus =
  | 'DRAFT'
  | 'SIGNING'
  | 'PENDING_REVIEW'
  | 'PROCESSING'
  | 'NEED_MORE_INFO'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETE';

export type SecretaryServiceApplicationRow = {
  id: string;
  type: SecretaryServiceApplicationType;
  companyId: string;
  companyName: string;
  applicationDate: string;
  editDate: string;
  status: SecretaryServiceApplicationStatus;
  source:
    | { kind: 'DIRECTOR_CHANGE_REQUEST'; id: string }
    | { kind: 'SHARE_TRANSFER'; id: string }
    | { kind: 'COMPANY_UPDATE_REQUEST'; id: string }
    | { kind: 'RORC_DECLARATION_REQUEST'; id: string }
    | { kind: 'ANNUAL_GENERAL_MEETING_REQUEST'; id: string };
};

export type CompanyUpdateRequestType =
  | 'CHANGE_COMPANY_NAME'
  | 'CHANGE_FINANCIAL_YEAR_END'
  | 'CHANGE_REGISTERED_OFFICE_ADDRESS'
  | 'CHANGE_BUSINESS_ACTIVITIES'
  | 'CHANGE_SECRETARY'
  | 'TRANSFER_COMPANY_SECRETARY';

export type CompanyUpdateRequestStatus =
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'REJECTED'
  | 'COMPLETE';

export type CompanyUpdateRequest = {
  id: string;
  clientId: string;
  type: CompanyUpdateRequestType;
  status: CompanyUpdateRequestStatus;
  payload: Record<string, unknown>;
  createdByUserId: string;
  packetId: string;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  signedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type RorcDeclarationRequestStatus =
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'REJECTED'
  | 'COMPLETE';

export type RorcDeclarationRequest = {
  id: string;
  clientId: string;
  status: RorcDeclarationRequestStatus;
  effectiveDate: string;
  controllerType?: 'PERSON' | 'COMPANY';
  controllerPerson?: {
    fullName: string;
    idType?: string;
    idNo?: string;
    dateOfBirth?: string;
    email?: string;
    nationality?: string;
    phone?: string;
    address?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
  controllerCompany?: {
    companyName: string;
    registerNumber?: string;
    legalForm?: string;
    governedByLawAndJurisdiction?: string;
    registerOfCompanies?: string;
    companyAddress?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
  message?: string;
  removeRorcRoleIds: string[];
  addControllers: Array<{ fullName: string; email?: string }>;
  createdByUserId: string;
  packetId: string;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  signedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type AnnualGeneralMeetingRequestStatus =
  | 'PENDING_SIGNATURES'
  | 'PENDING_REVIEW'
  | 'NEED_MORE_INFO'
  | 'REJECTED'
  | 'COMPLETE';

export type AnnualGeneralMeetingRequest = {
  id: string;
  clientId: string;
  status: AnnualGeneralMeetingRequestStatus;
  meetingDate: string;
  meetingVenue: string;
  chairman: string;
  noticeDirector?: string;
  companyCategory?: string;
  fiscalYearReport?: string;
  useByBridgeRegisteredOfficeAddress?: boolean;
  agendaSummary?: string;
  createdByUserId: string;
  packetId: string;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  signedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type IncorporationApplicationType = 'REGISTER_COMPANY' | 'TRANSFER_COMPANY_SECRETARY';

export type IncorporationApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'NEED_MORE_INFO'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type IncorporationApplication = {
  id: string;
  type: IncorporationApplicationType;
  status: IncorporationApplicationStatus;
  title: string;
  companyId?: string;
  companyName?: string;
  payload: Record<string, unknown>;
  createdByUserId: string;
  assignedToUserId?: string;
  createdAt: string;
  updatedAt?: string;
  submittedAt?: string;
  decidedAt?: string;
  decidedByUserId?: string;
  decisionNote?: string;
};

export type IncorporationApplicationEvent = {
  id: string;
  applicationId: string;
  fromStatus?: IncorporationApplicationStatus;
  toStatus: IncorporationApplicationStatus;
  note?: string;
  actorUserId: string;
  actorName: string;
  actorRole: Role;
  createdAt: string;
};

export type IncorporationApplicationFile = {
  id: string;
  applicationId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataBase64: string;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedAt: string;
};

export type JobStatus = 'Pending' | 'Processing' | 'Complete';

export type JobRepeat = 'none' | 'monthly' | 'quarterly' | 'yearly' | '2-yearly';

export type Job = {
  id: string;
  clientId: string;
  name: string;
  label?: string;
  dueDate?: string;
  repeat: JobRepeat;
  status: JobStatus;
  completed?: boolean;
  deletedAt?: string;
  updatedAt?: string;
  recurringFromJobId?: string;
  managerUserId?: string;
  staffUserId?: string;
  createdByUserId?: string;
  createdAt: string;
};

export type TaskStatus = 'Todo' | 'Done';

export type JobTask = {
  id: string;
  jobId: string;
  seq: number;
  sortOrder: number;
  title: string;
  dueDate?: string;
  status: TaskStatus;
  assigneeUserId?: string;
  createdByUserId?: string;
  createdAt: string;
};

export type Db = {
  users: User[];
  sessions: Session[];
  clients: Client[];
  invoices: Invoice[];
  invoiceEmailHistories: InvoiceEmailHistory[];
  persons: Person[];
  parties: Party[];
  externalCompanies: ExternalCompany[];
  clientPartyRoles: ClientPartyRole[];
  companyRepresentatives: CompanyRepresentative[];
  documents: Document[];
  signaturePackets: SignaturePacket[];
  signatureRequests: SignatureRequest[];
  representativeDesignationRequests: RepresentativeDesignationRequest[];
  shareTransfers: ShareTransfer[];
  directorChangeRequests?: DirectorChangeRequest[];
  companyUpdateRequests?: CompanyUpdateRequest[];
  rorcDeclarationRequests?: RorcDeclarationRequest[];
  annualGeneralMeetingRequests?: AnnualGeneralMeetingRequest[];
  incorporationApplications?: IncorporationApplication[];
  incorporationApplicationEvents?: IncorporationApplicationEvent[];
  incorporationApplicationFiles?: IncorporationApplicationFile[];
  jobs: Job[];
  tasks: JobTask[];
  auditLogs?: AuditLog[];
  reservedNames?: string[];
  seed?: Record<string, boolean>;
};
