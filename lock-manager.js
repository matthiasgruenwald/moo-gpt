export class LockManager {
  #locks = new Map();
  #chatRegistry;
  #dashboardRegistry;

  constructor(chatRegistry, dashboardRegistry) {
    this.#chatRegistry      = chatRegistry;
    this.#dashboardRegistry = dashboardRegistry;
  }

  lock(activityId, durationMinutes = 0) {
    const id = String(activityId);
    const existing = this.#locks.get(id);
    if (existing?.timerHandle) clearTimeout(existing.timerHandle);

    const entry = {};
    const mins = Math.min(120, Math.max(0, Number(durationMinutes) || 0));
    if (mins > 0) {
      entry.timerHandle = setTimeout(() => {
        this.#locks.delete(id);
        this.#chatRegistry.broadcast(activityId,      { type: 'unlocked' });
        this.#dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
        console.log(`[Lock] Aktivität ${activityId} automatisch entsperrt nach ${mins} min`);
      }, mins * 60 * 1000);
    }

    this.#locks.set(id, entry);
    this.#chatRegistry.broadcast(activityId,      { type: 'locked' });
    this.#dashboardRegistry.broadcast(activityId, { type: 'locked' });
  }

  unlock(activityId) {
    const id = String(activityId);
    const existing = this.#locks.get(id);
    if (!existing) return;
    if (existing.timerHandle) clearTimeout(existing.timerHandle);
    this.#locks.delete(id);
    this.#chatRegistry.broadcast(activityId,      { type: 'unlocked' });
    this.#dashboardRegistry.broadcast(activityId, { type: 'unlocked' });
  }

  isLocked(activityId) {
    return this.#locks.has(String(activityId));
  }
}
