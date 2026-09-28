import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, FileText, Lock, Cookie, RefreshCw, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

const TERMS_VERSION = "1.0";
const TERMS_STORAGE_KEY = "griot_terms_accepted_v1";

export function checkTermsAccepted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(TERMS_STORAGE_KEY) === "true";
}

export function saveTermsAccepted() {
  if (typeof window !== "undefined") {
    localStorage.setItem(TERMS_STORAGE_KEY, "true");
    localStorage.setItem("griot_terms_accepted_at", new Date().toISOString());
  }
}

export function TermsDialog({
  forceOpen = false,
  allowDismiss = false,
  onClose,
}: {
  forceOpen?: boolean;
  allowDismiss?: boolean;
  onClose?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "terms" | "privacy" | "cookies" | "refund" | "ai" | "security"
  >("terms");

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      return;
    }
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/auth")) {
      return;
    }
    // Primeiro vem o Login; só exibe termos se já houver sessão autenticada real
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user && !checkTermsAccepted()) {
        setOpen(true);
      }
    });
  }, [forceOpen]);

  async function handleAccept() {
    saveTermsAccepted();

    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        await (supabase as any)
          .from("profiles")
          .update({
            terms_accepted_at: new Date().toISOString(),
            terms_version: TERMS_VERSION,
          })
          .eq("id", data.user.id)
          .catch(() => null);
      }
    } catch {
      // Ignora erro offline
    }

    toast.success(t("Termos e Condições aceites!"));
    setOpen(false);
    if (onClose) onClose();
  }

  if (!open) return null;

  const tabs = [
    { id: "terms" as const, label: "Termos", icon: FileText },
    { id: "privacy" as const, label: "Privacidade", icon: Lock },
    { id: "cookies" as const, label: "Cookies", icon: Cookie },
    { id: "refund" as const, label: "Reembolso", icon: RefreshCw },
    { id: "ai" as const, label: "IA & Conteúdo", icon: Sparkles },
    { id: "security" as const, label: "Segurança", icon: ShieldCheck },
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4">
      <div className="flex h-[92vh] sm:h-[85vh] w-full max-w-xl flex-col rounded-t-[28px] sm:rounded-[28px] border border-white/[0.06] bg-[#0e0e10] p-5 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-2xl bg-white/[0.06] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight text-white">
                {t("Termos & Condições")}
              </h2>
              <p className="text-[11.5px] font-mono text-white/40">
                GRIOT Mobile · v{TERMS_VERSION} · 1 de setembro de 2026
              </p>
            </div>
          </div>
          {forceOpen && allowDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-xl bg-white/[0.06] text-white/60 hover:text-white transition-colors text-[18px]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tab Pill Bar */}
        <div className="mt-3 flex shrink-0 gap-1 overflow-x-auto no-scrollbar rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all shrink-0 ${
                  isActive
                    ? "bg-white text-black font-semibold"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="mt-3 flex-1 overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[13px] leading-relaxed text-white/80 space-y-4">
          {activeTab === "terms" && <TermsContent />}
          {activeTab === "privacy" && <PrivacyContent />}
          {activeTab === "cookies" && <CookiesContent />}
          {activeTab === "refund" && <RefundContent />}
          {activeTab === "ai" && <AiContent />}
          {activeTab === "security" && <SecurityContent />}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] shrink-0 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="size-4 rounded border-white/20 bg-white/[0.06] text-white accent-white"
            />
            <span className="text-[13px] text-white/90 font-medium">
              {t("Li e aceito os Termos e Condições e Políticas do GRIOT Mobile")}
            </span>
          </label>

          <button
            type="button"
            onClick={allowDismiss ? onClose : () => void handleAccept()}
            disabled={!allowDismiss && !accepted}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[14.5px] font-semibold text-black transition-transform active:scale-[0.98] disabled:opacity-30"
          >
            <Check className="size-4" />
            {allowDismiss ? t("Fechar") : t("Aceitar e Continuar")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── LEGAL SECTION COMPONENTS ─────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-bold text-white">{children}</h3>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <h4 className="font-semibold text-white/90 text-[13.5px] pt-1">{children}</h4>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-white/70 text-[13px] leading-relaxed">{children}</p>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-white/70 text-[13px]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/* ─── TERMOS E CONDIÇÕES ───────────────────────────────────────── */

function TermsContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>TERMOS E CONDIÇÕES DE UTILIZAÇÃO — GRIOT MOBILE</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 1 de setembro de 2026 · Versão 1.0
      </p>

      <SectionSubtitle>1. Aceitação dos Termos</SectionSubtitle>
      <Paragraph>
        Ao criar uma conta, aceder ou utilizar o GRIOT Mobile, o utilizador declara que leu,
        compreendeu e aceita estes Termos e Condições. Se o utilizador não concordar com estes
        Termos, não deverá utilizar o GRIOT. Algumas funcionalidades poderão estar sujeitas a
        condições adicionais, que serão apresentadas antes da sua utilização.
      </Paragraph>

      <SectionSubtitle>2. O GRIOT</SectionSubtitle>
      <Paragraph>
        O GRIOT é uma plataforma de software que disponibiliza ferramentas de inteligência
        artificial para auxiliar os utilizadores em tarefas como análise, escrita, programação,
        pesquisa, criação de ideias, desenvolvimento de projetos e outras atividades. O GRIOT poderá
        disponibilizar acesso a diferentes modelos de inteligência artificial e a funcionalidades
        que utilizem um ou vários modelos em simultâneo.
      </Paragraph>

      <SectionSubtitle>3. Conta do Utilizador</SectionSubtitle>
      <Paragraph>
        O utilizador é responsável por manter as suas credenciais seguras e por todas as atividades
        realizadas na sua conta. O utilizador não deverá partilhar a sua palavra-passe ou conceder
        acesso à sua conta a terceiros não autorizados. O GRIOT reserva-se o direito de suspender ou
        encerrar contas que violem estes Termos.
      </Paragraph>

      <SectionSubtitle>4. Elegibilidade</SectionSubtitle>
      <Paragraph>
        O utilizador deve ter pelo menos 16 anos de idade e capacidade legal para celebrar
        contratos. Ao utilizar o GRIOT, o utilizador declara que cumpre estes requisitos.
      </Paragraph>

      <SectionSubtitle>5. Inteligência Artificial e Limitações</SectionSubtitle>
      <Paragraph>
        O GRIOT utiliza tecnologias de inteligência artificial que podem produzir resultados
        incorretos, incompletos ou desatualizados. O utilizador deve avaliar criticamente todos os
        resultados antes de tomar decisões com impacto significativo. O GRIOT não garante a
        precisão, fiabilidade ou adequação de qualquer conteúdo gerado por IA.
      </Paragraph>

      <SectionSubtitle>6. Propriedade Intelectual</SectionSubtitle>
      <Paragraph>
        O software, design, marcas e toda a propriedade intelectual do GRIOT pertencem aos seus
        criadores e licenciantes. O conteúdo criado pelo utilizador com o auxílio do GRIOT pertence
        ao utilizador, sujeito às limitações impostas pelos modelos de IA utilizados.
      </Paragraph>

      <SectionSubtitle>7. Planos e Pagamentos</SectionSubtitle>
      <Paragraph>
        O GRIOT pode disponibilizar planos gratuitos e pagos. Os preços, funcionalidades e limites
        de cada plano serão apresentados ao utilizador antes da subscrição. Os pagamentos são
        processados por fornecedores terceiros e estão sujeitos às suas condições.
      </Paragraph>

      <SectionSubtitle>8. Créditos GRIOT (GCU)</SectionSubtitle>
      <Paragraph>
        O GRIOT poderá utilizar um sistema de créditos internos (GCU — GRIOT Credit Units) para
        gerir o acesso a determinadas funcionalidades. Os GCU não têm valor monetário fora da
        plataforma e não são reembolsáveis exceto nas condições previstas na Política de Reembolso.
      </Paragraph>

      <SectionSubtitle>9. Chaves de API</SectionSubtitle>
      <Paragraph>
        O utilizador poderá configurar as suas próprias chaves de API para aceder a modelos de IA
        externos. O GRIOT não armazena chaves de API em texto legível e utiliza encriptação para
        proteger estas credenciais. O utilizador é responsável pelos custos associados à utilização
        das suas próprias chaves de API.
      </Paragraph>

      <SectionSubtitle>10. Utilização Proibida</SectionSubtitle>
      <Paragraph>É estritamente proibido utilizar o GRIOT para:</Paragraph>
      <BulletList
        items={[
          "Atividades ilegais, fraude ou engano",
          "Violação de privacidade ou direitos de terceiros",
          "Distribuição de malware, vírus ou código malicioso",
          "Ataques cibernéticos, DDoS ou tentativas de intrusão",
          "Geração de conteúdo difamatório, discriminatório ou ilegal",
          "Engenharia reversa do software ou dos modelos de IA",
          "Circumvenção de limites de utilização ou sistemas de segurança",
        ]}
      />

      <SectionSubtitle>11. Suspensão e Encerramento</SectionSubtitle>
      <Paragraph>
        O GRIOT reserva-se o direito de suspender ou encerrar o acesso do utilizador, com ou sem
        aviso prévio, em caso de violação destes Termos, utilização abusiva, ou por motivos legais
        ou de segurança.
      </Paragraph>

      <SectionSubtitle>12. Limitação de Responsabilidade</SectionSubtitle>
      <Paragraph>
        O GRIOT é fornecido "tal como está" (as is). Na máxima extensão permitida por lei, o GRIOT
        não será responsável por danos diretos, indiretos, incidentais, especiais ou consequenciais
        resultantes da utilização ou impossibilidade de utilização da plataforma.
      </Paragraph>

      <SectionSubtitle>13. Alterações aos Termos</SectionSubtitle>
      <Paragraph>
        O GRIOT poderá atualizar estes Termos a qualquer momento. As alterações serão comunicadas
        através da plataforma e/ou por e-mail. A continuação do uso da plataforma após as alterações
        constitui aceitação dos novos Termos.
      </Paragraph>

      <SectionSubtitle>14. Lei Aplicável e Jurisdição</SectionSubtitle>
      <Paragraph>
        Estes Termos são regidos pela legislação aplicável no país de residência do utilizador, sem
        prejuízo das disposições obrigatórias do Regulamento Geral sobre a Proteção de Dados (RGPD)
        e demais legislação europeia aplicável.
      </Paragraph>

      <SectionSubtitle>15. Contacto</SectionSubtitle>
      <Paragraph>
        Para questões relacionadas com estes Termos, o utilizador poderá contactar a equipa GRIOT
        através dos canais de suporte disponíveis na plataforma.
      </Paragraph>
    </div>
  );
}

