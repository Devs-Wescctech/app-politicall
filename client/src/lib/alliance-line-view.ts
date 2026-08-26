import type { AllianceLine } from "@shared/schema";

export const ALLIANCE_LINE_FILTER_ALL = "all";
export const ALLIANCE_LINE_FILTER_UNASSIGNED = "unassigned";

type AllianceWithLine = {
  lineId: string | null;
  line?: AllianceLine | null;
};

type AllianceWithEmail = AllianceWithLine & {
  city: string | null;
  email: string | null;
  state: string | null;
};

type AllianceEmailCampaignOptions = {
  cityFilter: string;
  emailBlockSize: number;
  lineFilter: string;
  stateFilter: string;
};

export type AllianceEmailBlock = { emails: string[]; startIndex: number; endIndex: number };

export function filterAlliancesByLine<T extends AllianceWithLine>(alliances: T[], filter: string): T[] {
  if (filter === ALLIANCE_LINE_FILTER_ALL) return alliances;
  if (filter === ALLIANCE_LINE_FILTER_UNASSIGNED) return alliances.filter(alliance => !alliance.lineId);
  return alliances.filter(alliance => alliance.lineId === filter);
}

export function getAllianceLineLabel(alliance: AllianceWithLine): string {
  return alliance.line?.name ?? "Sem linha";
}

export function buildAllianceEmailCampaign<T extends AllianceWithEmail>(
  alliances: T[],
  options: AllianceEmailCampaignOptions,
): { blocks: AllianceEmailBlock[]; sessionId: string } {
  const geographicallyFiltered = alliances.filter(alliance => {
    const matchesState = !options.stateFilter || alliance.state === options.stateFilter;
    const matchesCity = !options.cityFilter || alliance.city === options.cityFilter;
    return matchesState && matchesCity;
  });
  const filteredEmails = filterAlliancesByLine(geographicallyFiltered, options.lineFilter)
    .flatMap(alliance => alliance.email ? [alliance.email] : []);
  const blockSize = options.emailBlockSize === 0 ? filteredEmails.length : options.emailBlockSize;
  const blocks: AllianceEmailBlock[] = [];

  if (blockSize > 0) {
    for (let index = 0; index < filteredEmails.length; index += blockSize) {
      const emails = filteredEmails.slice(index, index + blockSize);
      blocks.push({ emails, startIndex: index + 1, endIndex: index + emails.length });
    }
  }

  const emailList = [...filteredEmails].sort().join(",");
  if (!emailList) return { blocks, sessionId: "" };

  let hash = 0;
  for (let index = 0; index < emailList.length; index++) {
    hash = ((hash << 5) - hash) + emailList.charCodeAt(index);
    hash &= hash;
  }
  return { blocks, sessionId: `alliance_session_${Math.abs(hash)}` };
}

export type PredominantAllianceLine = {
  count: number;
  line: AllianceLine | null;
  name: string;
};

export function getPredominantAllianceLine(alliances: AllianceWithLine[]): PredominantAllianceLine | null {
  const counts = new Map<string, PredominantAllianceLine>();

  for (const alliance of alliances) {
    const key = alliance.lineId ?? ALLIANCE_LINE_FILTER_UNASSIGNED;
    const current = counts.get(key);
    counts.set(key, {
      count: (current?.count ?? 0) + 1,
      line: alliance.line ?? null,
      name: getAllianceLineLabel(alliance),
    });
  }

  return Array.from(counts.values()).sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count;
    const leftOrder = left.line?.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.line?.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.name.localeCompare(right.name, "pt-BR");
  })[0] ?? null;
}
