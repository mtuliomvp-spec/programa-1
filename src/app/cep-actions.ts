"use server";

import { lookupCep } from "@/lib/cep-lookup";

export async function lookupCepAction(cep: string) {
  return lookupCep(cep);
}
