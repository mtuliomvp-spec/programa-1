"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan, assertCanAny } from "@/lib/guards";
import {
  CHECKLIST_ITEMS,
  type ChecklistMap,
  type ChecklistState,
} from "@/lib/appraisals";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

/** Número opcional: "" / ausente → undefined (não vira 0). */
const optionalNumber = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().optional(),
);
const optionalInt = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().optional(),
);
const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  z.string().optional(),
);

const appraisalSchema = z.object({
  plate: optionalString,
  brand: z.string().trim().min(1, "Informe a marca"),
  model: z.string().trim().min(1, "Informe o modelo"),
  version: optionalString,
  manufactureYear: optionalInt,
  modelYear: optionalInt,
  color: optionalString,
  fuel: optionalString,
  transmission: optionalString,
  km: optionalInt,
  chassi: optionalString,
  renavam: optionalString,
  fipePrice: optionalNumber,
  fipeModelo: optionalString,
  appraisalPrice: optionalNumber,
  ownerAskingPrice: optionalNumber,
  notes: optionalString,
  ownerName: optionalString,
  ownerPhone: optionalString,
});

export type AppraisalFormState = { error?: string };

function isState(v: unknown): v is ChecklistState {
  return v === "OK" || v === "ATENCAO" || v === "PROBLEMA";
}

/**
 * Lê o checklist do formulário. Cada item usa dois campos:
 * `<prefix><key>` (estado: OK/ATENCAO/PROBLEMA) e `<prefix>obs_<key>` (obs).
 */
function checklistFromForm(formData: FormData, prefix: string): ChecklistMap {
  const map: ChecklistMap = {};
  for (const item of CHECKLIST_ITEMS) {
    const rawState = formData.get(`${prefix}${item.key}`);
    const state: ChecklistState = isState(rawState) ? rawState : "OK";
    const rawObs = formData.get(`${prefix}obs_${item.key}`);
    const obs = typeof rawObs === "string" && rawObs.trim() ? rawObs.trim() : undefined;
    map[item.key] = obs ? { state, obs } : { state };
  }
  return map;
}

/** Opcionais marcados (getAll) + extras livres (um por linha / vírgula). */
function optionalsFromForm(formData: FormData): string[] {
  const checked = formData
    .getAll("optionals")
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  const extraRaw = String(formData.get("optionalsExtra") || "");
  const extras = extraRaw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Remove duplicados preservando a ordem.
  return Array.from(new Set([...checked, ...extras]));
}