/* ─── POLÍTICA DE PRIVACIDADE ──────────────────────────────────── */

function PrivacyContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>POLÍTICA DE PRIVACIDADE E UTILIZAÇÃO DE DADOS</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 23 de setembro de 2026
      </p>

      <SectionSubtitle>1. Responsável pelo Tratamento de Dados</SectionSubtitle>
      <Paragraph>
        O responsável pelo tratamento dos dados pessoais recolhidos é a entidade que opera o GRIOT
        Mobile.
      </Paragraph>

      <SectionSubtitle>2. Dados Recolhidos</SectionSubtitle>
      <Paragraph>O GRIOT poderá recolher os seguintes dados:</Paragraph>
      <BulletList
        items={[
          "Dados de registo: nome, e-mail, palavra-passe (hash)",
          "Dados de utilização: interações com a plataforma, preferências, histórico de conversas",
          "Dados técnicos: endereço IP, tipo de dispositivo, sistema operativo, versão da app",
          "Dados de pagamento: processados por fornecedores terceiros (Stripe, etc.)",
          "Dados de publicidade: identificadores do dispositivo, interações com anúncios e escolhas de consentimento, quando aplicável",
        ]}
      />

      <SectionSubtitle>3. Finalidades do Tratamento</SectionSubtitle>
      <BulletList
        items={[
          "Prestação e melhoria dos serviços GRIOT",
          "Autenticação e segurança da conta do utilizador",
          "Comunicações relevantes sobre o serviço",
          "Análise agregada e anónima para melhoria do produto",
          "Apresentação, medição e prevenção de fraude em anúncios através do Google AdMob",
          "Cumprimento de obrigações legais",
        ]}
      />

      <SectionSubtitle>4. Base Legal</SectionSubtitle>
      <Paragraph>
        O tratamento de dados pessoais é realizado com base no consentimento do utilizador, na
        execução do contrato de utilização, nos interesses legítimos do GRIOT e no cumprimento de
        obrigações legais, conforme o RGPD (Regulamento UE 2016/679).
      </Paragraph>

      <SectionSubtitle>5. Partilha e Venda de Dados</SectionSubtitle>
      <Paragraph>
        O GRIOT NÃO vende dados pessoais dos utilizadores a terceiros. Os dados poderão ser
        partilhados apenas com fornecedores de serviços essenciais ao funcionamento da plataforma
        (hosting, processamento de pagamentos, modelos de IA e Google AdMob para publicidade),
        sempre com medidas de proteção adequadas. Nas regiões aplicáveis, o consentimento é pedido
        antes da personalização dos anúncios e pode ser alterado nas Definições.
      </Paragraph>

      <SectionSubtitle>6. Direitos do Utilizador (RGPD)</SectionSubtitle>
      <Paragraph>O utilizador tem o direito de:</Paragraph>
      <BulletList
        items={[
          "Acesso: consultar os seus dados pessoais",
          "Retificação: corrigir dados incorretos ou desatualizados",
          'Apagamento: solicitar a eliminação dos seus dados ("direito a ser esquecido")',
          "Portabilidade: receber os seus dados num formato estruturado e legível por máquina",
          "Oposição: opor-se ao tratamento dos seus dados para determinadas finalidades",
          "Limitação: restringir o tratamento dos seus dados em certas circunstâncias",
        ]}
      />

      <SectionSubtitle>7. Retenção de Dados</SectionSubtitle>
      <Paragraph>
        Os dados pessoais serão conservados apenas pelo período necessário para as finalidades
        descritas ou conforme exigido por lei. Após o encerramento da conta, os dados serão
        eliminados num prazo razoável, exceto quando a sua conservação seja legalmente obrigatória.
      </Paragraph>

      <SectionSubtitle>8. Segurança dos Dados</SectionSubtitle>
      <Paragraph>
        O GRIOT implementa medidas técnicas e organizacionais adequadas para proteger os dados
        pessoais, incluindo encriptação em trânsito (TLS) e em repouso, controlo de acessos, e
        auditorias regulares.
      </Paragraph>
    </div>
  );
}

