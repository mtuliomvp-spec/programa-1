"use client";

import { Button } from "@/components/ui";

export default function PrintButton() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()} className="print:hidden">
      🖨️ Imprimir / PDF
    </Button>
  );
}
