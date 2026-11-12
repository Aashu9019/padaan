import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div role="status" className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div className="flex items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-lg">
        <span>A new version is ready.</span>
        <button
          className="rounded-md bg-paper px-3 py-1.5 font-medium text-ink"
          onClick={() => void updateServiceWorker(true)}
        >
          Reload
        </button>
        <button className="px-1 text-paper/70 hover:text-paper" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  );
}
