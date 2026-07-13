import { Field, Select } from "@/components/ui";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";

/**
 * Seletor do fluxo estrutural (obra estrutural) por onde o lançamento vai
 * passar: Veículos, Administrativo ou Capital. Como é só um <select> comum,
 * pode ser usado em formulários de cliente ou de servidor.
 */
export default function StructuralFlowSelect({
  name = "structuralKey",
  defaultValue = "ADMINISTRATIVO",
  label = "Fluxo (obra estrutural)",
  className,
  required,
}: {
  name?: string;
  defaultValue?: string;
  label?: string;
  className?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <Select name={name} defaultValue={defaultValue} className={className}>
        {STRUCTURAL_FLOWS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
