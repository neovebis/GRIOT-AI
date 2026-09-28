/**
 * GRIOT Plugin OAuth & Advanced Account Authorization Engine
 *
 * Provides 1-click "Login with Account & Authorize GRIOT" (OAuth 2.0 PKCE / Supabase Provider OAuth)
 * for official integrated plugins (GitHub, GitLab, Google Drive, Discord, Slack, Notion, Linear, Spotify, Supabase).
 *
 * Grants real advanced permissions (e.g. repo, workflow, write, drive, channels)
 * without requiring users to manually generate, copy, or paste API keys.
 */

import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { validatePluginCredentials, type ValidationResult } from "./plugin-validators";
import { connectPluginUnified, type PluginDefinition } from "./plugins-service";

export interface PluginOAuthSpec {
  pluginId: string;
  provider: string;
  displayName: string;
  badge: string;
  scopes: string[];
  scopeLabels: string[];
  advancedFeatures: string[];
  directTokenPresetUrl?: string;
}

export const PLUGIN_OAUTH_REGISTRY: Record<string, PluginOAuthSpec> = {
  github: {
    pluginId: "github",
    provider: "github",
    displayName: "GitHub",
    badge: "OAuth 2.0 + GitHub Apps",
    scopes: ["repo", "read:user", "user:email", "workflow", "read:org", "gist"],
    scopeLabels: [
      "repo: Controlo total de repositórios públicos e privados",
      "workflow: Leitura e escrita de workflows do GitHub Actions",
      "read:user: Identificação do teu utilizador e perfil",
      "read:org: Acesso a organizações e equipas autorizadas",
      "gist: Criação e leitura de gists de código",
    ],
    advancedFeatures: [
      "Commit e escrita direta de código nos teus repositórios",
      "Criação e aprovação de Pull Requests e resolução de conflitos",
      "Inspeção e disparo de pipelines CI/CD do GitHub Actions",
      "Acesso seguro a repositórios privados da tua organização",
    ],
    directTokenPresetUrl:
      "https://github.com/settings/tokens/new?description=GRIOT%20Mobile%20Advanced%20OAuth&scopes=repo,workflow,read:org,read:user,user:email,gist",
  },
  gitlab: {
    pluginId: "gitlab",
    provider: "gitlab",
    displayName: "GitLab",
    badge: "OAuth 2.0 GitLab",
    scopes: ["api", "read_user", "read_repository", "write_repository"],
    scopeLabels: [
      "api: Acesso completo à API do GitLab",
      "read_repository / write_repository: Leitura e escrita no Git",
      "read_user: Perfil e autenticação da conta",
    ],
    advancedFeatures: [
      "Gestão de Merge Requests e pipelines CI/CD",
      "Push de commits e branches em repositórios GitLab",
      "Sincronização de ficheiros em grupos e sub-projetos",
    ],
  },
  google_drive: {
    pluginId: "google_drive",
    provider: "google",
    displayName: "Google Drive & Workspace",
    badge: "Google OAuth 2.0",
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    scopeLabels: [
      "drive: Pesquisa, leitura, upload e criação de ficheiros",
      "profile & email: Identificação da tua conta Google",
    ],
    advancedFeatures: [
      "Pesquisa profunda em pastas e ficheiros do Google Drive",
      "Criação de novos ficheiros e leitura de conteúdo",
      "Sincronização com o ecossistema Google Workspace",
    ],
  },
  google_sheets: {
    pluginId: "google_sheets",
    provider: "google",
    displayName: "Google Sheets",
    badge: "Google OAuth 2.0",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    scopeLabels: [
      "spreadsheets: Leitura e escrita em planilhas Google Sheets",
      "profile & email: Identificação da conta",
    ],
    advancedFeatures: [
      "Leitura e inserção de linhas e tabelas em tempo real",
      "Formatação e criação de relatórios analíticos",
    ],
  },
  google_analytics: {
    pluginId: "google_analytics",
    provider: "google",
    displayName: "Google Analytics (GA4)",
    badge: "Google OAuth 2.0",
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    scopeLabels: ["analytics.readonly: Consulta de métricas e relatórios GA4"],
    advancedFeatures: [
      "Consulta de utilizadores ativos e eventos em tempo real",
      "Relatórios de conversão e audiências",
    ],
  },
  discord: {
    pluginId: "discord",
    provider: "discord",
    displayName: "Discord",
    badge: "Discord OAuth 2.0",
    scopes: ["identify", "email", "guilds", "bot", "messages.read"],
    scopeLabels: [
      "identify & email: Identificação da tua conta Discord",
      "guilds: Servidores que geres ou participas",
      "bot: Capacidade de interagir em canais autorizados",
    ],
    advancedFeatures: [
      "Envio de alertas de deploys e relatórios no Discord",
      "Interação com canais de texto e threads",
    ],
  },
  slack: {
    pluginId: "slack",
    provider: "slack",
    displayName: "Slack",
    badge: "Slack OAuth 2.0",
    scopes: ["channels:read", "chat:write", "chat:write.public", "users:read"],
    scopeLabels: [
      "chat:write: Publicação de mensagens e alertas",
      "channels:read: Listagem de canais públicos e de equipa",
      "users:read: Mapeamento de membros da workspace",
    ],
    advancedFeatures: [
      "Notificações ricas com blocos interativos em canais",
      "Alertas automáticos de status e conclusão de tarefas",
    ],
  },
  notion: {
    pluginId: "notion",
    provider: "notion",
    displayName: "Notion",
    badge: "Notion OAuth",
    scopes: ["read_content", "update_content", "insert_content"],
    scopeLabels: [
      "insert_content / update_content: Criação e edição de páginas",
      "read_content: Leitura de blocos e bases de dados Notion",
    ],
    advancedFeatures: [
      "Criação automática de páginas de documentação",
      "Consultas e adições em bases de dados relacionais",
    ],
  },
  linear: {
    pluginId: "linear",
    provider: "linear",
    displayName: "Linear",
    badge: "Linear OAuth",
    scopes: ["read", "write", "issues:create"],
    scopeLabels: [
      "write & issues:create: Criação e atualização de tickets",
      "read: Leitura de roadmaps, ciclos e tarefas",
    ],
    advancedFeatures: [
      "Abertura automática de bugs e histórias de utilizador",
      "Atualização de progresso nos sprints da equipa",
    ],
  },
  spotify: {
    pluginId: "spotify",
    provider: "spotify",
    displayName: "Spotify",
    badge: "Spotify OAuth 2.0",
    scopes: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "playlist-read-private",
      "playlist-modify-public",
    ],
    scopeLabels: [
      "user-modify-playback-state: Controlo de reprodução de áudio",
      "playlist-modify: Criação e edição de playlists",
    ],
    advancedFeatures: [
      "Controlo de reprodução e faixas em tempo real",
      "Geração de playlists contextuais por IA",
    ],
  },
  supabase: {
    pluginId: "supabase",
    provider: "supabase",
    displayName: "Supabase",
    badge: "Supabase Management OAuth",
    scopes: ["all"],
    scopeLabels: ["all: Gestão completa de projetos, bases de dados SQL, Storage e Edge Functions"],
    advancedFeatures: [
      "Execução de queries SQL e migrações no PostgreSQL",
      "Listagem e sincronização automática de projetos ativos",
      "Gestão de buckets de Storage e utilizadores de autenticação",
    ],
    directTokenPresetUrl: "https://supabase.com/dashboard/account/tokens",
  },
  vercel: {
    pluginId: "vercel",
    provider: "vercel",
    displayName: "Vercel",
    badge: "Vercel OAuth 2.0",
    scopes: ["deployments", "projects", "domains", "env"],
    scopeLabels: [
      "deployments: Disparo e inspeção de deploys de frontend",
      "projects: Leitura e configuração de projetos e repositórios vinculados",
      "env: Gestão de variáveis de ambiente seguras",
    ],
    advancedFeatures: [
      "Deployments instantâneos de projetos e pré-visualizações",
      "Gestão de variáveis de ambiente e segredos de produção",
      "Configuração de domínios personalizados e SSL",
    ],
    directTokenPresetUrl: "https://vercel.com/account/tokens",
  },
  firebase: {
    pluginId: "firebase",
    provider: "google",
    displayName: "Firebase",
    badge: "Google Cloud / Firebase OAuth",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/datastore",
    ],
    scopeLabels: [
      "cloud-platform: Controlo de recursos do projeto Google Cloud",
      "datastore: Acesso e leitura/escrita no Cloud Firestore",
    ],
    advancedFeatures: [
      "Acesso e queries diretas ao Cloud Firestore",
      "Autenticação e regras de segurança de utilizadores",
      "Sincronização em tempo real de coleções e documentos",
    ],
    directTokenPresetUrl: "https://console.firebase.google.com",
  },
  airtable: {
    pluginId: "airtable",
    provider: "airtable",
    displayName: "Airtable",
    badge: "Airtable OAuth 2.0",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    scopeLabels: [
      "data.records:read / write: Leitura e escrita em tabelas",
      "schema.bases:read: Inspeção de esquemas e campos das bases",
    ],
    advancedFeatures: [
      "Leitura e escrita de registos tabulares em tempo real",
      "Criação de novos campos e inspeção de esquemas de bases",
      "Filtragem e ordenação avançada com visualizações Airtable",
    ],
    directTokenPresetUrl: "https://airtable.com/create/tokens",
  },
  jira: {
    pluginId: "jira",
    provider: "atlassian",
    displayName: "Jira Software",
    badge: "Atlassian Jira OAuth 2.0",
    scopes: ["read:jira-work", "write:jira-work", "read:jira-user"],
    scopeLabels: [
      "read:jira-work: Leitura de tarefas, sprints e projetos",
      "write:jira-work: Criação e atualização de issues",
      "read:jira-user: Perfis de utilizadores do Jira",
    ],
    advancedFeatures: [
      "Consultas JQL avançadas para filtragem de tarefas",
      "Criação, transição de status e fecho de issues e bugs",
      "Atribuição de responsáveis e estimativas de sprint",
    ],
    directTokenPresetUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
  },
  trello: {
    pluginId: "trello",
    provider: "atlassian",
    displayName: "Trello",
    badge: "Atlassian Trello Connect",
    scopes: ["read", "write", "account"],
    scopeLabels: [
      "read / write: Leitura e criação de quadros, listas e cartões",
      "account: Identificação do membro",
    ],
    advancedFeatures: [
      "Criação e movimentação de cartões em quadros Kanban",
      "Gestão de listas de tarefas, checklists e prazos",
      "Comentários e atribuição automática de membros",
    ],
    directTokenPresetUrl: "https://trello.com/power-ups/admin",
  },
  sentry: {
    pluginId: "sentry",
    provider: "sentry",
    displayName: "Sentry",
    badge: "Sentry OAuth 2.0",
    scopes: ["project:read", "project:write", "event:read", "org:read"],
    scopeLabels: [
      "event:read: Acesso a detalhes de falhas e stacktraces",
      "project:read: Mapeamento de projetos monitorizados",
      "org:read: Informações da organização Sentry",
    ],
    advancedFeatures: [
      "Rastreio em tempo real de exceções e erros de produção",
      "Inspeção de stacktraces detalhados e contexto de utilizadores",
      "Resolução e atribuição automática de issues aos devs",
    ],
    directTokenPresetUrl: "https://sentry.io/settings/account/api/auth-tokens/",
  },
  figma: {
    pluginId: "figma",
    provider: "figma",
    displayName: "Figma",
    badge: "Figma OAuth 2.0",
    scopes: ["files:read", "file_comments:write"],
    scopeLabels: [
      "files:read: Inspeção de árvores de design, estilos e componentes",
      "file_comments:write: Comentários contextuais em nós de design",
    ],
    advancedFeatures: [
      "Inspeção de ficheiros de design e árvores de componentes",
      "Extração de tokens visuais (cores, tipografia, espaçamentos)",
      "Exportação de assets em PNG/SVG para projetos dos agentes",
    ],
    directTokenPresetUrl: "https://www.figma.com/developers/api#access-tokens",
  },
  canva: {
    pluginId: "canva",
    provider: "canva",
    displayName: "Canva",
    badge: "Canva Connect OAuth 2.0",
    scopes: ["asset:read", "asset:write", "design:content:read"],
    scopeLabels: [
      "asset:read / write: Upload e gestão de assets visuais",
      "design:content:read: Leitura e exportação de artes e designs",
    ],
    advancedFeatures: [
      "Exportação de designs e artes em alta resolução",
      "Gestão de assets visuais, logótipos e imagens da marca",
      "Geração de artes promocionais a partir de templates",
    ],
    directTokenPresetUrl: "https://www.canva.com/developers/",
  },
  cloudflare: {
    pluginId: "cloudflare",
    provider: "cloudflare",
    displayName: "Cloudflare",
    badge: "Cloudflare API Token / OAuth",
    scopes: ["Account:Read", "Workers:Write", "Zone:Read", "DNS:Edit"],
    scopeLabels: [
      "Zone:Read & DNS:Edit: Gestão de zonas e registos DNS",
      "Workers:Write: Deploy de scripts Cloudflare Workers",
    ],
    advancedFeatures: [
      "Gestão de registos DNS e roteamento global de domínios",
      "Deploy e execução de scripts serverless Cloudflare Workers",
      "Purge instantâneo de cache de CDN e proteção DDoS",
    ],
    directTokenPresetUrl: "https://dash.cloudflare.com/profile/api-tokens",
  },
  digitalocean: {
    pluginId: "digitalocean",
    provider: "digitalocean",
    displayName: "DigitalOcean",
    badge: "DigitalOcean OAuth 2.0",
    scopes: ["read", "write"],
    scopeLabels: [
      "read: Leitura de Droplets, volumes e recursos",
      "write: Ações de criação, reboot e gestão de instâncias",
    ],
    advancedFeatures: [
      "Gestão e reinicialização de instâncias e Droplets VPS",
      "Deploy e escalonamento na DigitalOcean App Platform",
      "Inspeção de recursos de rede, load balancers e volumes",
    ],
    directTokenPresetUrl: "https://cloud.digitalocean.com/account/api/tokens",
  },
  huggingface: {
    pluginId: "huggingface",
    provider: "huggingface",
    displayName: "Hugging Face",
    badge: "Hugging Face OAuth 2.0",
    scopes: ["read", "write", "inference-api"],
    scopeLabels: [
      "read: Leitura de modelos e datasets privados",
      "inference-api: Execução de inferência em modelos abertos",
    ],
    advancedFeatures: [
      "Inferência direta em milhares de modelos open-source",
      "Pesquisa de modelos de NLP, visão computacional e áudio",
      "Inspeção de metadados de datasets e repositórios Spaces",
    ],
    directTokenPresetUrl: "https://huggingface.co/settings/tokens",
  },
  stripe: {
    pluginId: "stripe",
    provider: "stripe",
    displayName: "Stripe",
    badge: "Stripe Connect OAuth",
    scopes: ["read_write"],
    scopeLabels: ["read_write: Acesso seguro a clientes, cobranças e checkout"],
    advancedFeatures: [
      "Consulta de saldo real, pagamentos e cobranças recentes",
      "Criação de clientes e sessões de Stripe Checkout",
      "Gestão de planos, faturas e subscrições recorrentes",
    ],
    directTokenPresetUrl: "https://dashboard.stripe.com/apikeys",
  },
  shopify: {
    pluginId: "shopify",
    provider: "shopify",
    displayName: "Shopify",
    badge: "Shopify OAuth 2.0",
    scopes: ["read_products", "write_products", "read_orders"],
    scopeLabels: [
      "read_products: Leitura de catálogo e inventário",
      "read_orders: Acesso a pedidos e dados de vendas",
    ],
    advancedFeatures: [
      "Consulta e atualização de inventário de produtos e variantes",
      "Processamento e inspeção de encomendas de clientes",
      "Criação de novos produtos e gestão de coleções da loja",
    ],
    directTokenPresetUrl: "https://help.shopify.com/manual/apps/custom-apps",
  },
  posthog: {
    pluginId: "posthog",
    provider: "posthog",
    displayName: "PostHog",
    badge: "PostHog Personal API Key",
    scopes: ["user:read", "project:read"],
    scopeLabels: [
      "user:read: Identificação da conta e equipa",
      "project:read: Acesso a eventos, dashboards e flags",
    ],
    advancedFeatures: [
      "Captura e inspeção de eventos de telemetria de produto",
      "Consulta e ativação/desativação de Feature Flags",
      "Análise de funis de conversão e comportamento de utilizadores",
      "Monitorização de tendências e cohorts de utilizadores",
    ],
    directTokenPresetUrl: "https://app.posthog.com/project/settings",
  },
  telegram: {
    pluginId: "telegram",
    provider: "telegram",
    displayName: "Telegram",
    badge: "Telegram Bot & Account Login",
    scopes: ["messages:send", "bot:manage", "files:upload"],
    scopeLabels: [
      "messages:send: Envio de mensagens em canais e chats",
      "bot:manage: Gestão de comandos e webhooks do bot",
      "files:upload: Upload e envio de ficheiros e multimédia",
    ],
    advancedFeatures: [
      "Envio de alertas, relatórios e notificações em canais e grupos",
      "Upload e envio de ficheiros, documentos e imagens",
      "Interação com utilizadores e processamento de comandos de bots",
      "Transmissão de logs de build e status de tarefas em tempo real",
    ],
    directTokenPresetUrl: "https://t.me/BotFather",
  },
  twilio: {
    pluginId: "twilio",
    provider: "twilio",
    displayName: "Twilio / WhatsApp",
    badge: "Twilio Console Login",
    scopes: ["sms:send", "whatsapp:send", "verify:otp"],
    scopeLabels: [
      "sms:send: Envio de SMS transacionais globais",
      "whatsapp:send: Mensagens via WhatsApp Business API",
      "verify:otp: Geração e validação de códigos 2FA/OTP",
    ],
    advancedFeatures: [
      "Envio de SMS global para telemóveis em mais de 180 países",
      "Mensagens interativas via WhatsApp Business API",
      "Verificação de números e envio de códigos OTP/2FA",
      "Notificações de emergência e alertas críticos instantâneos",
    ],
    directTokenPresetUrl: "https://www.twilio.com/console",
  },
  resend: {
    pluginId: "resend",
    provider: "resend",
    displayName: "Resend / SendGrid",
    badge: "Resend Dashboard Login",
    scopes: ["emails:send", "domains:read", "templates:read"],
    scopeLabels: [
      "emails:send: Envio de emails transacionais",
      "domains:read: Verificação de reputação e DNS de domínios",
      "templates:read: Renderização de templates HTML modernos",
    ],
    advancedFeatures: [
      "Envio de emails transacionais com templates HTML modernos",
      "Anexação de relatórios, faturas e ficheiros gerados",
      "Verificação de status de entrega e reputação de domínios",
      "Acompanhamento de métricas de abertura e cliques em tempo real",
    ],
    directTokenPresetUrl: "https://resend.com/api-keys",
  },
  postgresql: {
    pluginId: "postgresql",
    provider: "postgresql",
    displayName: "PostgreSQL / Neon",
    badge: "Neon Serverless Postgres Login",
    scopes: ["projects:read", "databases:read", "sql:execute"],
    scopeLabels: [
      "projects:read: Leitura de instâncias e branches Postgres",
      "databases:read: Inspeção de tabelas e esquemas relacionais",
      "sql:execute: Execução de queries SQL completas e migrações",
    ],
    advancedFeatures: [
      "Execução de queries SQL completas (SELECT, INSERT, UPDATE, DDL)",
      "Branching instantâneo de bases de dados para desenvolvimento",
      "Inspeção de tabelas, índices e esquemas relacionais",
      "Sincronização bidirecional de dados com os agentes GRIOT",
    ],
    directTokenPresetUrl: "https://console.neon.tech/app/settings/api-keys",
  },
  redis: {
    pluginId: "redis",
    provider: "redis",
    displayName: "Redis / Upstash",
    badge: "Upstash Serverless Login",
    scopes: ["databases:read", "keys:read_write", "cache:purge"],
    scopeLabels: [
      "databases:read: Listagem de instâncias Redis ativas",
      "keys:read_write: Comandos GET, SET, HSET e TTL via HTTP",
      "cache:purge: Purge de chaves de sessão e filas de contexto",
    ],
    advancedFeatures: [
      "Comandos Redis de alta velocidade via REST (GET, SET, DEL, EXPIRE)",
      "Caching distribuído de contexto e sessões de agentes",
      "Filas de tarefas e pub/sub de baixa latência",
      "Armazenamento de cache volátil para execução rápida de IA",
    ],
    directTokenPresetUrl: "https://console.upstash.com",
  },
  mongodb: {
    pluginId: "mongodb",
    provider: "mongodb",
    displayName: "MongoDB Atlas",
    badge: "MongoDB Atlas Cloud Login",
    scopes: ["clusters:read", "database:read_write", "indexes:manage"],
    scopeLabels: [
      "clusters:read: Listagem de clusters e deployments Atlas",
      "database:read_write: Operações de documentos BSON/JSON",
      "indexes:manage: Otimização de consultas e pipelines",
    ],
    advancedFeatures: [
      "Consultas NoSQL em coleções MongoDB Atlas",
      "Inserção, atualização e agregação de documentos BSON/JSON",
      "Gestão de índices e pipelines de agregação",
      "Sincronização flexível de esquemas para dados não estruturados",
    ],
    directTokenPresetUrl: "https://cloud.mongodb.com",
  },
  pinecone: {
    pluginId: "pinecone",
    provider: "pinecone",
    displayName: "Pinecone / Qdrant",
    badge: "Pinecone Vector Console Login",
    scopes: ["vectors:upsert", "vectors:query", "indexes:read"],
    scopeLabels: [
      "vectors:upsert: Inserção de vetores e metadados RAG",
      "vectors:query: Pesquisa por similaridade de cosseno",
      "indexes:read: Inspeção de namespaces e métricas de índice",
    ],
    advancedFeatures: [
      "Upsert de vetores e metadados para RAG semântico",
      "Pesquisa por similaridade de cosseno e produto escalar",
      "Filtragem contextual sobre vetores de embeddings",
      "Recuperação de memória de longo prazo para os agentes",
    ],
    directTokenPresetUrl: "https://app.pinecone.io",
  },
  aws: {
    pluginId: "aws",
    provider: "aws",
    displayName: "Amazon Web Services (AWS)",
    badge: "AWS IAM / SSO Login",
    scopes: ["s3:manage", "lambda:invoke", "cloudwatch:read"],
    scopeLabels: [
      "s3:manage: Listagem e gestão de buckets S3",
      "lambda:invoke: Execução de funções serverless AWS Lambda",
      "cloudwatch:read: Consulta de métricas e alarmes CloudWatch",
    ],
    advancedFeatures: [
      "Listagem e gestão de ficheiros e permissões em buckets S3",
      "Invocação e monitorização de funções serverless AWS Lambda",
      "Consulta de métricas e alarmes no Amazon CloudWatch",
      "Acesso a recursos de infraestrutura corporativa",
    ],
    directTokenPresetUrl: "https://aws.amazon.com/console",
  },
  dockerhub: {
    pluginId: "dockerhub",
    provider: "dockerhub",
    displayName: "Docker Hub",
    badge: "Docker Hub Account Login",
    scopes: ["repo:read", "repo:write", "builds:read"],
    scopeLabels: [
      "repo:read: Listagem de repositórios e tags de imagem",
      "repo:write: Atualização de metadados e tags de imagem",
      "builds:read: Inspeção de estado de builds e webhooks",
    ],
    advancedFeatures: [
      "Inspeção de repositórios de imagens e tags Docker públicas e privadas",
      "Acompanhamento de builds automáticos e webhooks de container",
      "Verificação de vulnerabilidades de segurança e camadas de imagem",
      "Sincronização com registos de containers em pipelines",
    ],
    directTokenPresetUrl: "https://hub.docker.com/settings/security",
  },
};

