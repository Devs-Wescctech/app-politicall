import { z } from "zod";
import type { AllianceLine, InsertAllianceLine } from "./schema";

export type { AllianceLine, InsertAllianceLine };

export const ALLIANCE_LINE_ICONS = [
  "Flag",
  "Landmark",
  "Handshake",
  "Users",
  "Megaphone",
  "Scale",
] as const;

const allianceLineNameSchema = z.string().trim().min(2).max(60);
const allianceLineDescriptionSchema = z.string().trim().max(500).optional();
const allianceLineColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const allianceLineIconSchema = z.enum(ALLIANCE_LINE_ICONS);
const allianceLineDisplayOrderSchema = z.number().int().min(0);
export const allianceLineIdSchema = z.string().uuid();

export const insertAllianceLineSchema = z.object({
  name: allianceLineNameSchema,
  description: allianceLineDescriptionSchema,
  color: allianceLineColorSchema,
  icon: allianceLineIconSchema,
  displayOrder: allianceLineDisplayOrderSchema.default(0),
  active: z.boolean().default(true),
});

export const updateAllianceLineSchema = insertAllianceLineSchema
  .partial()
  .extend({ description: allianceLineDescriptionSchema.nullable() })
  .refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo para atualizar.");

export const reorderAllianceLinesSchema = z.object({
  ids: z.array(allianceLineIdSchema).min(1),
}).refine(({ ids }) => new Set(ids).size === ids.length, {
  message: "Os IDs das linhas devem ser únicos.",
  path: ["ids"],
});

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function allianceLineTextColor(color: string): "#000000" | "#FFFFFF" {
  const luminance = relativeLuminance(color);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
}
