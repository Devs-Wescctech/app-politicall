/**
 * TSE Data Service
 * Integração com Portal de Dados Abertos do TSE (CKAN API)
 * https://dadosabertos.tse.jus.br/
 * API Docs: https://dadosabertos.tse.jus.br/api/3
 */

import axios from 'axios';

const TSE_API_BASE = 'https://dadosabertos.tse.jus.br/api/3';
const TSE_PORTAL_BASE = 'https://dadosabertos.tse.jus.br';

// Cache simples em memória para evitar requests repetidos
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hora

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Busca datasets do TSE via CKAN API
 */
async function searchDatasets(query: string, limit: number = 100) {
  const cacheKey = `datasets-${query}-${limit}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${TSE_API_BASE}/action/package_search`, {
      params: { q: query, rows: limit },
    });
    
    const result = response.data.result;
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Erro ao buscar datasets do TSE:', error);
    throw error;
  }
}

/**
 * Busca detalhes de um dataset específico
 */
async function getDataset(datasetId: string) {
  const cacheKey = `dataset-${datasetId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${TSE_API_BASE}/action/package_show`, {
      params: { id: datasetId },
    });
    
    const result = response.data.result;
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Erro ao buscar dataset ${datasetId} do TSE:`, error);
    throw error;
  }
}

/**
 * Interface para dados de eleitorado
 */
export interface ElectorateData {
  year: number;
  state?: string;
  city?: string;
  total: number;
  withBiometry: number;
  withoutBiometry: number;
  mandatory: number;
  optional: number;
  male: number;
  female: number;
}

/**
 * Interface para resultados de eleições
 */
export interface ElectionResults {
  year: number;
  round: number;
  position: string;
  state?: string;
  city?: string;
  candidates: Array<{
    number: number;
    name: string;
    party: string;
    votes: number;
    percentage: number;
  }>;
}

/**
 * Interface para dados de comparecimento
 */
export interface TurnoutData {
  year: number;
  round: number;
  state?: string;
  totalElectorate: number;
  attendance: number;
  abstention: number;
  attendancePercentage: number;
  abstentionPercentage: number;
}

/**
 * Interface para dados de candidaturas
 */
export interface CandidatesData {
  year: number;
  position: string;
  total: number;
  byGender: { male: number; female: number };
  byEthnicity: Record<string, number>;
  byEducation: Record<string, number>;
  approved: number;
  denied: number;
  pending: number;
}

/**
 * Busca dados de eleitorado por ano e localização
 */
export async function getElectorateData(
  year: number,
  state?: string,
  city?: string
): Promise<ElectorateData> {
  const cacheKey = `electorate-${year}-${state || 'all'}-${city || 'all'}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    // Por enquanto, retornamos dados simulados baseados no que vimos no site do TSE
    // Em produção, isso faria uma requisição real ao TSE
    const mockData: ElectorateData = {
      year,
      state,
      city,
      total: 155912680,
      withBiometry: 129198488,
      withoutBiometry: 26714192,
      mandatory: 135385313,
      optional: 20527367,
      male: 74000000,
      female: 81912680,
    };

    setCachedData(cacheKey, mockData);
    return mockData;
  } catch (error) {
    console.error('Erro ao buscar dados de eleitorado do TSE:', error);
    throw new Error('Falha ao buscar dados de eleitorado');
  }
}

/**
 * Busca resultados de eleições por ano, turno e cargo
 */
export async function getElectionResults(
  year: number,
  round: number,
  position: string,
  state?: string
): Promise<ElectionResults> {
  const cacheKey = `results-${year}-${round}-${position}-${state || 'all'}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    // Dados simulados - em produção faria requisição ao TSE
    const mockData: ElectionResults = {
      year,
      round,
      position,
      state,
      candidates: [
        { number: 13, name: 'Candidato A', party: 'PT', votes: 60345999, percentage: 50.90 },
        { number: 22, name: 'Candidato B', party: 'PL', votes: 58206354, percentage: 49.10 },
      ],
    };

    setCachedData(cacheKey, mockData);
    return mockData;
  } catch (error) {
    console.error('Erro ao buscar resultados de eleição do TSE:', error);
    throw new Error('Falha ao buscar resultados de eleição');
  }
}

/**
 * Busca dados de comparecimento e abstenção
 */
export async function getTurnoutData(
  year: number,
  round: number,
  state?: string
): Promise<TurnoutData> {
  const cacheKey = `turnout-${year}-${round}-${state || 'all'}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const mockData: TurnoutData = {
      year,
      round,
      state,
      totalElectorate: 156454011,
      attendance: 123712757,
      abstention: 32741254,
      attendancePercentage: 79.08,
      abstentionPercentage: 20.92,
    };

    setCachedData(cacheKey, mockData);
    return mockData;
  } catch (error) {
    console.error('Erro ao buscar dados de comparecimento do TSE:', error);
    throw new Error('Falha ao buscar dados de comparecimento');
  }
}

/**
 * Busca estatísticas de candidaturas
 */
export async function getCandidatesData(
  year: number,
  position: string
): Promise<CandidatesData> {
  const cacheKey = `candidates-${year}-${position}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const mockData: CandidatesData = {
      year,
      position,
      total: 29228,
      byGender: { male: 18956, female: 10272 },
      byEthnicity: {
        'Branca': 13256,
        'Parda': 11234,
        'Preta': 3456,
        'Amarela': 892,
        'Indígena': 390,
      },
      byEducation: {
        'Superior Completo': 12456,
        'Superior Incompleto': 5678,
        'Ensino Médio': 8234,
        'Fundamental': 2860,
      },
      approved: 27145,
      denied: 1856,
      pending: 227,
    };

    setCachedData(cacheKey, mockData);
    return mockData;
  } catch (error) {
    console.error('Erro ao buscar dados de candidaturas do TSE:', error);
    throw new Error('Falha ao buscar dados de candidaturas');
  }
}

/**
 * Retorna lista de anos disponíveis para consulta
 */
export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  
  // Eleições desde 2004
  for (let year = 2004; year <= currentYear; year += 2) {
    years.push(year);
  }
  
  return years.reverse(); // Mais recente primeiro
}

/**
 * Lista de cargos/posições elegíveis
 */
export const ELECTORAL_POSITIONS = [
  { value: 'presidente', label: 'Presidente' },
  { value: 'governador', label: 'Governador' },
  { value: 'senador', label: 'Senador' },
  { value: 'deputado-federal', label: 'Deputado Federal' },
  { value: 'deputado-estadual', label: 'Deputado Estadual' },
  { value: 'prefeito', label: 'Prefeito' },
  { value: 'vereador', label: 'Vereador' },
];

/**
 * Lista de estados brasileiros
 */
export const BRAZILIAN_STATES = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
];
