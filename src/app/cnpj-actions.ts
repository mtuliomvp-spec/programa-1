"use server";

import { lookupCnpj } from "@/lib/cnpj-lookup";

export async function lookupCnpjAction(document: string) {
  return lookupCnpj(document);
}
