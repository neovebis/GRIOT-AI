-- ==============================================================================
-- MIGRATION: 20260927000000_init_griot_schema.sql
-- Descrição: Estrutura base de dados central do ecossistema GRIOT
-- ==============================================================================

-- 1. Espaços de Trabalho e Perfis de Utilizador
CREATE TABLE IF NOT EXISTS public.griot_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.griot_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Conversas, Mensagens e Artefactos
CREATE TABLE IF NOT EXISTS public.griot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.griot_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova Conversa',
  model TEXT DEFAULT 'gemini-flash',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.griot_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  parts JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.griot_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'code',
  content TEXT NOT NULL,
  language TEXT,
  version INT NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Economia de Créditos GCU (Griot Compute Units)
CREATE TABLE IF NOT EXISTS public.griot_gcu_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 5,
  reserved NUMERIC NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free',
  renew_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_gcu_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit', 'refund')),
  reason TEXT NOT NULL,
  balance_after NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Missões SHEOL e GriotGPU
CREATE TABLE IF NOT EXISTS public.griot_gpu_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  objective TEXT NOT NULL,
  kernel TEXT NOT NULL DEFAULT 'griotgpu',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Studio e Connected Compute
CREATE TABLE IF NOT EXISTS public.griot_studio_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.griot_workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  brief JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_studio_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.griot_workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.griot_studio_projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.griot_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.griot_workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'plugin',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Habilitação de RLS (Row Level Security)
ALTER TABLE public.griot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_gcu_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_gcu_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_gpu_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_studio_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.griot_user_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS padrão por utilizador
DO $$ 
BEGIN
  -- griot_conversations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'griot_conversations' AND policyname = 'Users can access own conversations') THEN
    CREATE POLICY "Users can access own conversations" ON public.griot_conversations
      FOR ALL USING (auth.uid() = user_id);
  END IF;

  -- griot_messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'griot_messages' AND policyname = 'Users can access own messages') THEN
    CREATE POLICY "Users can access own messages" ON public.griot_messages
      FOR ALL USING (auth.uid() = user_id);
  END IF;

  -- griot_artifacts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'griot_artifacts' AND policyname = 'Users can access own artifacts') THEN
    CREATE POLICY "Users can access own artifacts" ON public.griot_artifacts
      FOR ALL USING (auth.uid() = user_id);
  END IF;

  -- griot_gcu_wallets
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'griot_gcu_wallets' AND policyname = 'Users can view own wallet') THEN
    CREATE POLICY "Users can view own wallet" ON public.griot_gcu_wallets
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  -- griot_user_profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'griot_user_profiles' AND policyname = 'Users can manage own profile') THEN
    CREATE POLICY "Users can manage own profile" ON public.griot_user_profiles
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
