// Placeholder entry point. The telegram-worker feature plan has not been applied,
// so this process must not poll, trade, or mutate any state. It exists only
// so the service is deployable and its absence is visible in logs.
console.log('worker disabled: implementation plan not yet applied (telegram-worker)');
process.exit(0);
