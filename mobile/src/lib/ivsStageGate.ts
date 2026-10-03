/**
 * Serializes IVS Real-Time Stage singleton ops.
 *
 * expo-realtime-ivs-broadcast is process-wide. Fire-and-forget leave/destroy racing a
 * new join/init leaves video blank until the app is killed.
 */

type StageTask<T> = () => Promise<T>;

let queue: Promise<unknown> = Promise.resolve();

export function runIvsStageSerialized<T>(task: StageTask<T>): Promise<T> {
  const run = queue.then(task, task);
  // Keep the chain alive even when a task rejects.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function leaveStageSerialized(leave: () => Promise<unknown>): Promise<void> {
  await runIvsStageSerialized(async () => {
    try {
      await leave();
    } catch {
      /* stage may already be left */
    }
  });
}

export async function joinStageSerialized(
  join: (token: string) => Promise<unknown>,
  token: string,
): Promise<void> {
  await runIvsStageSerialized(async () => {
    await join(token);
  });
}

export async function withIvsStageSerialized<T>(task: StageTask<T>): Promise<T> {
  return runIvsStageSerialized(task);
}