/**
 * Retorna os detalhes da especificação OAuth de um plugin se suportado
 */
export function getPluginOAuthSpec(pluginId: string): PluginOAuthSpec | undefined {
  const norm = pluginId.toLowerCase().trim();
  return PLUGIN_OAUTH_REGISTRY[norm];
}

/**
 * Verifica se o utilizador já está autenticado na app com o mesmo fornecedor (ex: login com GitHub ou Google)
 */
export async function detectActiveUserSessionProvider(pluginId: string): Promise<{
  hasMatchingSession: boolean;
  providerName: string;
  userEmail?: string;
  userName?: string;
  avatarUrl?: string;
  providerToken?: string;
} | null> {
  const spec = getPluginOAuthSpec(pluginId);
  if (!spec) return null;

  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    const user = session?.user;
    if (!user) return null;

    const userProvider = (user.app_metadata?.provider || "").toLowerCase();
    const matched = userProvider === spec.provider;

    const userName =
      user.user_metadata?.user_name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      undefined;

    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || undefined;

    const savedToken =
      session?.provider_token ||
      localStorage.getItem(`griot_provider_token_${spec.provider}`) ||
      (matched ? localStorage.getItem("griot_provider_token_last") : null) ||
      undefined;

    return {
      hasMatchingSession: matched || Boolean(savedToken),
      providerName: spec.displayName,
      userEmail: user.email,
      userName,
      avatarUrl,
      providerToken: savedToken,
    };
  } catch (err) {
    console.warn("[OAuth] Falha ao inspecionar sessão ativa:", err);
    return null;
  }
}