/* ─── POLÍTICA DE COOKIES ──────────────────────────────────────── */

function CookiesContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>POLÍTICA DE COOKIES — GRIOT</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 1 de setembro de 2026
      </p>

      <SectionSubtitle>1. O que são Cookies?</SectionSubtitle>
      <Paragraph>
        Cookies são pequenos ficheiros de texto armazenados no dispositivo do utilizador quando este
        acede a um website ou aplicação web. São amplamente utilizados para melhorar a experiência
        do utilizador.
      </Paragraph>

      <SectionSubtitle>2. Cookies Utilizados pelo GRIOT</SectionSubtitle>

      <SectionSubtitle>2.1 Cookies Essenciais</SectionSubtitle>
      <Paragraph>
        Necessários para o funcionamento básico da plataforma: autenticação (sessão Supabase),
        preferências de idioma e tema, e tokens de segurança (CSRF).
      </Paragraph>

      <SectionSubtitle>2.2 Cookies de Desempenho</SectionSubtitle>
      <Paragraph>
        Utilizados para recolher informações anónimas sobre como os utilizadores interagem com a
        plataforma, ajudando a melhorar o desempenho e a experiência.
      </Paragraph>

      <SectionSubtitle>2.3 Cookies de Funcionalidade</SectionSubtitle>
      <Paragraph>
        Permitem que a plataforma se lembre das escolhas do utilizador (modelo de IA preferido,
        configurações de interface) para proporcionar uma experiência personalizada.
      </Paragraph>

      <SectionSubtitle>3. Gestão de Cookies</SectionSubtitle>
      <Paragraph>
        O utilizador pode gerir as suas preferências de cookies através das definições do navegador.
        A desativação de cookies essenciais poderá afetar o funcionamento da plataforma.
      </Paragraph>

      <SectionSubtitle>4. Armazenamento Local (localStorage)</SectionSubtitle>
      <Paragraph>
        O GRIOT utiliza localStorage para armazenar preferências do utilizador, cache de traduções e
        dados temporários. Estes dados permanecem no dispositivo do utilizador e não são
        transmitidos a servidores.
      </Paragraph>
    </div>
  );
}

