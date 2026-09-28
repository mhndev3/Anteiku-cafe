/**
 * Conceptual domain model for the platform.
 *
 * These types are a CONTRACT, not a database schema. They exist so
 * later agents implementing the API, database layer and UI agree on
 * shape and naming before an ORM schema (e.g. Prisma) is written.
 *
 * Do not import a database client here. This file must stay free of
 * runtime/storage concerns — see docs/PROJECT_SPEC.md section 6
 * (Data Model) and docs/ARCHITECTURE.md for the reasoning and the
 * full field-by-field documentation.
 */

// ---------------------------------------------------------------------------
// Enums / unions
// ---------------------------------------------------------------------------

export type UserRole = "CUSTOMER" | "DEVELOPER" | "ADMIN";

export type ProjectStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CONTACTING_CUSTOMER"
  | "REQUIREMENTS_DEFINED"
  | "PROPOSAL_SENT"
  | "AWAITING_APPROVAL"
  | "AWAITING_DEPOSIT"
  | "ACTIVE"
  | "MILESTONE_REVIEW"
  | "FINAL_REVIEW"
  | "AWAITING_FINAL_PAYMENT"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";

export type PaymentType = "DEPOSIT" | "FINAL";

export type PaymentStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED" | "REFUNDED";

export type FileCategory =
  | "PROJECT_ATTACHMENT"
  | "PAYMENT_RECEIPT"
  | "MILESTONE_FILE"
  | "FINAL_SOURCE";

export type MilestoneStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  role: UserRole;
  /**
   * Set once the user completes email verification (see
   * docs/AUTHENTICATION_FLOW.md §3–4). null until then. The backend's
   * password hash is intentionally NOT part of this contract — it
   * never needs to reach the frontend.
   */
  emailVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  userId: User["id"];
  fullName: string;
  phone?: string;
  company?: string;
  avatarFileId?: FileAsset["id"];
}

// ---------------------------------------------------------------------------
// Service catalog / dynamic questions
// ---------------------------------------------------------------------------

export interface Service {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
}

export type ServiceQuestionType =
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "BOOLEAN";

export interface ServiceQuestion {
  id: string;
  serviceId: Service["id"];
  order: number;
  label: string;
  type: ServiceQuestionType;
  options?: string[]; // used by SINGLE_SELECT / MULTI_SELECT
  required: boolean;
}

// ---------------------------------------------------------------------------
// Project request
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  ownerId: User["id"];
  serviceId: Service["id"];
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAnswer {
  id: string;
  projectId: Project["id"];
  questionId: ServiceQuestion["id"];
  value: string; // serialized answer (string, number, boolean, or JSON array for MULTI_SELECT)
}

export interface ProjectRequirement {
  id: string;
  projectId: Project["id"];
  summary: string;
  details?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  createdBy: User["id"];
  createdAt: string;
}

export interface DesignPreference {
  id: string;
  projectId: Project["id"];
  presetSlug?: string; // e.g. "minimal", "cinematic", "custom"
  customDescription?: string;
  referenceUrls?: string[];
}

// ---------------------------------------------------------------------------
// Proposal / scope
// ---------------------------------------------------------------------------

export interface Proposal {
  id: string;
  projectId: Project["id"];
  price: number;
  currency: string;
  timelineDays: number;
  scopeSummary: string;
  depositPercentage: number; // 20–45 per product principles
  createdBy: User["id"];
  createdAt: string;
  approvedAt?: string;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface Milestone {
  id: string;
  projectId: Project["id"];
  title: string;
  description?: string;
  order: number;
  status: MilestoneStatus;
  dueDate?: string;
}

export interface MilestoneReview {
  id: string;
  milestoneId: Milestone["id"];
  reviewedBy: User["id"];
  approved: boolean;
  comment?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Payments — server is always the source of truth for amount/status.
// ---------------------------------------------------------------------------

export interface Payment {
  id: string;
  projectId: Project["id"];
  type: PaymentType;
  amount: number;
  currency: string;
  method: "BANK_TRANSFER" | "GATEWAY"; // GATEWAY reserved for future integration
  status: PaymentStatus;
  receiptFileId?: FileAsset["id"];
  verifiedAt?: string;
  verifiedBy?: User["id"];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Files — see docs/PROJECT_SPEC.md section 8 for the StorageService
// abstraction. FINAL_SOURCE files must never be publicly addressable.
// ---------------------------------------------------------------------------

export interface FileAsset {
  id: string;
  projectId?: Project["id"];
  category: FileCategory;
  ownerId: User["id"];
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string; // opaque key resolved by StorageService, never a public URL
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Communication / audit
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  projectId: Project["id"];
  senderId: User["id"];
  body: string;
  attachmentFileId?: FileAsset["id"];
  createdAt: string;
}

export type NotificationChannel = "IN_APP" | "EMAIL" | "TELEGRAM" | "SMS";

export interface Notification {
  id: string;
  userId: User["id"];
  channel: NotificationChannel;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId?: User["id"]; // absent for system-initiated events
  action: string; // e.g. "project.status_changed", "payment.verified"
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ProjectActivity {
  id: string;
  projectId: Project["id"];
  actorId?: User["id"];
  type: string; // e.g. "STATUS_CHANGE", "MESSAGE", "MILESTONE_UPDATE"
  summary: string;
  createdAt: string;
}
