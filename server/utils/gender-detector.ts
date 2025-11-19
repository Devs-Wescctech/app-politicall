// Detecção de gênero baseada em nomes brasileiros
// Baseado em padrões comuns de nomes no Brasil

const MALE_NAMES = new Set([
  'JOAO', 'JOSE', 'ANTONIO', 'FRANCISCO', 'CARLOS', 'PAULO', 'PEDRO', 'LUCAS',
  'LUIZ', 'MARCOS', 'LUIS', 'GABRIEL', 'RAFAEL', 'DANIEL', 'MARCELO', 'BRUNO',
  'RODRIGO', 'EDUARDO', 'FELIPE', 'GUILHERME', 'GUSTAVO', 'ANDRE', 'FERNANDO',
  'FABIO', 'LEONARDO', 'RICARDO', 'DIEGO', 'MATEUS', 'MAURICIO', 'SERGIO',
  'THIAGO', 'VITOR', 'CAIO', 'ENZO', 'ARTHUR', 'MIGUEL', 'DAVI', 'DAVID', 'HENRIQUE',
  'NICOLAS', 'LORENZO', 'SAMUEL', 'BENJAMIN', 'VINICIUS', 'ALEXANDER', 'MURILO',
  'IGOR', 'RENAN', 'JULIO', 'CESAR', 'ROBERTO', 'MARCIO', 'RENATO', 'RAUL',
  'OTAVIO', 'HEITOR', 'BERNARDO', 'THEO', 'ISAAC', 'PIETRO', 'EMANUEL',
  'JOAB', 'NOE', 'GAEL', 'RAVI', 'ANTHONY', 'ENRICO', 'JOAQUIM', 'BENICIO',
  'AUGUSTO', 'LUCCA', 'LEVI', 'CAUÃ', 'RYAN', 'JOAQUIM', 'PABLO', 'ALEX',
  'MATHEUS', 'YURI', 'KAIQUE', 'KAUA', 'ERICK', 'KEVIN', 'ADRIANO', 'CRISTIANO',
  'ANDERSON', 'WASHINGTON', 'WELLINGTON', 'EMERSON', 'EDSON', 'NELSON', 'WILSON',
  'VAGNER', 'WAGNER', 'JONATHAS', 'JONATHAN', 'GUSTAVO', 'RAFAEL', 'FABIANO',
  'CLAUDIO', 'FLAVIO', 'LUCIANO', 'MARCELO', 'MAURO', 'EVANDRO', 'ALESSANDRO'
]);

const FEMALE_NAMES = new Set([
  'MARIA', 'ANA', 'FRANCISCA', 'ANTONIA', 'ADRIANA', 'JULIANA', 'MARCIA',
  'FERNANDA', 'PATRICIA', 'ALINE', 'SANDRA', 'CAMILA', 'AMANDA', 'BRUNA',
  'JESSICA', 'LETICIA', 'JULIA', 'MARIANA', 'GABRIELA', 'RAFAELA', 'CAROLINA',
  'ISABELA', 'BEATRIZ', 'LARISSA', 'RENATA', 'CARLA', 'CLAUDIA', 'SIMONE',
  'VANESSA', 'TATIANA', 'DANIELA', 'LUCIANA', 'MONICA', 'ANDREA', 'SILVIA',
  'BIANCA', 'SABRINA', 'NATALIA', 'PRISCILA', 'VIVIANE', 'CRISTINA', 'ELIANE',
  'ROSANGELA', 'APARECIDA', 'ALICE', 'SOPHIA', 'HELENA', 'VALENTINA', 'LUNA',
  'GIOVANNA', 'MANUELA', 'LAURA', 'ISABELLE', 'MELISSA', 'YASMIN', 'LORENA',
  'LIVIA', 'MARIA EDUARDA', 'EDUARDA', 'SARAH', 'LUIZA', 'MARIA CLARA', 'CLARA',
  'VITORIA', 'LARA', 'NICOLE', 'MARIA LUIZA', 'CECILIA', 'EMANUELLY', 'AGATHA',
  'ESTHER', 'MARINA', 'ANTONELLA', 'ELISA', 'HELOISA', 'MILENA', 'MARINA',
  'TEREZA', 'ISIS', 'ALICIA', 'JOANA', 'PIETRA', 'MARIA VITORIA', 'EMILLY',
  'RAQUEL', 'ISABEL', 'MURIEL', 'GISELE', 'MICHELLE', 'RACHEL', 'MARIBEL',
  'ARIEL', 'MIRELA', 'QUEL', 'MIRABEL', 'MIKAELA', 'GRAZIELA', 'MARIELA',
  'EMANUELA', 'RAFAELA', 'GRAZIELLE', 'MICAELA', 'MARIZABEL'
]);

