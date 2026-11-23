import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 text-center dark:bg-[#090D16]">
      <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
        404
      </p>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
        Signal Archive Not Found
      </h1>
      <p className="mt-1.5 max-w-md text-xs text-slate-500 dark:text-slate-400">
        The requested date or page does not exist in AI Founder Radar yet.
      </p>
      <Link
        href="/en"
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
      >
        Back to Latest Signals
      </Link>
    </div>
  );
}