/**
 * Inicia o fluxo de autorização OAuth abrindo popup ou Custom Tab no dispositivo nativo
 */
export async function startPluginOAuthFlow(
  pluginId: string,
  callbacks: {
    onSuccess: (result: {
      token: string;
      username?: string;
      email?: string;
      avatarUrl?: string;
      scopes?: string[];
      validation: ValidationResult;
    }) => void;
    onError: (errorMessage: string) => void;
  },
): Promise<void> {
  const spec = getPluginOAuthSpec(pluginId);
  if (!spec) {
    callbacks.onError(`O plugin "${pluginId}" não suporta autenticação OAuth.`);
    return;
  }

  const isNative = Capacitor.isNativePlatform();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = isNative
    ? "com.griot.app://oauth-callback"
    : `${origin}/oauth-callback?plugin=${encodeURIComponent(spec.pluginId)}`;

  try {
    const nativeSupabaseProviders = [
      "github",
      "gitlab",
      "google",
      "discord",
      "slack",
      "notion",
      "spotify",
      "bitbucket",
      "azure",
      "apple",
      "twitter",
      "twitch",
    ];

    let authUrl: string | undefined;

    if (nativeSupabaseProviders.includes(spec.provider.toLowerCase())) {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: spec.provider as any,
          options: {
            scopes: spec.scopes.join(" "),
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

        if (!error && data?.url) {
          authUrl = data.url;
        } else if (error) {
          console.warn(`[OAuth] Supabase provider ${spec.provider} not active:`, error.message);
        }
      } catch (e) {
        console.warn(`[OAuth] Supabase OAuth attempt failed:`, e);
      }
    }

    if (!authUrl) {
      if (spec.directTokenPresetUrl) {
        authUrl = spec.directTokenPresetUrl;
      } else {
        throw new Error(`Não foi possível gerar o endereço de autorização para ${spec.displayName}.`);
      }
    }

    // 2. Ambiente Móvel Nativo (Capacitor)
    if (isNative) {
      // Registamos o listener de deep link
      const cleanup = () => {
        window.removeEventListener("griot-oauth-success", onDeepLinkEvent as any);
      };

      const onDeepLinkEvent = async (event: CustomEvent<any>) => {
        cleanup();
        const detail = event.detail || {};
        const token = detail.providerToken || detail.accessToken;
        if (!token) {
          callbacks.onError("Não foi recebido nenhum token de autorização da conta.");
          return;
        }

        await processOAuthToken(pluginId, token, spec, callbacks);
      };

      window.addEventListener("griot-oauth-success", onDeepLinkEvent as any);

      await Browser.open({ url: authUrl, windowName: "_blank" });
      return;
    }

    // 3. Ambiente Web (Popup com postMessage)
    const popupWidth = 620;
    const popupHeight = 720;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;

    const popup = window.open(
      authUrl,
      `griot_oauth_${spec.provider}`,
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
    );

    if (!popup || popup.closed) {
      callbacks.onError(
        "A janela de autorização foi bloqueada pelo teu navegador. Por favor permite popups para este site.",
      );
      return;
    }

    // Listener para o postMessage vindo de /oauth-callback
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "GRIOT_PLUGIN_OAUTH_CALLBACK") {
        window.removeEventListener("message", handleMessage);
        clearInterval(popupCheckInterval);

        const token = event.data.providerToken || event.data.accessToken;
        if (!token) {
          callbacks.onError("Autorização não concluída: token de acesso ausente.");
          return;
        }

        await processOAuthToken(pluginId, token, spec, callbacks);
      }
    };

    window.addEventListener("message", handleMessage);

    // Deteta se o utilizador fechou a popup sem concluir
    const popupCheckInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(popupCheckInterval);
        window.removeEventListener("message", handleMessage);
      }
    }, 1000);
  } catch (err: any) {
    console.error("[OAuth] Erro ao iniciar fluxo:", err);
    callbacks.onError(err.message || "Falha ao iniciar autorização da conta.");
  }
}

