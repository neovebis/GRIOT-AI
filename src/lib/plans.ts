export type PlanId = "free" | "lite" | "starter" | "plus" | "pro";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  badge?: string;
  priceMonthly: number;
  originalPriceMonthly?: number;
  savingsMonthly?: string;
  /** Limite interno de GCU por ciclo (nem sempre mostrado ao utilizador). */
  gcu: number;
  gcuLabel: string;
  modelOsLabel: string;
  integrationsLabel: string;
  limits: string[];
  features: string[];
  ctaLabel: string;
  footnote: string;
  /** Mostra anúncios nativos na conversa. */
  showsAds: boolean;
  /** Pode usar o SHEOL sem restrições (no Free só existe 1 utilização de teste). */
  sheolUnlimited: boolean;
}

export const GRIOT_PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Para experimentar o GRIOT sem compromisso.",
    priceMonthly: 0,
    gcu: 5,
    gcuLabel: "5 GCU",
    modelOsLabel: "BASE · SHEOL 1 vez",
    integrationsLabel: "GitHub (leitura)",
    limits: [
      "5 GCU incluídos; ao esgotar, é preciso assinar ou comprar GCU",
      "Modelo BASE disponível",
      "SHEOL apenas 1 vez para experimentar",
      "Com anúncios",
    ],
    features: ["Chat Main e Quick", "Projetos", "Histórico de 7 dias"],
    ctaLabel: "Começar grátis",
    footnote: "Sem cartão. Podes subir de plano a qualquer momento.",
    showsAds: true,
    sheolUnlimited: false,
  },
  {
    id: "lite",
    name: "BASE",
    tagline: "O GRIOT completo, sem anúncios, para o dia a dia.",
    priceMonthly: 7,
    gcu: 150,
    gcuLabel: "150 GCU / mês",
    modelOsLabel: "BASE + SHEOL",
    integrationsLabel: "GitHub, Supabase",
    limits: ["150 GCU por ciclo", "SHEOL incluído", "Sem anúncios"],
    features: ["Tudo do Free", "SHEOL sem restrição de teste", "Histórico de 30 dias"],
    ctaLabel: "Escolher BASE",
    footnote: "Renovação automática. Cancelamento a qualquer momento.",
    showsAds: false,
    sheolUnlimited: true,
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Uso amplo para quem constrói com regularidade.",
    priceMonthly: 12,
    gcu: 250,
    gcuLabel: "Uso amplo",
    modelOsLabel: "BASE + SHEOL",
    integrationsLabel: "GitHub, Supabase, Vercel",
    limits: ["Uso amplo por ciclo", "Sem anúncios"],
    features: ["Tudo do BASE", "Deploys ilimitados", "Apoio por email"],
    ctaLabel: "Escolher Starter",
    footnote: "Renovação automática. Cancelamento a qualquer momento.",
    showsAds: false,
    sheolUnlimited: true,
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Tudo do Starter com 5 vezes mais uso e mais terminal.",
    badge: "Recomendado",
    priceMonthly: 18,
    gcu: 750,
    gcuLabel: "5× mais uso",
    modelOsLabel: "BASE + SHEOL",
    integrationsLabel: "GitHub, Supabase, Vercel, Google Drive",
    limits: ["5× o uso do Starter", "Mais uso do terminal", "Sem anúncios"],
    features: ["Tudo do Starter", "Workspaces partilhados", "Histórico de 90 dias"],
    ctaLabel: "Escolher Plus",
    footnote: "Renovação automática. Cancelamento a qualquer momento.",
    showsAds: false,
    sheolUnlimited: true,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Tudo do Plus com 5 vezes mais uso, prioridade e sandbox avançado.",
    priceMonthly: 40,
    gcu: 1200,
    gcuLabel: "5× o uso do Plus",
    modelOsLabel: "BASE + SHEOL",
    integrationsLabel: "Todas as integrações disponíveis",
    limits: [
      "5× o uso do Plus",
      "Execução prioritária na fila",
      "Sandbox avançado",
      "Ferramentas avançadas",
      "Sem anúncios",
    ],
    features: ["Tudo do Plus", "Auditoria do workspace", "Apoio prioritário"],
    ctaLabel: "Escolher Pro",
    footnote: "Renovação automática. Cancelamento a qualquer momento.",
    showsAds: false,
    sheolUnlimited: true,
  },
];

export function getPlan(id?: string | null): PlanDefinition {
  const key = String(id || "free").toLowerCase();
  return GRIOT_PLANS.find((p) => p.id === key) ?? GRIOT_PLANS[0];
}