/* ─── POLÍTICA DE REEMBOLSO ────────────────────────────────────── */

function RefundContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>POLÍTICA DE REEMBOLSO — GRIOT</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 1 de setembro de 2026
      </p>

      <SectionSubtitle>1. Elegibilidade para Reembolso</SectionSubtitle>
      <Paragraph>
        Os pedidos de reembolso são analisados caso a caso. O utilizador poderá solicitar reembolso
        nos seguintes casos:
      </Paragraph>
      <BulletList
        items={[
          "Cobrança duplicada ou erro de faturação",
          "Impossibilidade técnica comprovada de utilizar o serviço",
          "Cancelamento dentro do período legal de reflexão (14 dias para consumidores na UE)",
        ]}
      />

      <SectionSubtitle>2. Casos de Não Reembolso</SectionSubtitle>
      <BulletList
        items={[
          "Créditos GRIOT (GCU) já consumidos",
          "Subscrições após o período de reflexão, salvo falha técnica comprovada",
          "Insatisfação com os resultados da IA (a qualidade pode variar)",
          "Violação dos Termos de Utilização que resultou em suspensão da conta",
        ]}
      />

      <SectionSubtitle>3. Como Solicitar</SectionSubtitle>
      <Paragraph>
        O utilizador deve contactar o suporte GRIOT através dos canais disponíveis na plataforma,
        indicando o motivo do pedido e incluindo comprovativo de pagamento. Os pedidos serão
        analisados num prazo de até 10 dias úteis.
      </Paragraph>

      <SectionSubtitle>4. Processamento do Reembolso</SectionSubtitle>
      <Paragraph>
        Os reembolsos aprovados serão processados através do mesmo método de pagamento original num
        prazo de 5 a 14 dias úteis, dependendo do fornecedor de pagamento.
      </Paragraph>
    </div>
  );
}

