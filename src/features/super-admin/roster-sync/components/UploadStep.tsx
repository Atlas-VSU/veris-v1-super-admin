import { AlertTriangle, Info, Upload } from "lucide-react";
import { useRef } from "react";

export default function UploadStep({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-800 mb-1">Upload Current Roster</h2>
        <p className="text-sm text-slate-500">
          Upload a CSV or XLSX file containing the current student roster. Students already in the
          system will be updated, new students will be created, and students no longer in the
          roster will be marked as inactive.
        </p>
      </div>

      {/* Destructive action warning */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
        <p>
          <strong>This operation updates the entire roster.</strong> Any existing student whose
          Student ID is missing from the uploaded file will be soft-deleted
          (<code>isDeleted = true</code>) and lose system access — the same mechanism used by{" "}
          <strong>Archive Student Records</strong>, including removal of that student&apos;s Fees,
          Fines, and Clearance Status records for the active Academic Year and Semester. Review
          carefully before confirming.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 px-6 py-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-blue-100">
          <Upload className="size-6 text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Drop your file here, or{" "}
            <span className="text-blue-600 underline underline-offset-2">click to browse</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">Supports .csv and .xlsx files</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {/* Format hint */}
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <Info className="size-3.5 shrink-0 mt-0.5 text-slate-400" />
        <div>
          <strong>Expected columns:</strong> Student ID, First Name, Last Name, Program Name,
          Faculty Name, Year Level (any order, header names are matched loosely). Student IDs must be in{" "}
          <code className="bg-white border border-slate-200 px-1 rounded font-mono text-[11px]">YY-S-NNNNN</code> format
          or plain 8-digit numbers, which are auto-formatted.
        </div>
      </div>
    </div>
  );
}
