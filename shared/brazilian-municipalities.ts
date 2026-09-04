import municipalityData from "./data/brazilian-municipalities.json";

export type BrazilianMunicipality = {
  name: string;
  uf: string;
};

export const BRAZILIAN_MUNICIPALITIES = municipalityData as BrazilianMunicipality[];

function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function searchBrazilianMunicipalities(query: string, limit = 8): BrazilianMunicipality[] {
  const term = searchKey(query);
  if (!term || limit <= 0) return [];

  const prefixes: BrazilianMunicipality[] = [];
  const contains: BrazilianMunicipality[] = [];
  for (const municipality of BRAZILIAN_MUNICIPALITIES) {
    const name = searchKey(municipality.name);
    if (name.startsWith(term)) prefixes.push(municipality);
    else if (name.includes(term)) contains.push(municipality);
  }
  return [...prefixes, ...contains].slice(0, limit);
}

export function findBrazilianMunicipality(city: string, uf?: string): BrazilianMunicipality | null {
  const cityKey = searchKey(city);
  const stateKey = String(uf ?? "").trim().toUpperCase();
  if (!cityKey) return null;

  return BRAZILIAN_MUNICIPALITIES.find((municipality) => (
    searchKey(municipality.name) === cityKey
    && (!stateKey || municipality.uf === stateKey)
  )) ?? null;
}
