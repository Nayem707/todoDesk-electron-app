export type SemanticField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "dateOfBirth"
  | "gender"
  | "address"
  | "city"
  | "state"
  | "country"
  | "postalCode"
  | "nationality"
  | "passportNumber"
  | "nationalId"
  | "username"
  | "password"
  | "company"
  | "jobTitle"
  | "website"
  | "profilePhoto"
  | "resume"
  | "coverLetter";

export const SEMANTIC_FIELD_LABELS: Record<SemanticField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Full Name",
  email: "Email",
  phone: "Phone",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  address: "Address",
  city: "City",
  state: "State / Province",
  country: "Country",
  postalCode: "Postal Code",
  nationality: "Nationality",
  passportNumber: "Passport Number",
  nationalId: "National ID",
  username: "Username",
  password: "Password",
  company: "Company",
  jobTitle: "Job Title",
  website: "Website",
  profilePhoto: "Profile Photo",
  resume: "Resume / CV",
  coverLetter: "Cover Letter",
};

export interface FormFieldOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface DetectedFormField {
  key: string;
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  autocomplete: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  multiple: boolean;
  accept: string;
  maxLength: number | null;
  value: string;
  options: FormFieldOption[];
  legend: string;
  nearbyText: string;
  formIndex: number | null;
  frameUrl: string | null;
  selector: string;
  mappedField: SemanticField | null;
  confidence: number;
  mappingSource: "rules" | "user" | string;
  mappingReasons: string[];
}

export interface DetectedForm {
  index: number;
  id: string;
  name: string;
  method: string;
  action: string;
  frameUrl: string | null;
}

export interface FormAnalysisWarning {
  code: string;
  message: string;
}

export type FormAnalysisStatus = "completed" | "failed";

export interface FormAnalysisSummary {
  id: string;
  url: string;
  finalUrl: string | null;
  title: string;
  status: FormAnalysisStatus;
  errorCode: string | null;
  errorMessage: string | null;
  fieldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FormAnalysis extends FormAnalysisSummary {
  fields: DetectedFormField[];
  forms: DetectedForm[];
  warnings: FormAnalysisWarning[];
  durationMs: number | null;
}

export type FormAnalysisErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "SSL_ERROR"
  | "NO_FORMS"
  | "PAGE_LOAD_FAILED"
  | "BROWSER_UNAVAILABLE"
  | "BROWSER_ERROR"
  | "AUTH_REQUIRED"
  | "CAPTCHA_DETECTED"
  | "BLOCKED"
  | "TOO_MANY_REDIRECTS"
  | "CANCELLED"
  | "BUSY";

export interface FormAnalysisError {
  code: FormAnalysisErrorCode | string;
  message: string;
}

export interface FormAnalyzeResult {
  analysis: FormAnalysis | null;
  error: FormAnalysisError | null;
}

export type FillPlanStatus = "ready" | "skipped" | "review";

export interface FillPlanEntry {
  key: string;
  status: FillPlanStatus;
  reason: string | null;
  displayValue: string | null;
  action: "fill" | "select" | "check" | "uncheck" | "radio" | null;
}

export type FillResultStatus = "filled" | "skipped" | "failed" | "review";

export interface FillFieldResult {
  key: string;
  field: string;
  mappedField: SemanticField | null;
  status: FillResultStatus;
  value: string | null;
  reason: string | null;
}

export interface AutofillSummary {
  success: boolean;
  totalDetected: number;
  filled: number;
  skipped: number;
  failed: number;
  review: number;
  results: FillFieldResult[];
}

export interface AutofillResponse {
  result: AutofillSummary | null;
  error: FormAnalysisError | null;
}

export type AutofillPhase = "opening" | "loading" | "filling";

export interface AutofillProgressEvent {
  requestId: string;
  phase?: AutofillPhase;
  result?: FillFieldResult;
}

export type FormAnalysisStep = "opening" | "loading" | "detecting" | "mapping";

export interface FormAnalysisProgressEvent {
  requestId: string;
  step: FormAnalysisStep;
}
