export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string | undefined;
  instance?: string | undefined;
  traceId?: string | undefined;
  errors?: Record<string, string[]> | undefined;
}

export function problem({
  type,
  title,
  status,
  detail,
  instance,
  traceId,
  errors,
}: ProblemDetails): ProblemDetails {
  return { type, title, status, detail, instance, traceId, errors };
}