/* ─── POLÍTICA DE CONTEÚDO E IA ────────────────────────────────── */

function AiContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>POLÍTICA DE CONTEÚDO E INTELIGÊNCIA ARTIFICIAL</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 1 de setembro de 2026
      </p>

      <SectionSubtitle>1. Conteúdo Gerado por IA</SectionSubtitle>
      <Paragraph>
        O GRIOT utiliza sistemas multi-modelo de inteligência artificial. O conteúdo gerado é
        auxiliar e não constitui aconselhamento profissional, jurídico, médico ou financeiro. O
        utilizador é integralmente responsável pela avaliação, verificação e utilização dos
        conteúdos gerados.
      </Paragraph>

      <SectionSubtitle>2. Precisão e Fiabilidade</SectionSubtitle>
      <Paragraph>
        Os modelos de IA podem produzir "alucinações" — informações que parecem corretas mas são
        factualmente incorretas. O GRIOT recomenda a verificação independente de qualquer informação
        crítica gerada pela plataforma.
      </Paragraph>

      <SectionSubtitle>3. Conteúdo Proibido</SectionSubtitle>
      <Paragraph>O utilizador não deverá utilizar o GRIOT para gerar:</Paragraph>
      <BulletList
        items={[
          "Conteúdo ilegal, violento, de abuso sexual ou exploração de menores",
          "Desinformação ou propaganda maliciosa",
          "Material que viole direitos de propriedade intelectual de terceiros",
          "Conteúdo discriminatório com base em raça, género, orientação sexual, religião ou deficiência",
          "Instruções para atividades perigosas ou ilegais (fabrico de armas, drogas, explosivos)",
        ]}
      />

      <SectionSubtitle>4. Dados de Treino</SectionSubtitle>
      <Paragraph>
        O GRIOT não utiliza as conversas dos utilizadores para treinar modelos de IA proprietários,
        salvo quando o utilizador optar expressamente por contribuir para a melhoria do serviço. Os
        modelos de IA de terceiros (Google, OpenAI, Anthropic) estão sujeitos às suas próprias
        políticas de dados.
      </Paragraph>

      <SectionSubtitle>5. Moderação</SectionSubtitle>
      <Paragraph>
        O GRIOT reserva-se o direito de implementar filtros de conteúdo e sistemas de moderação
        automática para prevenir a geração de conteúdo proibido. O utilizador não deverá tentar
        contornar estes sistemas.
      </Paragraph>
    </div>
  );
}

