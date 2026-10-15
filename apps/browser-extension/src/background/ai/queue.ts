/**
 * One model call at a time. Chrome's on-device model shares one GPU process, so concurrent
 * sessions slow each other down and can run it out of memory; a queue keeps an interactive call
 * (the user is waiting) from sitting behind a pile of background precompute work.
 */
export type Priority = 'interactive' | 'background';

interface Job {
  priority: Priority;
  start: () => void;
}

const waiting: Job[] = [];
let busy = false;

function next(): void {
  if (busy) return;
  const job = waiting.shift();
  if (!job) return;
  busy = true;
  job.start();
}

export function enqueue<T>(run: () => Promise<T>, priority: Priority): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = {
      priority,
      start: () => {
        Promise.resolve()
          .then(run)
          .then(resolve, reject)
          .finally(() => {
            busy = false;
            next();
          });
      },
    };
    if (priority === 'interactive') {
      // Behind earlier interactive jobs, ahead of every waiting background one.
      const firstBackground = waiting.findIndex((queued) => queued.priority === 'background');
      waiting.splice(firstBackground === -1 ? waiting.length : firstBackground, 0, job);
    } else {
      waiting.push(job);
    }
    next();
  });
}
