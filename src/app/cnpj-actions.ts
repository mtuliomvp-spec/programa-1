"use server";

import { lookupCnpj } from "@/lib/cnpj-lookup";
import { canUseFormLookup } from "@/lib/guards";

export async function lookupCnpjAction(document: string) {
  if (!(await canUseFormLookup())) {
    return { ok: false as const, error: "Você não tem permissão para esta consulta." };
  }
  return lookupCnpj(document);
}
