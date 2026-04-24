export async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`${label} failed`);
  } finally {
    clearTimeout(timeout);
  }
}
