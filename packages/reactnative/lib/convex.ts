export function getConvexCloudUrl(): string {
  return process.env.EXPO_PUBLIC_CONVEX_URL ?? 'https://placeholder.convex.cloud';
}

export function getConvexSiteUrl(): string {
  return getConvexCloudUrl().replace(/\.convex\.cloud$/, '.convex.site');
}

export function isClerkConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_'));
}

export function getClerkErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback;

  if (typeof error === 'object') {
    const record = error as {
      message?: unknown;
      errors?: { message?: string; longMessage?: string }[];
      fields?: Record<string, { message?: string } | undefined>;
    };

    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }

    const fieldError = record.fields
      ? Object.values(record.fields).find((value) => value?.message)?.message
      : undefined;
    if (fieldError) return fieldError;

    const first = record.errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