function dataFromForm(formData: FormData) {
  const parsed = appraisalSchema.parse({
    plate: formData.get("plate"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    version: formData.get("version"),
    manufactureYear: formData.get("manufactureYear"),
    modelYear: formData.get("modelYear"),
    color: formData.get("color"),
    fuel: formData.get("fuel"),
    transmission: formData.get("transmission"),
    km: formData.get("km"),
    chassi: formData.get("chassi"),
    renavam: formData.get("renavam"),
    fipePrice: formData.get("fipePrice"),
    fipeModelo: formData.get("fipeModelo"),
    appraisalPrice: formData.get("appraisalPrice"),
    ownerAskingPrice: formData.get("ownerAskingPrice"),
    notes: formData.get("notes"),
    ownerName: formData.get("ownerName"),
    ownerPhone: formData.get("ownerPhone"),
  });
  return {
    plate: parsed.plate?.toUpperCase() ?? null,
    brand: parsed.brand,
    model: parsed.model,
    version: parsed.version ?? null,
    manufactureYear: parsed.manufactureYear ?? null,
    modelYear: parsed.modelYear ?? null,
    color: parsed.color ?? null,
    fuel: parsed.fuel ?? null,
    transmission: parsed.transmission ?? null,
    km: parsed.km ?? null,
    chassi: parsed.chassi?.toUpperCase() ?? null,
    renavam: parsed.renavam ?? null,
    fipePrice: parsed.fipePrice ?? null,
    fipeModelo: parsed.fipeModelo ?? null,
    appraisalPrice: parsed.appraisalPrice ?? null,
    ownerAskingPrice: parsed.ownerAskingPrice ?? null,
    notes: parsed.notes ?? null,
    ownerName: parsed.ownerName ?? null,
    ownerPhone: parsed.ownerPhone ?? null,
    optionals: optionalsFromForm(formData),
    checklist: checklistFromForm(formData, "cl_"),
  };
}

export async function createAppraisalAction(
  _prev: AppraisalFormState,
  formData: FormData,
): Promise<AppraisalFormState> {
  let user;
  try {
    user = await assertCan("avaliacoes", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  let data;
  try {
    data = dataFromForm(formData);
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message || "Dados inválidos." };
    return { error: e instanceof Error ? e.message : "Não foi possível salvar a avaliação." };
  }

  const created = await prisma.vehicleAppraisal.create({
    data: {
      ...data,
      createdById: user.id,
      createdByName: user.name,
    },
    select: { id: true },
  });

  revalidatePath("/avaliacoes");
  redirect(`/avaliacoes/${created.id}`);
}

export async function updateAppraisalAction(
  _prev: AppraisalFormState,
  formData: FormData,
): Promise<AppraisalFormState> {
  try {
    await assertCan("avaliacoes", "editar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Avaliação inválida." };

  let data;
  try {
    data = dataFromForm(formData);
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message || "Dados inválidos." };
    return { error: e instanceof Error ? e.message : "Não foi possível salvar a avaliação." };
  }

  await prisma.vehicleAppraisal.update({ where: { id }, data });

  revalidatePath("/avaliacoes");
  revalidatePath(`/avaliacoes/${id}`);
  redirect(`/avaliacoes/${id}`);
}

export async function deleteAppraisalAction(id: string) {
  await assertCan("avaliacoes", "excluir");
  await prisma.vehicleAppraisal.delete({ where: { id } }); // fotos caem por cascade
  revalidatePath("/avaliacoes");
  redirect("/avaliacoes");
}

/** Consulta de placa/FIPE liberada a quem faz/edita avaliação. */
export async function lookupAppraisalPlateAction(plate: string) {
  try {
    await assertCanAny([
      ["avaliacoes", "criar"],
      ["avaliacoes", "editar"],
    ]);
  } catch {
    return { ok: false as const, error: "Você não tem permissão para consultar a placa." };
  }
  const { lookupPlate } = await import("@/lib/plate-lookup");
  return lookupPlate(plate);
}

export type PhotoState = { ok?: boolean; error?: string };

export async function uploadAppraisalPhotosAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  try {
    await assertCanAny([
      ["avaliacoes", "criar"],
      ["avaliacoes", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const appraisalId = String(formData.get("appraisalId") || "").trim();
  if (!appraisalId) return { error: "Avaliação inválida." };
  const appraisal = await prisma.vehicleAppraisal.findUnique({
    where: { id: appraisalId },
    select: { id: true },
  });
  if (!appraisal) return { error: "Avaliação não encontrada." };

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos uma foto." };
  for (const file of files) {
    if (!file.type.startsWith("image/")) return { error: `"${file.name}" não é uma imagem.` };
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `"${file.name}" é muito grande (máximo 15 MB por foto).` };
    }
  }

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await prisma.vehicleAppraisalPhoto.create({
      data: {
        appraisalId,
        filename: file.name || "foto.jpg",
        mimeType: file.type || "image/jpeg",
        size: file.size,
        data: buffer,
      },
    });
  }
  revalidatePath(`/avaliacoes/${appraisalId}`);
  return { ok: true };
}

export async function deleteAppraisalPhotoAction(photoId: string, appraisalId: string) {
  await assertCanAny([
    ["avaliacoes", "criar"],
    ["avaliacoes", "editar"],
  ]);
  await prisma.vehicleAppraisalPhoto.delete({ where: { id: photoId } });
  revalidatePath(`/avaliacoes/${appraisalId}`);
}

/**
 * Registra a CONFERÊNCIA de entrega: re-marca o mesmo checklist e grava quem
 * conferiu e quando. Não cria veículo no estoque — só registra a conferência.
 */
export async function recordDeliveryConferenceAction(
  _prev: AppraisalFormState,
  formData: FormData,
): Promise<AppraisalFormState> {
  let user;
  try {
    user = await assertCan("avaliacoes", "conferir");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Avaliação inválida." };
  const appraisal = await prisma.vehicleAppraisal.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!appraisal) return { error: "Avaliação não encontrada." };

  const deliveryChecklist = checklistFromForm(formData, "dcl_");
  const checkedByInput = String(formData.get("checkedBy") || "").trim();
  const deliveryNotes = String(formData.get("deliveryNotes") || "").trim();

  await prisma.vehicleAppraisal.update({
    where: { id },
    data: {
      status: "CONFERIDO",
      deliveryChecklist,
      deliveryNotes: deliveryNotes || null,
      deliveredAt: new Date(),
      checkedBy: checkedByInput || user.name,
    },
  });

  revalidatePath("/avaliacoes");
  revalidatePath(`/avaliacoes/${id}`);
  redirect(`/avaliacoes/${id}`);
}
