export type Role = 'owner' | 'manager' | 'staff';

export type PermissionAction =
  | 'viewAssigned'
  | 'viewAll'
  | 'create'
  | 'update'
  | 'markPaid'
  | 'trash'
  | 'complete'
  | 'duplicate'
  | 'archive'
  | 'import'
  | 'assignTemplate';

export type PermissionModule = 'jobs' | 'tasks' | 'clients' | 'staffs' | 'invoices';

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
  fye?: string;
  contactPerson?: string;
  address?: string;
  phone?: string;
  email?: string;
  tags: string[];
  deletedAt?: string;
  createdAt: string;
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

export type Currency = 'MYR' | 'SGD' | 'USD' | 'CNY';

export type InvoiceStatus = 'UNPAID' | 'PAID' | 'VOID';

export type InvoiceItem = {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type Invoice = {
  id: string;
  invoiceNo: string;
  clientId: string;
  jobId?: string;
  issueDate: string;
  dueDate?: string;
  currency: Currency;
  status: InvoiceStatus;
  items: InvoiceItem[];
  discount?: number;
  tax?: number;
  subtotal: number;
  total: number;
  notes?: string;
  paidAt?: string;
  deletedAt?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type Db = {
  users: User[];
  sessions: Session[];
  clients: Client[];
  jobs: Job[];
  tasks: JobTask[];
  invoices: Invoice[];
  reservedNames?: string[];
};
