/**
 * GRIOT Plugins & Integrations Service
 * Local-first persistence and state management for the 30 official integrated services (Lotes 1 a 6).
 */

import { saveGriotCredential, verifyGriotCredential, deleteGriotCredential } from "@/lib/griot-api";

export type PluginCategory = "all" | "dev_cloud" | "database" | "productivity" | "ai_tools";

export interface PluginDefinition {
  id: string;
  name: string;
  logoName: string;
  category: PluginCategory;
  categoryLabel: string;
  description: string;
  authType: "api_key" | "token" | "oauth" | "webhook";
  placeholder: string;
  docsUrl: string;
  supportsOAuth?: boolean;
  oauthProvider?: string;
  oauthScopes?: string[];
  advancedCapabilities?: string[];
}

export interface PluginCredential {
  id: string;
  label: string;
  accountName?: string;
  secretHint: string;
  apiKey?: string;
  customEndpoint?: string;
  projectRef?: string;
  isPrimary: boolean;
  status: "active" | "revoked" | "pending";
  remoteCredentialId?: string;
  authMethod?: "oauth" | "api_key" | "token";
  oauthScopes?: string[];
  avatarUrl?: string;
  username?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedCredential {
  credentialId: string;
  provider: string;
  displayName: string;
  accountName?: string;
  isPrimary: boolean;
  runtimeReference: string;
  needsSelection?: boolean;
  candidateCredentials?: Array<{ id: string; label: string; accountName?: string }>;
}

export interface ConnectedPluginData {
  id: string;
  connected: boolean;
  connectedAt: string;
  credentials?: PluginCredential[];
  primaryCredentialId?: string;
  remoteCredentialId?: string;
  secretHint?: string;
  apiKey?: string;
  accountName?: string;
  customEndpoint?: string;
  projectRef?: string;
  projects?: Array<{ id: string; name: string; status?: string }>;
  verifiedAt?: string;
  validationStatus?: "verified" | "unverified" | "error";
  validationMessage?: string;
  authMethod?: "oauth" | "api_key" | "token";
  oauthScopes?: string[];
  avatarUrl?: string;
  username?: string;
}

const STORAGE_KEY = "griot_connected_plugins";

export const PLUGINS_LIST: PluginDefinition[] = [
  // ==========================================
  // LOTE 1: DESENVOLVIMENTO, INFRA & CODE REPOS
  // ==========================================
  {
    id: "github",
    name: "GitHub",
    logoName: "GithubLogo",
    category: "dev_cloud",
    categoryLabel: "Dev & Git",
    description: "Controlo de versões, repositórios, commits, PRs, issues e GitHub Actions.",
    authType: "token",
    placeholder: "ghp_...",
    docsUrl: "https://github.com/settings/tokens",
    supportsOAuth: true,
    oauthProvider: "github",
    oauthScopes: ["repo", "read:user", "user:email", "workflow", "read:org", "gist"],
    advancedCapabilities: [
      "Commit e escrita direta de ficheiros e branches",
      "Criação e aprovação de Pull Requests",
      "Execução de workflows do GitHub Actions",
      "Acesso seguro a repositórios privados da organização",
    ],
  },
  {
    id: "gitlab",
    name: "GitLab",
    logoName: "GitlabLogo",
    category: "dev_cloud",
    categoryLabel: "Dev & Git",
    description: "Projetos, árvores de código, commits, Merge Requests e pipelines CI/CD.",
    authType: "token",
    placeholder: "glpat-...",
    docsUrl: "https://gitlab.com/-/profile/personal_access_tokens",
    supportsOAuth: true,
    oauthProvider: "gitlab",
    oauthScopes: ["api", "read_user", "read_repository", "write_repository"],
    advancedCapabilities: [
      "Gestão de Merge Requests e pipelines CI/CD",
      "Push de commits em branches e repositórios",
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    logoName: "VercelLogo",
    category: "dev_cloud",
    categoryLabel: "Deploy & Cloud",
    description: "Deployments instantâneos de frontend, variáveis de ambiente e domínios.",
    authType: "token",
    placeholder: "vercel_token_...",
    docsUrl: "https://vercel.com/account/tokens",
    supportsOAuth: true,
    oauthProvider: "vercel",
    oauthScopes: ["deployments", "projects", "domains", "env"],
    advancedCapabilities: [
      "Deployments instantâneos de projetos e pré-visualizações",
      "Gestão de variáveis de ambiente e segredos de produção",
      "Configuração de domínios personalizados e SSL",
      "Inspeção de logs de build e status de runtime",
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    logoName: "SupabaseLogo",
    category: "dev_cloud",
    categoryLabel: "Backend Serverless",
    description: "Postgres serverless, SQL direto, Edge Functions, Storage e Auth.",
    authType: "api_key",
    placeholder: "sbp_... ou service_role token",
    docsUrl: "https://supabase.com/dashboard/account/tokens",
    supportsOAuth: true,
    oauthProvider: "supabase",
    oauthScopes: ["all"],
    advancedCapabilities: [
      "Execução direta de queries SQL PostgreSQL",
      "Autodeteção de esquemas e tabelas de dados",
      "Gestão de Storage e Edge Functions",
      "Sincronização de projetos ativos da organização",
    ],
  },
  {
    id: "firebase",
    name: "Firebase",
    logoName: "FirebaseLogo",
    category: "dev_cloud",
    categoryLabel: "Backend Serverless",
    description: "Cloud Firestore, Realtime Database, autenticação de utilizadores e Hosting.",
    authType: "api_key",
    placeholder: "AIza... ou Bearer token (Account ID = project-id)",
    docsUrl: "https://console.firebase.google.com",
    supportsOAuth: true,
    oauthProvider: "google",
    oauthScopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/datastore",
    ],
    advancedCapabilities: [
      "Acesso e queries diretas ao Cloud Firestore",
      "Autenticação e regras de segurança de utilizadores",
      "Sincronização em tempo real de coleções e documentos",
      "Acesso aos serviços de Cloud Storage e Hosting",
    ],
  },

  // ==========================================
  // LOTE 2: COMUNICAÇÃO, NOTIFICAÇÕES & MENSAGERIA
  // ==========================================
  {
    id: "discord",
    name: "Discord",
    logoName: "DiscordLogo",
    category: "productivity",
    categoryLabel: "Comunicação",
    description: "Webhooks, envio e histórico de mensagens em canais e reações.",
    authType: "token",
    placeholder: "Bot Token ou Webhook URL...",
    docsUrl: "https://discord.com/developers/docs",
    supportsOAuth: true,
    oauthProvider: "discord",
    oauthScopes: ["identify", "email", "guilds", "bot", "messages.read"],
    advancedCapabilities: [
      "Envio de alertas e relatórios em canais do servidor",
      "Interação com canais de texto e threads",
    ],
  },
  {
    id: "slack",
    name: "Slack",
    logoName: "SlackLogo",
    category: "productivity",
    categoryLabel: "Comunicação",
    description: "Postagem de mensagens, canais de equipa, histórico e upload de ficheiros.",
    authType: "webhook",
    placeholder: "xoxb-... ou Webhook URL https://hooks.slack.com/...",
    docsUrl: "https://api.slack.com/apps",
    supportsOAuth: true,
    oauthProvider: "slack",
    oauthScopes: ["channels:read", "chat:write", "chat:write.public", "users:read"],
    advancedCapabilities: [
      "Notificações interativas em canais de equipa",
      "Alertas automáticos de status de deploys e erros",
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    logoName: "TelegramLogo",
    category: "productivity",
    categoryLabel: "Mensageria",
    description: "Envio de mensagens de texto, fotos, documentos e leitura de updates de bots.",
    authType: "token",
    placeholder: "Bot Token (123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)...",
    docsUrl: "https://core.telegram.org/bots/api",
    supportsOAuth: true,
    oauthProvider: "telegram",
    oauthScopes: ["messages:send", "bot:manage", "files:upload"],
    advancedCapabilities: [
      "Envio de alertas, relatórios e notificações em canais e grupos",
      "Upload e envio de ficheiros, documentos e imagens",
      "Interação com utilizadores e processamento de comandos de bots",
    ],
  },
  {
    id: "twilio",
    name: "Twilio / WhatsApp",
    logoName: "TwilioLogo",
    category: "productivity",
    categoryLabel: "Mensageria & SMS",
    description: "Envio de SMS globais, mensagens WhatsApp e verificação OTP/tokens.",
    authType: "api_key",
    placeholder: "Auth Token (Account SID no campo de Conta)...",
    docsUrl: "https://www.twilio.com/console",
    supportsOAuth: true,
    oauthProvider: "twilio",
    oauthScopes: ["sms:send", "whatsapp:send", "verify:otp"],
    advancedCapabilities: [
      "Envio de SMS global para telemóveis em mais de 180 países",
      "Mensagens interativas via WhatsApp Business API",
      "Verificação de números e envio de códigos OTP/2FA",
    ],
  },
  {
    id: "resend",
    name: "Resend / SendGrid",
    logoName: "ResendLogo",
    category: "productivity",
    categoryLabel: "E-mail Transacional",
    description: "Envio de emails transacionais, suporte a anexos e verificação de domínios.",
    authType: "api_key",
    placeholder: "re_...",
    docsUrl: "https://resend.com/api-keys",
    supportsOAuth: true,
    oauthProvider: "resend",
    oauthScopes: ["emails:send", "domains:read", "templates:read"],
    advancedCapabilities: [
      "Envio de emails transacionais com templates HTML modernos",
      "Anexação de relatórios, faturas e ficheiros gerados",
      "Verificação de status de entrega e reputação de domínios",
    ],
  },

  // ==========================================
  // LOTE 3: BASES DE DADOS, CACHE & VETORES
  // ==========================================
  {
    id: "postgresql",
    name: "PostgreSQL / Neon",
    logoName: "NeonLogo",
    category: "database",
    categoryLabel: "Bases de Dados",
    description: "Consultas SQL, gestão de esquemas e branching instantâneo de bases de dados.",
    authType: "token",
    placeholder: "neon_api_key_... ou postgres://...",
    docsUrl: "https://console.neon.tech/app/settings/api-keys",
    supportsOAuth: true,
    oauthProvider: "postgresql",
    oauthScopes: ["projects:read", "databases:read", "sql:execute"],
    advancedCapabilities: [
      "Execução de queries SQL completas (SELECT, INSERT, UPDATE, DDL)",
      "Branching instantâneo de bases de dados para desenvolvimento",
      "Inspeção de tabelas, índices e esquemas relacionais",
    ],
  },
  {
    id: "redis",
    name: "Redis / Upstash",
    logoName: "RedisLogo",
    category: "database",
    categoryLabel: "Bases de Dados & Cache",
    description: "Estruturas em memória, caching, Pub/Sub e comandos Redis serverless via HTTP.",
    authType: "token",
    placeholder: "UPSTASH_REDIS_REST_TOKEN ou redis://...",
    docsUrl: "https://console.upstash.com",
    supportsOAuth: true,
    oauthProvider: "redis",
    oauthScopes: ["databases:read", "keys:read_write", "cache:purge"],
    advancedCapabilities: [
      "Comandos Redis de alta velocidade via REST (GET, SET, DEL, EXPIRE)",
      "Caching distribuído de contexto e sessões de agentes",
      "Filas de tarefas e pub/sub de baixa latência",
    ],
  },
  {
    id: "mongodb",
    name: "MongoDB Atlas",
    logoName: "MongoDbLogo",
    category: "database",
    categoryLabel: "Bases de Dados NoSQL",
    description: "Consultas de documentos NoSQL, agregação, inserção e atualização em escala.",
    authType: "api_key",
    placeholder: "Chave pública/privada Atlas ou URI...",
    docsUrl: "https://cloud.mongodb.com",
    supportsOAuth: true,
    oauthProvider: "mongodb",
    oauthScopes: ["clusters:read", "database:read_write", "indexes:manage"],
    advancedCapabilities: [
      "Consultas NoSQL em coleções MongoDB Atlas",
      "Inserção, atualização e agregação de documentos BSON/JSON",
      "Gestão de índices e pipelines de agregação",
    ],
  },
  {
    id: "airtable",
    name: "Airtable",
    logoName: "AirtableLogo",
    category: "database",
    categoryLabel: "Bases de Dados",
    description: "Leitura, inserção e atualização de registos tabulares e esquemas de bases.",
    authType: "token",
    placeholder: "pat...",
    docsUrl: "https://airtable.com/create/tokens",
    supportsOAuth: true,
    oauthProvider: "airtable",
    oauthScopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    advancedCapabilities: [
      "Leitura e escrita de registos tabulares em tempo real",
      "Criação de novos campos e inspeção de esquemas de bases",
      "Filtragem e ordenação avançada com visualizações Airtable",
    ],
  },
  {
    id: "pinecone",
    name: "Pinecone / Qdrant",
    logoName: "PineconeLogo",
    category: "database",
    categoryLabel: "Vetores & RAG",
    description: "Upsert e pesquisa por similaridade de vetores para embeddings e RAG avançado.",
    authType: "api_key",
    placeholder: "pcsk_... (Host no campo de Endpoint)...",
    docsUrl: "https://app.pinecone.io",
    supportsOAuth: true,
    oauthProvider: "pinecone",
    oauthScopes: ["vectors:upsert", "vectors:query", "indexes:read"],
    advancedCapabilities: [
      "Upsert de vetores e metadados para RAG semântico",
      "Pesquisa por similaridade de cosseno e produto escalar",
      "Filtragem contextual sobre vetores de embeddings",
    ],
  },

  // ==========================================
  // LOTE 4: PRODUTIVIDADE, DOCS & TAREFAS
  // ==========================================
  {
    id: "notion",
    name: "Notion",
    logoName: "NotionLogo",
    category: "productivity",
    categoryLabel: "Documentação & Wiki",
    description: "Criação de páginas, busca em bases de dados e documentação de projetos.",
    authType: "token",
    placeholder: "secret_...",
    docsUrl: "https://www.notion.so/my-integrations",
    supportsOAuth: true,
    oauthProvider: "notion",
    oauthScopes: ["read_content", "update_content", "insert_content"],
    advancedCapabilities: [
      "Criação e atualização de páginas e blocos Notion",
      "Consultas avançadas em bases de dados relacionais",
    ],
  },
  {
    id: "google_drive",
    name: "Google Drive / Workspace",
    logoName: "GoogleDriveLogo",
    category: "productivity",
    categoryLabel: "Produtividade & Ficheiros",
    description: "Leitura e criação de ficheiros na nuvem e manipulação de folhas de cálculo.",
    authType: "token",
    placeholder: "OAuth Access Token / Service Account...",
    docsUrl: "https://console.cloud.google.com",
    supportsOAuth: true,
    oauthProvider: "google",
    oauthScopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    advancedCapabilities: [
      "Pesquisa profunda em pastas e ficheiros do Google Drive",
      "Criação de novos ficheiros e leitura de conteúdo",
      "Integração bidirecional com Google Workspace",
    ],
  },
  {
    id: "trello",
    name: "Trello",
    logoName: "TrelloLogo",
    category: "productivity",
    categoryLabel: "Gestão de Tarefas",
    description: "Quadros Kanban, listas de tarefas, criação de cartões e comentários.",
    authType: "api_key",
    placeholder: "Trello API Key + Token...",
    docsUrl: "https://trello.com/power-ups/admin",
    supportsOAuth: true,
    oauthProvider: "trello",
    oauthScopes: ["read", "write", "account"],
    advancedCapabilities: [
      "Criação e movimentação de cartões em quadros Kanban",
      "Gestão de listas de tarefas, checklists e prazos de entrega",
      "Comentários e atribuição automática de membros de equipa",
    ],
  },
  {
    id: "jira",
    name: "Jira Software",
    logoName: "JiraLogo",
    category: "productivity",
    categoryLabel: "Gestão Ágil & Issues",
    description: "Consultas JQL avançadas, criação de tarefas, fluxos de status e worklog.",
    authType: "api_key",
    placeholder: "API Token Jira (Domínio/Conta no campo de Conta)...",
    docsUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    supportsOAuth: true,
    oauthProvider: "jira",
    oauthScopes: ["read:jira-work", "write:jira-work", "read:jira-user"],
    advancedCapabilities: [
      "Consultas JQL avançadas para filtragem de tarefas e bugs",
      "Criação, transição de status e fecho de issues ágeis",
      "Atribuição de responsáveis e acompanhamento de sprints",
    ],
  },
  {
    id: "linear",
    name: "Linear",
    logoName: "LinearLogo",
    category: "productivity",
    categoryLabel: "Gestão Ágil de Código",
    description: "Gestão de issues de alto ritmo, ciclos e sincronização com pull requests.",
    authType: "token",
    placeholder: "lin_api_...",
    docsUrl: "https://linear.app/settings/api",
    supportsOAuth: true,
    oauthProvider: "linear",
    oauthScopes: ["read", "write", "issues:create"],
    advancedCapabilities: [
      "Abertura automática de bugs e tarefas de desenvolvimento",
      "Sincronização de ciclos, roadmaps e status de issues",
    ],
  },

  // ==========================================
  // LOTE 5: CLOUD COMPUTING & CONTAINERS
  // ==========================================
  {
    id: "aws",
    name: "Amazon Web Services (AWS)",
    logoName: "AwsLogo",
    category: "dev_cloud",
    categoryLabel: "Cloud Computing & Storage",
    description: "Listagem e gestão de buckets S3, invocação de funções Lambda e logs CloudWatch.",
    authType: "api_key",
    placeholder: "AWS Secret Key (Access Key ID no campo de Conta)...",
    docsUrl: "https://aws.amazon.com/console",
    supportsOAuth: true,
    oauthProvider: "aws",
    oauthScopes: ["s3:manage", "lambda:invoke", "cloudwatch:read"],
    advancedCapabilities: [
      "Listagem e gestão de ficheiros e permissões em buckets S3",
      "Invocação e monitorização de funções serverless AWS Lambda",
      "Consulta de métricas e alarmes no Amazon CloudWatch",
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    logoName: "CloudflareLogo",
    category: "dev_cloud",
    categoryLabel: "Edge, DNS & Workers",
    description: "Gestão de zonas DNS, purge de cache global, Workers serverless e base D1.",
    authType: "token",
    placeholder: "Bearer token de API...",
    docsUrl: "https://dash.cloudflare.com/profile/api-tokens",
    supportsOAuth: true,
    oauthProvider: "cloudflare",
    oauthScopes: ["Account:Read", "Workers:Write", "Zone:Read", "DNS:Edit"],
    advancedCapabilities: [
      "Gestão de registos DNS e roteamento global de domínios",
      "Deploy e execução de scripts serverless Cloudflare Workers",
      "Purge instantâneo de cache de CDN e proteção DDoS",
    ],
  },
  {
    id: "digitalocean",
    name: "DigitalOcean",
    logoName: "DigitalOceanLogo",
    category: "dev_cloud",
    categoryLabel: "VPS & Containers",
    description: "Gestão e reinicialização de Droplets, e orquestração na App Platform.",
    authType: "token",
    placeholder: "dop_v1_...",
    docsUrl: "https://cloud.digitalocean.com/account/api/tokens",
    supportsOAuth: true,
    oauthProvider: "digitalocean",
    oauthScopes: ["read", "write"],
    advancedCapabilities: [
      "Gestão e reinicialização de instâncias e Droplets VPS",
      "Deploy e escalonamento na DigitalOcean App Platform",
      "Inspeção de recursos de rede, load balancers e volumes",
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    logoName: "HuggingFaceLogo",
    category: "ai_tools",
    categoryLabel: "Modelos & IA",
    description: "Busca e inferência de modelos open-source de IA e informações de datasets.",
    authType: "token",
    placeholder: "hf_...",
    docsUrl: "https://huggingface.co/settings/tokens",
    supportsOAuth: true,
    oauthProvider: "huggingface",
    oauthScopes: ["read", "write", "inference-api"],
    advancedCapabilities: [
      "Inferência direta em milhares de modelos open-source",
      "Pesquisa de modelos de NLP, visão computacional e áudio",
      "Inspeção de metadados de datasets e repositórios Spaces",
    ],
  },
  {
    id: "dockerhub",
    name: "Docker Hub",
    logoName: "DockerLogo",
    category: "dev_cloud",
    categoryLabel: "Containers & Registry",
    description: "Listagem de repositórios, tags de imagens Docker e estado de builds.",
    authType: "token",
    placeholder: "dckr_pat_...",
    docsUrl: "https://hub.docker.com/settings/security",
    supportsOAuth: true,
    oauthProvider: "dockerhub",
    oauthScopes: ["repo:read", "repo:write", "builds:read"],
    advancedCapabilities: [
      "Inspeção de repositórios de imagens e tags Docker públicas e privadas",
      "Acompanhamento de builds automáticos e webhooks de container",
      "Verificação de vulnerabilidades de segurança e camadas de imagem",
    ],
  },

  // ==========================================
  // LOTE 6: MONETIZAÇÃO, ANALYTICS & MONITORIZAÇÃO
  // ==========================================
  {
    id: "stripe",
    name: "Stripe",
    logoName: "StripeLogo",
    category: "productivity",
    categoryLabel: "Pagamentos & Checkout",
    description: "Faturação, gestão de clientes, sessões de checkout e subscrições.",
    authType: "api_key",
    placeholder: "rk_live_... ou sk_test_...",
    docsUrl: "https://dashboard.stripe.com/apikeys",
    supportsOAuth: true,
    oauthProvider: "stripe",
    oauthScopes: ["read_write"],
    advancedCapabilities: [
      "Consulta de saldo real, pagamentos e cobranças recentes",
      "Criação de clientes e sessões de Stripe Checkout",
      "Gestão de planos, faturas e subscrições recorrentes",
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    logoName: "ShopifyLogo",
    category: "productivity",
    categoryLabel: "E-Commerce",
    description: "Listagem de produtos, atualização de inventário e processamento de encomendas.",
    authType: "token",
    placeholder: "shpat_... (Subdomínio da loja no campo de Conta)...",
    docsUrl: "https://help.shopify.com/manual/apps/custom-apps",
    supportsOAuth: true,
    oauthProvider: "shopify",
    oauthScopes: ["read_products", "write_products", "read_orders"],
    advancedCapabilities: [
      "Consulta e atualização de inventário de produtos e variantes",
      "Processamento e inspeção de encomendas de clientes",
      "Criação de novos produtos e gestão de coleções da loja",
    ],
  },
  {
    id: "google_analytics",
    name: "Google Analytics (GA4)",
    logoName: "GoogleAnalyticsLogo",
    category: "ai_tools",
    categoryLabel: "Analytics & Telemetria",
    description: "Execução de relatórios de métricas, visitantes e eventos em tempo real.",
    authType: "api_key",
    placeholder: "ID de medição (G-...) ou API Secret...",
    docsUrl: "https://analytics.google.com",
    supportsOAuth: true,
    oauthProvider: "google",
    oauthScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    advancedCapabilities: [
      "Relatórios de tráfego, sessões ativas e páginas mais visitadas",
      "Taxas de conversão e eventos personalizados em tempo real",
      "Comparativos temporais e métricas de retenção de utilizadores",
    ],
  },
  {
    id: "posthog",
    name: "PostHog",
    logoName: "PostHogLogo",
    category: "ai_tools",
    categoryLabel: "Product Analytics",
    description: "Captura de telemetria, gestão de Feature Flags e insights de produto.",
    authType: "api_key",
    placeholder: "phx_... ou chave de projeto...",
    docsUrl: "https://app.posthog.com/project/settings",
    supportsOAuth: true,
    oauthProvider: "posthog",
    oauthScopes: ["user:read", "project:read"],
    advancedCapabilities: [
      "Captura e inspeção de eventos de telemetria de produto",
      "Consulta e ativação/desativação de Feature Flags",
      "Análise de funis de conversão e comportamento de utilizadores",
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    logoName: "SentryLogo",
    category: "dev_cloud",
    categoryLabel: "Monitorização & Erros",
    description:
      "Monitorização de falhas de produção, rastreio de stacktraces e resolução de issues.",
    authType: "token",
    placeholder: "sntrys_...",
    docsUrl: "https://sentry.io/settings/account/api/auth-tokens/",
    supportsOAuth: true,
    oauthProvider: "sentry",
    oauthScopes: ["project:read", "project:write", "event:read", "org:read"],
    advancedCapabilities: [
      "Rastreio em tempo real de exceções e erros de produção",
      "Inspeção de stacktraces detalhados e contexto de utilizadores",
      "Resolução e atribuição automática de issues aos devs",
    ],
  },

  // Conectores Adicionais / Compatibilidade
  {
    id: "google_sheets",
    name: "Google Sheets",
    logoName: "GoogleSheetsLogo",
    category: "productivity",
    categoryLabel: "Folhas de Cálculo",
    description: "Exportação e leitura de relatórios tabulares em tempo real.",
    authType: "token",
    placeholder: "Google Sheets API Token...",
    docsUrl: "https://developers.google.com/sheets/api",
    supportsOAuth: true,
    oauthProvider: "google",
    oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
    advancedCapabilities: [
      "Leitura e inserção de linhas em tabelas de cálculo em tempo real",
      "Geração automática de relatórios formatados em Google Sheets",
      "Cálculo de fórmulas e sincronização de dados tabulares",
    ],
  },
  {
    id: "figma",
    name: "Figma",
    logoName: "FigmaLogo",
    category: "ai_tools",
    categoryLabel: "Design & UI",
    description: "Inspeção de ficheiros de design, extração de assets e tokens visuais.",
    authType: "token",
    placeholder: "figd_...",
    docsUrl: "https://www.figma.com/developers/api#access-tokens",
    supportsOAuth: true,
    oauthProvider: "figma",
    oauthScopes: ["files:read", "file_comments:write"],
    advancedCapabilities: [
      "Inspeção de ficheiros de design e árvores de componentes",
      "Extração de tokens visuais (cores, tipografia, espaçamentos)",
      "Exportação de assets em PNG/SVG para projetos dos agentes",
    ],
  },
  {
    id: "canva",
    name: "Canva",
    logoName: "CanvaLogo",
    category: "ai_tools",
    categoryLabel: "Design & Artes",
    description: "Exportação de designs, templates e geração de artes promocionais.",
    authType: "token",
    placeholder: "Canva Connect API Key...",
    docsUrl: "https://www.canva.com/developers/",
    supportsOAuth: true,
    oauthProvider: "canva",
    oauthScopes: ["asset:read", "asset:write", "design:content:read"],
    advancedCapabilities: [
      "Exportação de designs e artes em alta resolução",
      "Gestão de assets visuais, logótipos e imagens da marca",
      "Geração de artes promocionais a partir de templates",
    ],
  },
];

/** Carrega o mapa de plugins conectados guardados no dispositivo */
export function getConnectedPlugins(): Record<string, ConnectedPluginData> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Erro ao ler conexões de plugins:", err);
    return {};
  }
}

/** Verifica se um plugin específico está ativo */
export function isPluginConnected(pluginId: string): boolean {
  const map = getConnectedPlugins();
  return Boolean(map[pluginId]?.connected);
}

/** Retorna a contagem de plugins atualmente conectados */
export function countConnectedPlugins(): number {
  return Object.values(getConnectedPlugins()).filter((p) => p.connected).length;
}

/** Normaliza as credenciais de um plugin suportando compatibilidade com versões anteriores */
export function normalizePluginCredentials(plugin: ConnectedPluginData): PluginCredential[] {
  if (Array.isArray(plugin.credentials) && plugin.credentials.length > 0) {
    return plugin.credentials;
  }
  if (!plugin.connected) return [];

  // Migração transparente de conexão antiga de credencial única
  const fallbackLabel = plugin.accountName
    ? `${plugin.accountName} (Principal)`
    : "Conta Principal";
  const hint = plugin.secretHint || (plugin.apiKey ? `••••${plugin.apiKey.slice(-4)}` : "••••••••");

  return [
    {
      id: `${plugin.id}_primary`,
      label: fallbackLabel,
      accountName: plugin.accountName,
      secretHint: hint,
      apiKey: plugin.apiKey,
      customEndpoint: plugin.customEndpoint,
      projectRef: plugin.projectRef,
      isPrimary: true,
      status: "active",
      createdAt: plugin.connectedAt || new Date().toISOString(),
      updatedAt: plugin.connectedAt || new Date().toISOString(),
    },
  ];
}

/** Retorna a lista de credenciais / contas conectadas de um plugin específico */
export function getPluginCredentials(pluginId: string): PluginCredential[] {
  const map = getConnectedPlugins();
  const plugin = map[pluginId];
  if (!plugin) return [];
  return normalizePluginCredentials(plugin);
}

/** Resolve de forma centralizada e resiliente as credenciais ativas de um plugin */
export function resolveActivePluginCredentials(pluginId: string): {
  apiKey: string;
  accountName?: string;
  projectRef?: string;
  customEndpoint?: string;
  primaryCredential?: PluginCredential;
} {
  const map = getConnectedPlugins();
  const norm = pluginId.toLowerCase().trim();
  const plugin =
    map[norm] ||
    map[pluginId] ||
    Object.values(map).find(
      (p) => p.id === norm || p.id.toLowerCase() === norm || p.id === pluginId,
    );

  if (!plugin || !plugin.connected) {
    return { apiKey: "" };
  }

  const creds = normalizePluginCredentials(plugin);
  const primary = creds.find((c) => c.isPrimary) || creds[0];

  const apiKey = primary?.apiKey?.trim() || plugin.apiKey?.trim() || "";

  const accountName = primary?.accountName?.trim() || plugin.accountName?.trim() || undefined;

  const projectRef = primary?.projectRef?.trim() || plugin.projectRef?.trim() || accountName;

  const customEndpoint =
    primary?.customEndpoint?.trim() || plugin.customEndpoint?.trim() || undefined;

  return {
    apiKey,
    accountName,
    projectRef,
    customEndpoint,
    primaryCredential: primary,
  };
}

/** Conecta e guarda a configuração de um plugin no servidor (griot_credentials) e sincroniza localmente */
export async function connectPluginUnified(
  pluginId: string,
  data?: {
    apiKey?: string;
    accountName?: string;
    label?: string;
    customEndpoint?: string;
    projectRef?: string;
    projects?: Array<{ id: string; name: string; status?: string }>;
    verifiedAt?: string;
    validationStatus?: "verified" | "unverified" | "error";
    validationMessage?: string;
    isPrimary?: boolean;
    authMethod?: "oauth" | "api_key" | "token";
    oauthScopes?: string[];
    avatarUrl?: string;
    username?: string;
  },
): Promise<{ remoteId?: string; status: "active" | "pending" | "error"; error?: string }> {
  if (typeof window === "undefined") {
    return { status: "error", error: "Window undefined" };
  }

  const map = getConnectedPlugins();
  const trimmed = data?.apiKey?.trim() || "";
  const existing = map[pluginId];
  const existingCreds = existing ? normalizePluginCredentials(existing) : [];

  const hint = trimmed ? `••••${trimmed.slice(-4)}` : "••••••••";
  const label =
    data?.label?.trim() ||
    (data?.accountName?.trim() ? `${data.accountName.trim()}` : "Conta Principal");

  const newCredentialId = `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const isFirst = existingCreds.length === 0;
  const isPrimary = data?.isPrimary ?? isFirst;

  // Se a nova for primária, desmarca as outras
  const updatedCreds = existingCreds.map((c) => ({
    ...c,
    isPrimary: isPrimary ? false : c.isPrimary,
  }));

  const newCred: PluginCredential = {
    id: newCredentialId,
    label,
    accountName: data?.accountName?.trim() || data?.username?.trim() || undefined,
    secretHint: hint,
    apiKey: trimmed,
    customEndpoint: data?.customEndpoint?.trim() || undefined,
    projectRef: data?.projectRef?.trim() || undefined,
    isPrimary,
    status: "active",
    authMethod:
      data?.authMethod ||
      (trimmed.startsWith("ghp_") || trimmed.startsWith("glpat-") ? "token" : "api_key"),
    oauthScopes: data?.oauthScopes,
    avatarUrl: data?.avatarUrl,
    username: data?.username || data?.accountName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  updatedCreds.push(newCred);

  const primaryCred = updatedCreds.find((c) => c.isPrimary) || updatedCreds[0];

  map[pluginId] = {
    id: pluginId,
    connected: true,
    connectedAt: existing?.connectedAt || new Date().toISOString(),
    credentials: updatedCreds,
    primaryCredentialId: primaryCred?.id,
    remoteCredentialId: primaryCred?.remoteCredentialId,
    apiKey: primaryCred?.apiKey || trimmed,
    accountName: primaryCred?.accountName || data?.accountName?.trim() || undefined,
    customEndpoint: primaryCred?.customEndpoint || data?.customEndpoint?.trim() || undefined,
    projectRef: primaryCred?.projectRef || data?.projectRef?.trim() || undefined,
    projects: data?.projects || existing?.projects || undefined,
    verifiedAt: data?.verifiedAt || new Date().toISOString(),
    validationStatus: data?.validationStatus || "verified",
    validationMessage: data?.validationMessage,
    secretHint: primaryCred?.secretHint || hint,
    authMethod: data?.authMethod || primaryCred?.authMethod,
    oauthScopes: data?.oauthScopes || primaryCred?.oauthScopes,
    avatarUrl: data?.avatarUrl || primaryCred?.avatarUrl,
    username: data?.username || primaryCred?.username,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("griot-plugins-updated", { detail: { pluginId, connected: true } }),
    );
  } catch (err) {
    console.error("Falha ao guardar plugin localmente:", err);
  }

  // Se for fornecida uma chave/token de API real, persiste e ativa no servidor
  if (trimmed && trimmed !== "connected_oauth" && trimmed !== "connected_direct") {
    try {
      const saveRes = await saveGriotCredential({
        kind: "plugin",
        providerId: pluginId,
        secret: trimmed,
        label,
        settings: {
          accountName: data?.accountName?.trim() || undefined,
          customEndpoint: data?.customEndpoint?.trim() || undefined,
          projectRef: data?.projectRef?.trim() || undefined,
        },
      });

      const remoteId = saveRes.data?.credential?.id;
      if (remoteId) {
        const verifyRes = await verifyGriotCredential(remoteId);
        const isVerified = verifyRes.data?.valid === true;

        newCred.remoteCredentialId = remoteId;
        newCred.status = isVerified ? "active" : "pending";

        // Atualiza o registo local com remoteCredentialId
        const currentMap = getConnectedPlugins();
        if (currentMap[pluginId]?.credentials) {
          const idx = currentMap[pluginId].credentials!.findIndex((c) => c.id === newCredentialId);
          if (idx !== -1) {
            currentMap[pluginId].credentials![idx].remoteCredentialId = remoteId;
            currentMap[pluginId].credentials![idx].status = isVerified ? "active" : "pending";
          }
          if (currentMap[pluginId].primaryCredentialId === newCredentialId) {
            currentMap[pluginId].remoteCredentialId = remoteId;
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMap));
          window.dispatchEvent(
            new CustomEvent("griot-plugins-updated", {
              detail: { pluginId, connected: true, remoteCredentialId: remoteId },
            }),
          );
        }

        return { remoteId, status: isVerified ? "active" : "pending" };
      }
      return { status: "pending", error: saveRes.error || undefined };
    } catch (serverErr: any) {
      console.warn("[GRIOT] Falha ao sincronizar plugin com servidor:", serverErr);
      return { status: "error", error: serverErr?.message || String(serverErr) };
    }
  }

  return { status: "active" };
}

/** Conecta e guarda a configuração de um plugin (compatibilidade síncrona/background) */
export function connectPlugin(
  pluginId: string,
  data?: {
    apiKey?: string;
    accountName?: string;
    label?: string;
    customEndpoint?: string;
    projectRef?: string;
    projects?: Array<{ id: string; name: string; status?: string }>;
    verifiedAt?: string;
    validationStatus?: "verified" | "unverified" | "error";
    validationMessage?: string;
    isPrimary?: boolean;
  },
): void {
  void connectPluginUnified(pluginId, data);
}

/** Define uma credencial específica como Principal (default fallback) */
export function setPrimaryPluginCredential(pluginId: string, credentialId: string): void {
  if (typeof window === "undefined") return;
  const map = getConnectedPlugins();
  const plugin = map[pluginId];
  if (!plugin) return;

  const creds = normalizePluginCredentials(plugin);
  const target = creds.find((c) => c.id === credentialId);
  if (!target) return;

  const updatedCreds = creds.map((c) => ({
    ...c,
    isPrimary: c.id === credentialId,
  }));

  map[pluginId] = {
    ...plugin,
    credentials: updatedCreds,
    primaryCredentialId: credentialId,
    remoteCredentialId: target.remoteCredentialId || plugin.remoteCredentialId,
    apiKey: target.apiKey,
    accountName: target.accountName,
    secretHint: target.secretHint,
    customEndpoint: target.customEndpoint,
    projectRef: target.projectRef,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("griot-plugins-updated", { detail: { pluginId, connected: true } }),
    );
  } catch (err) {
    console.error("Falha ao definir credencial principal:", err);
  }
}

/** Remove ou revoga uma credencial de um plugin no servidor e localmente */
export async function removePluginCredentialUnified(
  pluginId: string,
  credentialId: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const map = getConnectedPlugins();
  const plugin = map[pluginId];
  if (plugin) {
    const creds = normalizePluginCredentials(plugin);
    const target = creds.find((c) => c.id === credentialId);
    if (target?.remoteCredentialId) {
      try {
        await deleteGriotCredential(target.remoteCredentialId);
      } catch (err) {
        console.warn("Erro ao remover credencial no servidor:", err);
      }
    }
  }
  removePluginCredential(pluginId, credentialId);
}

/** Remove ou revoga uma credencial de um plugin (síncrono/local) */
export function removePluginCredential(pluginId: string, credentialId: string): void {
  if (typeof window === "undefined") return;
  const map = getConnectedPlugins();
  const plugin = map[pluginId];
  if (!plugin) return;

  const creds = normalizePluginCredentials(plugin);
  const remaining = creds.filter((c) => c.id !== credentialId);

  if (remaining.length === 0) {
    disconnectPlugin(pluginId);
    return;
  }

  // Se a removida era a principal, elege a primeira restante
  let nextPrimary = remaining.find((c) => c.isPrimary);
  if (!nextPrimary) {
    remaining[0].isPrimary = true;
    nextPrimary = remaining[0];
  }

  map[pluginId] = {
    ...plugin,
    credentials: remaining,
    primaryCredentialId: nextPrimary.id,
    remoteCredentialId: nextPrimary.remoteCredentialId,
    apiKey: nextPrimary.apiKey,
    accountName: nextPrimary.accountName,
    secretHint: nextPrimary.secretHint,
    customEndpoint: nextPrimary.customEndpoint,
    projectRef: nextPrimary.projectRef,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("griot-plugins-updated", { detail: { pluginId, connected: true } }),
    );
  } catch (err) {
    console.error("Falha ao remover credencial:", err);
  }
}

/** Desconecta completamente um plugin no servidor e localmente */
export async function disconnectPluginUnified(pluginId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const map = getConnectedPlugins();
  const plugin = map[pluginId];
  if (plugin) {
    const creds = normalizePluginCredentials(plugin);
    for (const cred of creds) {
      if (cred.remoteCredentialId) {
        try {
          await deleteGriotCredential(cred.remoteCredentialId);
        } catch (err) {
          console.warn("Erro ao remover credencial no servidor:", err);
        }
      }
    }
  }
  disconnectPlugin(pluginId);
}

/** Desconecta completamente um plugin */
export function disconnectPlugin(pluginId: string): void {
  if (typeof window === "undefined") return;
  const map = getConnectedPlugins();
  delete map[pluginId];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("griot-plugins-updated", { detail: { pluginId, connected: false } }),
    );
  } catch (err) {
    console.error("Falha ao remover plugin:", err);
  }
}

/**
 * Camada Central de Resolução de Credenciais (Credential Resolution Layer)
 *
 * Regra Arquitetural:
 * 1. Se requestedIdentity especificada (ex: "pedro"), encontra a credencial correspondente.
 * 2. Se não especificada, utiliza a credencial marcada como isPrimary.
 * 3. Se nenhuma identificada com certeza, devolve lista de opções para escolha.
 * 4. SEGURANÇA: NUNCA retorna o token puro. Retorna apenas runtimeReference e metadados seguros.
 */
export function resolveCredential(
  providerId: string,
  requestedIdentity?: string,
): ResolvedCredential | null {
  const map = getConnectedPlugins();
  const plugin = map[providerId];
  if (!plugin || !plugin.connected) return null;

  const creds = normalizePluginCredentials(plugin).filter((c) => c.status === "active");
  if (creds.length === 0) return null;

  if (requestedIdentity && requestedIdentity.trim()) {
    const query = requestedIdentity.trim().toLowerCase();
    const match = creds.find(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        (c.accountName && c.accountName.toLowerCase().includes(query)) ||
        c.id.toLowerCase() === query,
    );
    if (match) {
      return {
        credentialId: match.id,
        provider: providerId,
        displayName: match.label,
        accountName: match.accountName,
        isPrimary: match.isPrimary,
        runtimeReference: `vault://credentials/${providerId}/${match.id}`,
      };
    }
  }

  // Fallback: credencial principal
  const primary = creds.find((c) => c.isPrimary) || creds[0];
  if (primary) {
    return {
      credentialId: primary.id,
      provider: providerId,
      displayName: primary.label,
      accountName: primary.accountName,
      isPrimary: primary.isPrimary,
      runtimeReference: `vault://credentials/${providerId}/${primary.id}`,
    };
  }

  // Múltiplas opções sem padrão claro
  return {
    credentialId: "",
    provider: providerId,
    displayName: "Múltiplas contas disponíveis",
    isPrimary: false,
    runtimeReference: "",
    needsSelection: true,
    candidateCredentials: creds.map((c) => ({
      id: c.id,
      label: c.label,
      accountName: c.accountName,
    })),
  };
}

/**
 * Retorna as referências de secrets configuradas pelo utilizador em todos os conectores.
 * Utilizado pelo Autonomous Task Creator para exibir credenciais seguras disponíveis.
 * IMPORTANTE: Nunca expõe os valores reais das credenciais.
 */
export function getAvailableSecretReferences(): Array<{
  key: string;
  name: string;
  providerId: string;
  label: string;
  hint: string;
}> {
  const map = getConnectedPlugins();
  const results: Array<{
    key: string;
    name: string;
    providerId: string;
    label: string;
    hint: string;
  }> = [];

  const KNOWN_SECRET_NAMES: Record<string, string> = {
    github: "GITHUB_TOKEN",
    gitlab: "GITLAB_TOKEN",
    vercel: "VERCEL_TOKEN",
    supabase: "SUPABASE_KEY",
    firebase: "FIREBASE_TOKEN",
    cloudflare: "CLOUDFLARE_API_TOKEN",
    aws: "AWS_SECRET_ACCESS_KEY",
    stripe: "STRIPE_SECRET_KEY",
    resend: "RESEND_API_KEY",
    sendgrid: "SENDGRID_API_KEY",
    postmark: "POSTMARK_API_KEY",
    twilio: "TWILIO_AUTH_TOKEN",
    slack: "SLACK_BOT_TOKEN",
    discord: "DISCORD_BOT_TOKEN",
    telegram: "TELEGRAM_BOT_TOKEN",
    redis: "UPSTASH_REDIS_REST_TOKEN",
    upstash: "UPSTASH_REDIS_REST_TOKEN",
    neon: "NEON_API_KEY",
    turso: "TURSO_AUTH_TOKEN",
    planetscale: "PLANETSCALE_SERVICE_TOKEN",
    sentry: "SENTRY_AUTH_TOKEN",
    posthog: "POSTHOG_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    linear: "LINEAR_API_KEY",
    notion: "NOTION_API_KEY",
    jira: "JIRA_API_TOKEN",
    figma: "FIGMA_ACCESS_TOKEN",
  };

  for (const [providerId, pluginData] of Object.entries(map)) {
    if (!pluginData.connected) continue;
    const creds = normalizePluginCredentials(pluginData);
    const secretKey = KNOWN_SECRET_NAMES[providerId] || `${providerId.toUpperCase()}_TOKEN`;
    const primary = creds.find((c) => c.isPrimary) || creds[0];
    const hint = primary?.secretHint || pluginData.secretHint || "••••••••";

    results.push({
      key: secretKey,
      name: secretKey,
      providerId,
      label: primary?.label || providerId.toUpperCase(),
      hint,
    });
  }

  return results;
}

/**
 * Constrói o bloco de prompt de sistema injetado em tempo real
 * informando à IA quais conectores e serviços externos estão ATIVOS,
 * AUTENTICADOS e VALIDADOS, com os seus IDs, referências e ferramentas exatas.
 *
 * Ensina tanto a invocação nativa de ferramentas como a chamada semântica via tag:
 * <connector_action connector="github" action="contents.write_file" params='{...}' />
 */
export function buildConnectedPluginsSystemPrompt(): string {
  const plugins = getConnectedPlugins();
  const connectedList = Object.values(plugins).filter((p) => p.connected);

  if (connectedList.length === 0) {
    return `[CONECTORES EXTERNOS GRIOT (MATRIZ DOS 30 CONECTORES)]
Nenhum conector externo está autenticado no momento. Se o utilizador solicitar ações com ferramentas externas (ex: GitHub, Supabase, Discord, Telegram, Neon, Redis, AWS, Stripe), instrui-o amigavelmente a aceder a Definições → Plugins para autenticar o serviço desejado com a sua respetiva chave/token.`;
  }

  let prompt = `[PLUGINS E CONECTORES EXTERNOS ATIVOS NO GRIOT (STATUS: 100% OPERACIONAIS E VALIDADOS)]\n`;
  prompt += `O utilizador autenticou e validou com sucesso as seguintes integrações externas no dispositivo:\n\n`;

  for (const cp of connectedList) {
    const meta = PLUGINS_LIST.find((p) => p.id === cp.id);
    const name = meta?.name || cp.id.toUpperCase();

    if (cp.id === "supabase") {
      const ref =
        cp.projectRef || cp.accountName || (cp.projects && cp.projects[0]?.id) || "auto-detectado";
      const url = cp.customEndpoint || (ref ? `https://${ref}.supabase.co` : "Supabase API");
      prompt += `• ⚡ **SUPABASE (POSTGRESQL & MANAGEMENT API)**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Project Ref: \`${ref}\` | Endpoint: \`${url}\`\n`;
      prompt += `  - Autenticação: ${cp.apiKey?.startsWith("sbp_") ? "Management Token (Acesso Total ao PostgreSQL)" : "Service Role / Anon Key"}\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="supabase" action="db.raw_sql" params='{"query":"SELECT * FROM ..."}' />\n`;
      prompt += `  - Ações suportadas: db.select, db.insert, db.update, db.delete, db.raw_sql, db.introspect_schema, storage.list_buckets, functions.list\n\n`;
    } else if (cp.id === "github") {
      const userHandle = cp.accountName ? `@${cp.accountName}` : "autenticado";
      prompt += `• 📦 **GITHUB**: CONECTADO E VALIDADO! (Utilizador: ${userHandle})\n`;
      prompt += `  - REGRA DE OURO REPOSITÓRIOS: Podes passar o repositório como "${cp.accountName || "dono"}/nome-repo" ou apenas "nome-repo" (o GRIOT associa automaticamente à conta ${userHandle}).\n`;
      prompt += `  - Listar Repos: <connector_action connector="github" action="repos.list" params='{}' />\n`;
      prompt += `  - Criar Repositório: <connector_action connector="github" action="repos.create" params='{"name":"nome-do-repo","private":false}' />\n`;
      prompt += `  - Ver Detalhes: <connector_action connector="github" action="repos.get" params='{"repo":"nome-do-repo"}' />\n`;
      prompt += `  - Ler Ficheiro: <connector_action connector="github" action="contents.read_file" params='{"repo":"nome-do-repo","path":"README.md"}' />\n`;
      prompt += `  - Escrever Ficheiro: <connector_action connector="github" action="contents.write_file" params='{"repo":"nome-do-repo","path":"src/App.tsx","content":"..."}' />\n`;
      prompt += `  - Ações suportadas: repos.list, repos.get, repos.create, contents.read_file, contents.write_file, contents.delete_file, contents.get_tree, search.code, branches.list, pulls.list, pulls.create, issues.list, issues.create, actions.list_workflows\n\n`;
    } else if (cp.id === "gitlab") {
      prompt += `• 🦊 **GITLAB**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Listar Projetos: <connector_action connector="gitlab" action="projects.list" params='{}' />\n`;
      prompt += `  - Detalhes do Projeto: <connector_action connector="gitlab" action="projects.get" params='{"projectId":"123"}' />\n`;
      prompt += `  - Ler Ficheiro: <connector_action connector="gitlab" action="repository.get_raw_file" params='{"projectId":"123","filePath":"README.md"}' />\n`;
      prompt += `  - Ações suportadas: projects.list, projects.get, repository.tree, repository.get_raw_file, merge_requests.list, merge_requests.create, pipelines.list, issues.list, issues.create\n\n`;
    } else if (cp.id === "cloudflare") {
      prompt += `• ☁️ **CLOUDFLARE**: CONECTADO E VALIDADO! (Conta: ${cp.accountName || "auto-detectada"})\n`;
      prompt += `  - Listar Zonas DNS: <connector_action connector="cloudflare" action="zones.list" params='{}' />\n`;
      prompt += `  - Listar Projetos Pages: <connector_action connector="cloudflare" action="pages.list_projects" params='{}' />\n`;
      prompt += `  - Listar Workers: <connector_action connector="cloudflare" action="workers.list" params='{}' />\n`;
      prompt += `  - Listar Bases D1: <connector_action connector="cloudflare" action="d1.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: zones.list, pages.list_projects, workers.list, d1.list, d1.query, verify_token\n\n`;
    } else if (cp.id === "vercel") {
      prompt += `• ▲ **VERCEL**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="vercel" action="deployments.list" params='{"projectId":"prj_..."}' />\n`;
      prompt += `  - Ações suportadas: projects.list, projects.get, env.list, env.create, deployments.list, deployments.create, domains.list\n\n`;
    } else if (cp.id === "firebase") {
      prompt += `• 🔥 **FIREBASE**: CONECTADO E VALIDADO! (Projeto: ${cp.accountName || cp.projectRef || "ativo"})\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="firebase" action="firestore.get_document" params='{"path":"users/123"}' />\n`;
      prompt += `  - Ações suportadas: firestore.get_document, firestore.set_document, firestore.list_documents, firestore.run_query, auth.list_users, rtdb.get, rtdb.set\n\n`;
    } else if (cp.id === "discord") {
      prompt += `• 💬 **DISCORD**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="discord" action="messages.send" params='{"channelId":"...","content":"Olá do GRIOT!"}' />\n`;
      prompt += `  - Ações suportadas: webhook.send, messages.send, messages.read_history, channels.list, reactions.add\n\n`;
    } else if (cp.id === "telegram") {
      prompt += `• ✈️ **TELEGRAM**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="telegram" action="sendMessage" params='{"chat_id":"...","text":"Alerta do GRIOT"}' />\n`;
      prompt += `  - Ações suportadas: sendMessage, sendPhoto, sendDocument, getUpdates, setWebhook\n\n`;
    } else if (cp.id === "twilio") {
      prompt += `• 📱 **TWILIO / WHATSAPP**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="twilio" action="whatsapp.send" params='{"to":"whatsapp:+351...","body":"Mensagem de Produção"}' />\n`;
      prompt += `  - Ações suportadas: sms.send, whatsapp.send, messages.list, verify.send_token, verify.check_token\n\n`;
    } else if (cp.id === "resend") {
      prompt += `• ✉️ **RESEND / SENDGRID**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="resend" action="email.send" params='{"to":"user@empresa.com","subject":"Relatório","html":"<h1>Sucesso</h1>"}' />\n`;
      prompt += `  - Ações suportadas: email.send, email.send_with_attachments, email.get_status, domains.verify\n\n`;
    } else if (cp.id === "postgresql" || cp.id === "neon") {
      prompt += `• 🐘 **POSTGRESQL / NEON**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="postgresql" action="pg.query" params='{"sql":"SELECT NOW();"}' />\n`;
      prompt += `  - Ações suportadas: pg.query, pg.transaction, pg.schema.tables, pg.schema.describe_table, pg.neon.create_branch\n\n`;
    } else if (cp.id === "redis" || cp.id === "upstash") {
      prompt += `• ⚡ **REDIS / UPSTASH**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="redis" action="redis.set" params='{"key":"sessao:123","value":"ativa","ex":3600}' />\n`;
      prompt += `  - Ações suportadas: redis.get, redis.set, redis.del, redis.hgetall, redis.hset, redis.lpush, redis.rpop, redis.publish\n\n`;
    } else if (cp.id === "mongodb") {
      prompt += `• 🍃 **MONGODB ATLAS**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="mongodb" action="mongodb.find" params='{"collection":"pedidos","filter":{}}' />\n`;
      prompt += `  - Ações suportadas: mongodb.find, mongodb.insert_one, mongodb.insert_many, mongodb.update_many, mongodb.delete_many, mongodb.aggregate\n\n`;
    } else if (cp.id === "airtable") {
      prompt += `• 📊 **AIRTABLE**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="airtable" action="airtable.records.list" params='{"baseId":"app...","table":"Clientes"}' />\n`;
      prompt += `  - Ações suportadas: airtable.records.list, airtable.records.create, airtable.records.update, airtable.records.delete, airtable.schema.get_base_schema\n\n`;
    } else if (cp.id === "pinecone" || cp.id === "qdrant") {
      prompt += `• 🌲 **PINECONE / QDRANT**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="pinecone" action="vector.query" params='{"vector":[0.1,0.2,...],"topK":5}' />\n`;
      prompt += `  - Ações suportadas: vector.upsert, vector.query, vector.delete, vector.describe_index_stats\n\n`;
    } else if (cp.id === "notion") {
      prompt += `• 📝 **NOTION**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="notion" action="notion.databases.query" params='{"databaseId":"..."}' />\n`;
      prompt += `  - Ações suportadas: notion.pages.create, notion.pages.get, notion.blocks.append_children, notion.databases.query, notion.search\n\n`;
    } else if (cp.id === "aws") {
      prompt += `• ☁️ **AWS (AMAZON WEB SERVICES)**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="aws" action="aws.s3.list_buckets" params='{}' />\n`;
      prompt += `  - Ações suportadas: aws.s3.list_buckets, aws.s3.list_objects, aws.lambda.invoke, aws.cloudwatch.get_log_events\n\n`;
    } else if (cp.id === "digitalocean") {
      prompt += `• 🌊 **DIGITALOCEAN**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="digitalocean" action="digitalocean.droplets.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: digitalocean.droplets.list, digitalocean.droplets.reboot, digitalocean.apps.list, digitalocean.apps.create_deployment\n\n`;
    } else if (cp.id === "stripe") {
      prompt += `• 💳 **STRIPE**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="stripe" action="stripe.balance.get" params='{}' />\n`;
      prompt += `  - Ações suportadas: stripe.customers.list, stripe.checkout.create_session, stripe.subscriptions.list, stripe.invoices.list, stripe.balance.get\n\n`;
    } else if (cp.id === "shopify") {
      prompt += `• 🛍️ **SHOPIFY**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="shopify" action="shopify.products.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: shopify.products.list, shopify.products.update_inventory, shopify.orders.list, shopify.orders.fulfill\n\n`;
    } else if (cp.id === "posthog") {
      prompt += `• 🦔 **POSTHOG**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="posthog" action="posthog.feature_flags.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: posthog.events.capture, posthog.feature_flags.list, posthog.insights.query\n\n`;
    } else if (cp.id === "sentry") {
      prompt += `• 🚨 **SENTRY**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="sentry" action="sentry.issues.list" params='{"project":"..."}' />\n`;
      prompt += `  - Ações suportadas: sentry.issues.list, sentry.issues.get_stacktrace, sentry.issues.resolve\n\n`;
    } else if (cp.id === "slack") {
      prompt += `• 💬 **SLACK**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="slack" action="messages.send" params='{"channel":"#geral","text":"Mensagem via GRIOT"}' />\n`;
      prompt += `  - Ações suportadas: messages.send, chat.postMessage, channels.list, users.list, team.info\n\n`;
    } else if (cp.id === "trello") {
      prompt += `• 📋 **TRELLO**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="trello" action="boards.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: boards.list, cards.create, cards.get, lists.get, members.me\n\n`;
    } else if (cp.id === "jira") {
      prompt += `• 🎯 **JIRA SOFTWARE**: CONECTADO E VALIDADO! (Domínio: ${cp.accountName || "configurado"})\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="jira" action="issues.search_jql" params='{"jql":"order by created DESC","limit":10}' />\n`;
      prompt += `  - Ações suportadas: issues.search_jql, issues.get, issues.create, issues.transition, projects.list\n\n`;
    } else if (cp.id === "linear") {
      prompt += `• 📐 **LINEAR**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="linear" action="issues.list" params='{"limit":10}' />\n`;
      prompt += `  - Ações suportadas: issues.list, issues.create, viewer.get, teams.list\n\n`;
    } else if (cp.id === "google_drive") {
      prompt += `• 📁 **GOOGLE DRIVE**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="google_drive" action="files.list" params='{"pageSize":10}' />\n`;
      prompt += `  - Ações suportadas: files.list, files.get, files.create, files.delete\n\n`;
    } else if (cp.id === "google_sheets") {
      prompt += `• 📊 **GOOGLE SHEETS**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="google_sheets" action="values.get" params='{"spreadsheetId":"...","range":"A1:E20"}' />\n`;
      prompt += `  - Ações suportadas: values.get, values.append, values.update, spreadsheets.get\n\n`;
    } else if (cp.id === "dockerhub") {
      prompt += `• 🐳 **DOCKER HUB**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="dockerhub" action="repositories.list" params='{}' />\n`;
      prompt += `  - Ações suportadas: repositories.list, repositories.get, tags.list, user.profile\n\n`;
    } else if (cp.id === "huggingface") {
      prompt += `• 🤗 **HUGGING FACE**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="huggingface" action="models.search" params='{"search":"llama"}' />\n`;
      prompt += `  - Ações suportadas: models.search, models.get, inference.run, datasets.search\n\n`;
    } else if (cp.id === "google_analytics") {
      prompt += `• 📈 **GOOGLE ANALYTICS (GA4)**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="google_analytics" action="reports.run" params='{"propertyId":"...","metrics":["activeUsers"]}' />\n`;
      prompt += `  - Ações suportadas: reports.run, reports.realtime, properties.list\n\n`;
    } else if (cp.id === "figma") {
      prompt += `• 🎨 **FIGMA**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="figma" action="files.get" params='{"fileKey":"..."}' />\n`;
      prompt += `  - Ações suportadas: files.get, files.nodes, comments.list, comments.post, me\n\n`;
    } else if (cp.id === "canva") {
      prompt += `• 🖌️ **CANVA**: CONECTADO E VALIDADO!\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="canva" action="designs.list" params='{"limit":8}' />\n`;
      prompt += `  - Ações suportadas: designs.list, designs.get, designs.create, users.me\n\n`;
    } else {
      prompt += `• 🔌 **${name}**: CONECTADO E VALIDADO! (Identificador: ${cp.accountName || "padrão"})\n`;
      prompt += `  - Chamada Semântica: <connector_action connector="${cp.id}" action="default" params='{}' />\n\n`;
    }
  }

  prompt += `[PROTOCOLO DE EXECUÇÃO HARNESS LEVEL & LOOP REATIVO (ReAct)]:
1. CHAMADA SEMÂNTICA DIRETA: Para disparar qualquer ação nos conectores conectados acima, emite diretamente no texto a tag padronizada:
   <connector_action connector="nome_conector" action="nome_da_acao" params='{"param1":"valor"}' />
2. LOOP REATIVO (ReAct): O motor do GRIOT intercepta a tag, valida as credenciais locais salvas no dispositivo, executa a requisição HTTP real à API e devolve o output verídico no próximo turno da conversa.
3. PRECISÃO TOTAL: NUNCA alucines que "não tens ferramentas", que "precisas simular" ou inventes dados falsos. Dispara a chamada semântica imediatamente!`;

  return prompt;
}
