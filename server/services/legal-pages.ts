type SocialPrivacyPlatform = "facebook" | "instagram" | "twitter";

const platformContent: Record<SocialPrivacyPlatform, {
  title: string;
  heading: string;
  accent: string;
  overview: string;
  collected: string[];
  usage: string[];
  security: string;
  compliance: string;
}> = {
  facebook: {
    title: "Política de Privacidade - Facebook",
    heading: "Política de Privacidade - Integração Facebook",
    accent: "#1877F2",
    overview: "Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma Facebook/Meta para fins de atendimento automatizado e análise de mensagens.",
    collected: [
      "Mensagens enviadas através do Messenger",
      "Identificação do usuário (ID de conta Facebook)",
      "Nome e foto de perfil (se disponível publicamente)",
      "Histórico de conversas e interações",
      "Informações de metadados (timestamps, tipo de interação)",
    ],
    usage: [
      "Fornecer respostas automatizadas através de IA",
      "Melhorar a qualidade do atendimento",
      "Análise estatística e relatórios",
      "Conformidade com requisitos legais",
    ],
    security: "Os dados são armazenados de forma segura com criptografia e são mantidos apenas pelo tempo necessário para fornecer o serviço.",
    compliance: "Esta integração cumpre com as políticas, padrões e diretrizes da Meta/Facebook, incluindo suas políticas de privacidade e plataforma.",
  },
  instagram: {
    title: "Política de Privacidade - Instagram",
    heading: "Política de Privacidade - Integração Instagram",
    accent: "#E4405F",
    overview: "Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma Instagram para fins de atendimento automatizado e gestão de mensagens diretas.",
    collected: [
      "Mensagens diretas (DMs) recebidas",
      "Informações do perfil de usuário",
      "Nome de usuário e identificação",
      "Histórico de conversas",
      "Informações de interação (curtidas, comentários)",
    ],
    usage: [
      "Automatizar respostas a mensagens diretas",
      "Fornecer suporte e atendimento ao cliente",
      "Análise de engajamento",
      "Conformidade regulatória",
    ],
    security: "Todos os dados são armazenados com proteção criptográfica de alta segurança e não são compartilhados com terceiros sem consentimento.",
    compliance: "Esta integração segue rigorosamente as políticas de privacidade, termos de serviço e requisitos de conformidade da Meta/Instagram.",
  },
  twitter: {
    title: "Política de Privacidade - X (Twitter)",
    heading: "Política de Privacidade - Integração X (Twitter)",
    accent: "#000",
    overview: "Esta Política de Privacidade descreve como o Politicall coleta, usa, compartilha e protege dados pessoais ao integrar com a plataforma X (Twitter) para fins de atendimento automatizado e análise de interações.",
    collected: [
      "Mensagens diretas (DMs)",
      "Menções e respostas públicas",
      "Identificação e dados de perfil do usuário",
      "Histórico de conversas",
      "Informações de engajamento e interações",
    ],
    usage: [
      "Fornecer respostas automatizadas através de IA",
      "Monitoramento e análise de menções",
      "Engajamento com audiência",
      "Conformidade com requisitos legais",
    ],
    security: "Os dados são armazenados com padrões de segurança de nível empresarial, incluindo criptografia de ponta a ponta quando aplicável.",
    compliance: "Esta integração está em conformidade com as políticas de privacidade e termos de serviço da plataforma X (antigo Twitter).",
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formattedDate(now = new Date()): string {
  return now.toLocaleDateString("pt-BR");
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
}

function documentShell(title: string, body: string, accent = "#40E0D0", withContainer = true): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; color: #333; background: #f9f9f9; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: ${accent}; border-bottom: 2px solid ${accent}; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .section { margin: 20px 0; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  ${withContainer ? `<div class="container">${body}</div>` : body}
</body>
</html>`;
}

export function renderPrivacyPage(now = new Date()): string {
  return documentShell("Política de Privacidade - Politicall", `
    <h1>Política de Privacidade</h1>
    <p><strong>Plataforma:</strong> Politicall</p>
    <p><strong>Última Atualização:</strong> ${formattedDate(now)}</p>
    <div class="section"><h2>1. Introdução</h2><p>A Politicall está comprometida em proteger a privacidade dos usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais.</p></div>
    <div class="section"><h2>2. Dados Coletados</h2><p>Podemos coletar os seguintes tipos de dados:</p>${list(["Dados de Cadastro: Nome, e-mail, telefone, cargo", "Dados de Redes Sociais: Mensagens, comentários e interações via Facebook, Instagram e Twitter/X", "Dados de Uso: Informações sobre como você utiliza a plataforma", "Dados de Contatos: Informações de eleitores e apoiadores cadastrados"])}</div>
    <div class="section"><h2>3. Uso dos Dados</h2><p>Utilizamos seus dados para fornecer e melhorar nossos serviços, processar atendimento automatizado via IA, gerenciar relacionamento com eleitores, enviar comunicações relevantes e cumprir obrigações legais.</p></div>
    <div class="section"><h2>4. Compartilhamento de Dados</h2><p>Seus dados podem ser compartilhados com plataformas integradas, provedores de IA e autoridades legais quando exigido por lei. Não vendemos seus dados pessoais a terceiros.</p></div>
    <div class="section"><h2>5. Segurança</h2><p>Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia, controle de acesso, monitoramento e backups regulares.</p></div>
    <div class="section"><h2>6. Seus Direitos</h2><p>Você pode solicitar acesso, correção, exclusão, revogação de consentimento e portabilidade de dados conforme a legislação aplicável.</p></div>
    <div class="section"><h2>7. Retenção de Dados</h2><p>Mantemos seus dados pelo tempo necessário para fornecer nossos serviços ou conforme exigido por lei.</p></div>
    <div class="section"><h2>8. Contato</h2><p>E-mail: <a href="mailto:privacidade@politicall.com.br">privacidade@politicall.com.br</a></p></div>
    <div class="footer"><p>&copy; ${now.getFullYear()} Politicall. Todos os direitos reservados.</p></div>
  `);
}

export function renderTermsPage(now = new Date()): string {
  return documentShell("Termos de Serviço - Politicall", `
    <h1>Termos de Serviço</h1>
    <p><strong>Plataforma:</strong> Politicall</p>
    <p><strong>Última Atualização:</strong> ${formattedDate(now)}</p>
    <div class="section"><h2>1. Aceitação dos Termos</h2><p>Ao acessar e usar a plataforma Politicall, você concorda com estes Termos de Serviço.</p></div>
    <div class="section"><h2>2. Descrição do Serviço</h2><p>A Politicall é uma plataforma de gestão política para CRM, atendimento automatizado, demandas, eventos, pesquisas e alianças políticas.</p></div>
    <div class="section"><h2>3. Elegibilidade</h2><p>Você deve ter pelo menos 18 anos, capacidade legal para contratar e fornecer informações verdadeiras e atualizadas.</p></div>
    <div class="section"><h2>4. Uso Aceitável</h2><p>Você concorda em não violar leis, disseminar conteúdo ilegal, interferir na plataforma, acessar dados sem autorização ou usar o serviço para spam e assédio.</p></div>
    <div class="section"><h2>5. Propriedade Intelectual</h2><p>Todo o conteúdo da plataforma, incluindo código, design, textos e marcas, é propriedade da Politicall ou de seus licenciadores.</p></div>
    <div class="section"><h2>6. Limitação de Responsabilidade</h2><p>A Politicall não se responsabiliza por danos indiretos, interrupções fora de controle, conteúdo impreciso gerado por IA ou ações de terceiros.</p></div>
    <div class="section"><h2>7. Rescisão</h2><p>Podemos suspender ou encerrar contas em caso de violação destes termos.</p></div>
    <div class="section"><h2>8. Alterações</h2><p>Podemos modificar estes termos, comunicando alterações significativas por e-mail ou pela plataforma.</p></div>
    <div class="section"><h2>9. Lei Aplicável</h2><p>Estes termos são regidos pelas leis da República Federativa do Brasil.</p></div>
    <div class="section"><h2>10. Contato</h2><p>E-mail: <a href="mailto:contato@politicall.com.br">contato@politicall.com.br</a></p></div>
    <div class="footer"><p>&copy; ${now.getFullYear()} Politicall. Todos os direitos reservados.</p></div>
  `);
}

export function renderSocialPrivacyPage(platform: SocialPrivacyPlatform, accountSlug: string, now = new Date()): string {
  const content = platformContent[platform];
  const safeAccountSlug = escapeHtml(accountSlug);
  return documentShell(content.title, `
    <h1>${content.heading}</h1>
    <p><strong>Conta:</strong> ${safeAccountSlug}</p>
    <p><strong>Data de Atualização:</strong> ${formattedDate(now)}</p>
    <div class="section"><h2>1. Visão Geral</h2><p>${content.overview}</p></div>
    <div class="section"><h2>2. Dados Coletados</h2>${list(content.collected)}</div>
    <div class="section"><h2>3. Uso de Dados</h2>${list(content.usage)}</div>
    <div class="section"><h2>4. Armazenamento e Segurança</h2><p>${content.security}</p></div>
    <div class="section"><h2>5. Direitos dos Usuários</h2><p>Os usuários possuem direitos sobre seus dados pessoais, incluindo acesso, correção, exclusão e portabilidade, conforme garantido pelas leis aplicáveis.</p></div>
    <div class="section"><h2>6. Conformidade</h2><p>${content.compliance}</p></div>
    <div class="section"><h2>7. Contato</h2><p>Para dúvidas sobre privacidade, entre em contato através da plataforma Politicall.</p></div>
  `, content.accent);
}