// Sufixos tipicamente femininos
const FEMALE_SUFFIXES = ['A', 'ANDA', 'ILDA', 'IANA', 'ANA', 'INA', 'ELLE', 'ELLA'];

// Sufixos tipicamente masculinos (removido 'EL' para evitar classificação incorreta de nomes femininos)
const MALE_SUFFIXES = ['O', 'OS', 'OR', 'SON', 'TON', 'VAN', 'IEL'];

// Nomes masculinos que terminam em 'A' (exceções)
const MALE_EXCEPTIONS_ENDING_A = new Set([
  'LUCAS', 'LUCA', 'JOSUA', 'NIKITA', 'GARCIA', 'OLIVEIRA', 'SILVA', 'SOUSA', 
  'COSTA', 'TEIXEIRA', 'PEREIRA', 'FERREIRA', 'MOURA', 'GOMES'
]);

/**
 * Detecta o gênero baseado no primeiro nome
 * @param fullName Nome completo da pessoa
 * @returns 'Masculino', 'Feminino' ou 'Indefinido'
 */
export function detectGenderFromName(fullName: string): 'Masculino' | 'Feminino' | 'Indefinido' {
  if (!fullName || typeof fullName !== 'string') {
    return 'Indefinido';
  }

  // Extrai o primeiro nome e normaliza
  const firstName = fullName
    .trim()
    .split(' ')[0]
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove acentos

  if (!firstName) {
    return 'Indefinido';
  }

  // Verifica se está na lista de nomes masculinos
  if (MALE_NAMES.has(firstName)) {
    return 'Masculino';
  }

  // Verifica se está na lista de nomes femininos
  if (FEMALE_NAMES.has(firstName)) {
    return 'Feminino';
  }

  // Verifica exceções de nomes masculinos terminados em 'A'
  if (MALE_EXCEPTIONS_ENDING_A.has(firstName)) {
    return 'Masculino';
  }

  // Verifica sufixos femininos
  for (const suffix of FEMALE_SUFFIXES) {
    if (firstName.endsWith(suffix) && firstName.length > suffix.length) {
      return 'Feminino';
    }
  }

  // Verifica sufixos masculinos
  for (const suffix of MALE_SUFFIXES) {
    if (firstName.endsWith(suffix) && firstName.length > suffix.length) {
      return 'Masculino';
    }
  }

  // Se não conseguiu determinar
  return 'Indefinido';
}

/**
 * Calcula a distribuição de gênero em uma lista de contatos
 * @param contacts Array de contatos com campo 'name'
 * @returns Objeto com contagem de masculino, feminino e indefinido
 */
export function calculateGenderDistribution(contacts: { name: string }[]) {
  const distribution = {
    Masculino: 0,
    Feminino: 0,
    Indefinido: 0,
  };

  for (const contact of contacts) {
    const gender = detectGenderFromName(contact.name);
    distribution[gender]++;
  }

  const total = contacts.length;
  
  return {
    counts: distribution,
    percentages: {
      Masculino: total > 0 ? (distribution.Masculino / total) * 100 : 0,
      Feminino: total > 0 ? (distribution.Feminino / total) * 100 : 0,
      Indefinido: total > 0 ? (distribution.Indefinido / total) * 100 : 0,
    },
    total,
  };
}
