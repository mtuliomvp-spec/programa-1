"use server";

import { lookupCep } from "@/lib/cep-lookup";
import { canUseFormLookup } from "@/lib/guards";

export async function lookupCepAction(cep: string) {
  if (!(await canUseFormLookup())) {
    return { ok: false as const, error: "Você não tem permissão para esta consulta." };
  }
  return lookupCep(cep);
}
