"use client";

import { MODULES } from "@/lib/permissions";

export default function PermissionsChecklist({ defaults }: { defaults?: string[] }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {MODULES.map((m) => (
        <label key={m.key} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="permissions"
            value={m.key}
            defaultChecked={defaults ? defaults.includes(m.key) : true}
            className="h-4 w-4 rounded border-slate-300"
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}
