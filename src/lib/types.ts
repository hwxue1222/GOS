export type Role = 'owner' | 'manager' | 'staff';

export type PermissionAction =
  | 'viewAssigned'
  | 'viewAll'
  | 'create'
  | 'update'
  | 'trash'
  | 'complete'
  | 'duplicate'
  | 'archive'
  | 'import'
  | 'assignTemplate';

export type PermissionModule = 'jobs' | 'tasks' | 'clients' | 'staffs';

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
  companyRegistrationNo?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  tags: string[];
  deletedAt?: string;
  createdAt: string;
};

export type PersonIdType = 'NRIC' | 'PASSPORT' | 'OTHER';

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
  createdAt: string;
  updatedAt?: string;
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

export type ClientPartyRoleType = 'DIRECTOR' | 'SHAREHOLDER';

export type ClientPartyRole = {
  id: string;
  clientId: string;
  partyId: string;
  role: ClientPartyRoleType;
  appointmentDate?: string;
  resignationDate?: string;
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
  persons: Person[];
  parties: Party[];
  externalCompanies: ExternalCompany[];
  clientPartyRoles: ClientPartyRole[];
  companyRepresentatives: CompanyRepresentative[];
  jobs: Job[];
  tasks: JobTask[];
  reservedNames?: string[];
};