/* ─── POLÍTICA DE SEGURANÇA ────────────────────────────────────── */

function SecurityContent() {
  return (
    <div className="space-y-4">
      <SectionTitle>POLÍTICA DE SEGURANÇA — GRIOT</SectionTitle>
      <p className="text-[11.5px] font-mono text-white/40">
        Última atualização: 1 de setembro de 2026
      </p>

      <SectionSubtitle>1. Infraestrutura e Hosting</SectionSubtitle>
      <Paragraph>
        O GRIOT utiliza infraestrutura cloud com servidores na União Europeia (eu-central-1) através
        do Supabase, com encriptação em repouso e em trânsito, backups regulares e redundância
        geográfica.
      </Paragraph>

      <SectionSubtitle>2. Autenticação e Controlo de Acessos</SectionSubtitle>
      <BulletList
        items={[
          "Autenticação segura via Supabase Auth (e-mail/palavra-passe, OAuth)",
          "Tokens JWT com expiração configurada",
          "Row Level Security (RLS) na base de dados",
          "Suporte para autenticação biométrica no dispositivo",
        ]}
      />

      <SectionSubtitle>3. Encriptação</SectionSubtitle>
      <BulletList
        items={[
          "TLS 1.3 para todas as comunicações cliente-servidor",
          "Encriptação AES-256 para dados sensíveis em repouso",
          "Chaves de API encriptadas antes do armazenamento",
          "HMAC SHA-256 para validação de integridade de pedidos internos",
        ]}
      />

      <SectionSubtitle>4. Proteção contra Ameaças</SectionSubtitle>
      <BulletList
        items={[
          "Content Security Policy (CSP) restritiva",
          "Headers de segurança: HSTS, X-Frame-Options, X-Content-Type-Options",
          "Rate limiting por IP e por utilizador",
          "Sanitização de inputs contra XSS e injeção",
          "Validação de payloads com limite de tamanho (256 KB)",
        ]}
      />

      <SectionSubtitle>5. Execução de Código</SectionSubtitle>
      <Paragraph>
        A funcionalidade de execução de código do GRIOT opera em ambientes sandboxed isolados com:
      </Paragraph>
      <BulletList
        items={[
          "Validação de assinatura HMAC para cada pedido",
          "Verificação de timestamp (skew máximo de 5 minutos)",
          "Canonicalização de paths para prevenir Path Traversal",
          "Filtros de comandos perigosos (rm -rf /, git push --force, etc.)",
        ]}
      />

      <SectionSubtitle>6. Comunicação de Vulnerabilidades</SectionSubtitle>
      <Paragraph>
        Se o utilizador descobrir uma vulnerabilidade de segurança, deve reportá-la através dos
        canais oficiais de segurança do GRIOT. Não publique vulnerabilidades antes de serem
        corrigidas. O GRIOT compromete-se a analisar e responder a relatórios de segurança de
        boa-fé.
      </Paragraph>

      <SectionSubtitle>7. Incidentes de Segurança</SectionSubtitle>
      <Paragraph>
        Em caso de violação de dados, o GRIOT notificará os utilizadores afetados e as autoridades
        competentes nos prazos legais (72 horas conforme o RGPD), implementará medidas corretivas
        imediatas e disponibilizará informação sobre as ações tomadas.
      </Paragraph>
    </div>
  );
}
