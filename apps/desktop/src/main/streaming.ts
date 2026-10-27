export async function settlesWithin(
  task: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    void task.then(
      () => finish(true),
      () => finish(true),
    );
  });
}
