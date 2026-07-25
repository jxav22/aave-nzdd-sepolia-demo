export default function DeveloperApiLoading() {
  return (
    <div className="flex flex-col items-center justify-center grow py-24 gap-3">
      <span className="loading loading-spinner loading-lg" />
      <p className="text-sm opacity-70">Loading Developer API…</p>
    </div>
  );
}