/**
 * Valida o token recebido contra as APIs oficiais e grava a conexão avançada
 */
async function processOAuthToken(
  pluginId: string,
  token: string,
  spec: PluginOAuthSpec,
  callbacks: {
    onSuccess: (result: {
      token: string;
      username?: string;
      email?: string;
      avatarUrl?: string;
      scopes?: string[];
      validation: ValidationResult;
    }) => void;
    onError: (errorMessage: string) => void;
  },
) {
  try {
    const validation = await validatePluginCredentials(pluginId, { apiKey: token });

    if (!validation.valid) {
      callbacks.onError(
        validation.message || "A API do fornecedor recusou o token de autorização.",
      );
      return;
    }

    const username = validation.details?.username || undefined;
    const email = validation.details?.email || undefined;
    const accountLabel = username
      ? `${spec.displayName} (@${username})`
      : `${spec.displayName} (Conta Conectada)`;

    // Guarda automaticamente a credencial com validação avançada e método oauth
    await connectPluginUnified(pluginId, {
      apiKey: token,
      accountName: username || email,
      label: accountLabel,
      verifiedAt: new Date().toISOString(),
      validationStatus: "verified",
      validationMessage: `Conexão Ativa via ${spec.displayName} OAuth 2.0.`,
      isPrimary: true,
      authMethod: "oauth",
      oauthScopes: spec.scopes,
      projects: validation.details?.projects,
      projectRef: validation.details?.detectedRef,
      customEndpoint: validation.details?.customEndpoint,
    });

    callbacks.onSuccess({
      token,
      username,
      email,
      avatarUrl: (validation.details as any)?.avatarUrl,
      scopes: spec.scopes,
      validation,
    });
  } catch (err: any) {
    callbacks.onError(err.message || "Erro inesperado ao validar a autorização da conta.");
  }
}
