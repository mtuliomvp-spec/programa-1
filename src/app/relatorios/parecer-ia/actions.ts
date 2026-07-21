"use server";

import { assertCan } from "@/lib/guards";
import {
  getParecerConfig,
  generateGlobalParecer,
  generateVehicleParecer,
  type GlobalParecer,
  type VehicleParecer,
  type ParecerMeta,
} from "@/lib/parecer-ia";

export type GlobalParecerResult =
  | { ok: true; parecer: GlobalParecer; meta: ParecerMeta }
  | { ok: false; error: string; notConfigured?: boolean };

export type VehicleParecerResult =
  | { ok: true; parecer: VehicleParecer; meta: ParecerMeta; vehicleLabel: string; plate: string }
  | { ok: false; error: string; notConfigured?: boolean };

export async function gerarParecerGlobalAction(): Promise<GlobalParecerResult> {
  try {
    await assertCan("relatorios", "visualizar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const config = await getParecerConfig();
  if (!config.configured) {
    return {
      ok: false,
      notConfigured: true,
      error: "A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.",
    };
  }
  try {
    const { parecer, meta } = await generateGlobalParecer(config);
    return { ok: true, parecer, meta };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível gerar o parecer." };
  }
}

export async function gerarParecerVeiculoAction(vehicleId: string): Promise<VehicleParecerResult> {
  try {
    await assertCan("estoque", "visualizar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const config = await getParecerConfig();
  if (!config.configured) {
    return {
      ok: false,
      notConfigured: true,
      error: "A IA ainda não está configurada. Cadastre a chave em Parâmetros › Parecer IA.",
    };
  }
  try {
    const r = await generateVehicleParecer(config, vehicleId);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível gerar o parecer." };
  }
}
