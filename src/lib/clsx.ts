type ClassValue = string | number | null | undefined | false;

export default function clsx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
