import { getState, transact, uid } from './storage';
import type { State, SyncJob } from '../types';
export function queueSync(
  draft: State,
  type: SyncJob['type'],
  reference: string,
  productId?: string,
  stock?: number,
) {
  draft.jobs.unshift({
    id: uid('sync'),
    type,
    reference,
    productId,
    stock,
    status: 'pending',
    attempts: 0,
    at: new Date().toISOString(),
    nextAt: Date.now() + 1200,
  });
}
export function processJobs(now = Date.now(), random = Math.random) {
  const state = getState();
  const eligible = state.jobs.filter(
    (j) =>
      j.nextAt <= now &&
      (j.status === 'pending' ||
        (j.status === 'failed' && state.tally.autoRetry && j.attempts < 5)),
  );
  if (!eligible.length) return;
  transact((d) => {
    for (const job of [...d.jobs].reverse().filter((j) => eligible.some((e) => e.id === j.id))) {
      job.attempts += 1;
      if (d.tally.offline || random() * 100 < d.tally.failureRate) {
        job.status = 'failed';
        job.error = d.tally.offline
          ? 'Simulated bridge is offline.'
          : 'Simulated connection timeout.';
        job.nextAt = now + Math.min(120000, 5000 * 2 ** job.attempts);
      } else {
        job.status = 'success';
        job.error = undefined;
        d.tally.lastSync = new Date(now).toISOString();
        if (job.snapshot) Object.assign(d.tally.stock, job.snapshot);
        const newerSucceeded = d.jobs
          .slice(
            0,
            d.jobs.findIndex((j) => j.id === job.id),
          )
          .some((j) => j.productId === job.productId && j.status === 'success');
        if (
          job.productId &&
          job.stock !== undefined &&
          !newerSucceeded &&
          d.products.some((p) => p.id === job.productId)
        )
          d.tally.stock[job.productId] = job.stock;
      }
    }
  });
}
export function retryJob(id: string) {
  transact((d) => {
    const j = d.jobs.find((j) => j.id === id);
    if (j && j.status === 'failed') {
      j.status = 'pending';
      j.nextAt = Date.now() + 1200;
      j.error = undefined;
    }
  });
}
export function retryAll() {
  transact((d) => {
    d.jobs
      .filter((j) => j.status === 'failed')
      .forEach((j) => {
        j.status = 'pending';
        j.nextAt = Date.now() + 1200;
        j.error = undefined;
      });
  });
}
export function pullStock() {
  transact((d) => {
    const snapshot = Object.fromEntries(
      d.products
        .filter((_, i) => i % 17 === 0)
        .map((p, i) => [p.id, Math.max(0, p.stock + (i % 2 === 0 ? 3 : -1))]),
    );
    queueSync(
      d,
      'Stock Pull',
      d.tally.offline ? 'Manual pull — offline' : 'Manual Tally stock snapshot',
    );
    d.jobs[0].snapshot = snapshot;
  });
}
export function setOffline(offline: boolean) {
  transact((d) => {
    d.tally.offline = offline;
  });
}
