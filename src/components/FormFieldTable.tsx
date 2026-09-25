import type { ReactNode } from "react";
import { AlertTriangle, EyeOff, UserPen } from "lucide-react";
import {
  fieldDescription,
  fieldDisplayName,
  isUncertain,
} from "../services/formAssistantService";
import {
  SEMANTIC_FIELD_LABELS,
  type DetectedFormField,
  type FillPlanStatus,
  type FillResultStatus,
  type SemanticField,
} from "../types/formAssistant";
import { cn } from "../utils/cn";

const FIELD_OPTIONS = Object.entries(SEMANTIC_FIELD_LABELS) as [SemanticField, string][];

export interface FieldFillStatus {
  status: FillPlanStatus | FillResultStatus;
  reason: string | null;
  value: string | null;
}

interface FormFieldTableProps {
  fields: DetectedFormField[];
  statuses: Record<string, FieldFillStatus>;
  onMappingChange: (fieldKey: string, mappedField: SemanticField | null) => void;
}

const STATUS_STYLES: Record<FieldFillStatus["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]" },
  filled: { label: "Filled", className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" },
  skipped: { label: "Skipped", className: "bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10" },
  review: { label: "Review", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" },
};

export function FormFieldTable({ fields, statuses, onMappingChange }: FormFieldTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-card dark:shadow-card-dark">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border))] text-left text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">
              <th className="px-4 py-2.5 font-medium">Field</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Mapped As</th>
              <th className="px-4 py-2.5 text-right font-medium">Confidence</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                fillStatus={statuses[field.key]}
                onMappingChange={onMappingChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  fillStatus,
  onMappingChange,
}: {
  field: DetectedFormField;
  fillStatus: FieldFillStatus | undefined;
  onMappingChange: FormFieldTableProps["onMappingChange"];
}) {
  const name = fieldDisplayName(field);
  const description = fieldDescription(field);
  const uncertain = isUncertain(field);

  return (
    <tr
      className={cn(
        "border-b border-[rgb(var(--border))] last:border-b-0",
        !field.visible && "opacity-60"
      )}
    >
      <td className="max-w-[260px] px-4 py-2.5 align-top">
        <p className="truncate font-mono text-[13px]" title={field.selector}>
          {name}
        </p>
        {description && description !== name && (
          <p className="mt-0.5 truncate text-xs text-[rgb(var(--muted))]" title={description}>
            {description}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-md bg-black/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">
            {field.type}
          </span>
          {field.required && <Tag className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200">Required</Tag>}
          {!field.visible && (
            <Tag className="bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10">
              <EyeOff size={10} />
              Hidden
            </Tag>
          )}
          {field.disabled && <Tag className="bg-black/5 text-[rgb(var(--muted))] dark:bg-white/10">Disabled</Tag>}
        </div>
        {field.options.length > 0 && (
          <p className="mt-1 text-xs text-[rgb(var(--muted))]">
            {field.options.length} {field.options.length === 1 ? "option" : "options"}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 align-top">
        <select
          value={field.mappedField ?? ""}
          onChange={(event) =>
            onMappingChange(field.key, (event.target.value || null) as SemanticField | null)
          }
          aria-label={`Mapping for ${name}`}
          className={cn(
            "w-full min-w-[150px] rounded-lg border bg-[rgb(var(--surface))] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]",
            uncertain ? "border-amber-400/70" : "border-[rgb(var(--border))]"
          )}
        >
          <option value="">Not mapped</option>
          {FIELD_OPTIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5 text-right align-top">
        <ConfidenceBadge field={field} uncertain={uncertain} />
      </td>
      <td className="max-w-[200px] px-4 py-2.5 align-top">
        {fillStatus ? <FillStatusCell fillStatus={fillStatus} /> : <span className="text-xs text-[rgb(var(--muted))]">—</span>}
      </td>
    </tr>
  );
}

function FillStatusCell({ fillStatus }: { fillStatus: FieldFillStatus }) {
  const style = STATUS_STYLES[fillStatus.status];
  const detail = fillStatus.status === "ready" || fillStatus.status === "filled" ? fillStatus.value : fillStatus.reason;
  return (
    <div title={fillStatus.reason ?? undefined}>
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", style.className)}>
        {style.label}
      </span>
      {detail && <p className="mt-0.5 truncate text-xs text-[rgb(var(--muted))]">{detail}</p>}
    </div>
  );
}

function ConfidenceBadge({ field, uncertain }: { field: DetectedFormField; uncertain: boolean }) {
  if (field.mappingSource === "user") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-xs font-medium text-[rgb(var(--accent))]"
        title="Set manually"
      >
        <UserPen size={11} />
        Manual
      </span>
    );
  }
  if (!field.mappedField) {
    return <span className="text-xs text-[rgb(var(--muted))]">—</span>;
  }
  const percent = Math.round(field.confidence * 100);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        uncertain
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
      )}
      title={field.mappingReasons.length ? `Based on: ${field.mappingReasons.join("; ")}` : undefined}
    >
      {uncertain && <AlertTriangle size={11} />}
      {percent}%
      {uncertain && <span className="font-medium">· Review</span>}
    </span>
  );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}
