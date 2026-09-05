export function StatCard({
  label,
  value,
  accent = "slate",
}: {
  label:   string;
  value:   number | string;
  accent?: "slate" | "blue" | "green" | "amber" | "red";
}) {
  const accents = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    blue:  "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red:   "bg-red-50 border-red-200 text-red-700",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 ${accents[accent]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
