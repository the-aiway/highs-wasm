import type { SolverVariant, VariantAssetUrl } from "./types.ts";

export function resolveVariantUrl(urlOpt: VariantAssetUrl | undefined, variant: SolverVariant): string | undefined {
  if (urlOpt == null) return undefined;
  if (typeof urlOpt === "string" || urlOpt instanceof URL) return String(urlOpt);
  return urlOpt[variant] != null ? String(urlOpt[variant]) : undefined;
}

export function defaultWorkerUrl(variant: SolverVariant): string {
  return new URL(`../dist/worker.${variant}.js`, import.meta.url).href;
}
