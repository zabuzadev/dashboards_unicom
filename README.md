# Unicom Digital Dashboard

Dashboard interno para a **Unicom Digital** — Agência de Marketing Digital Médico.

Centraliza métricas de engajamento organico e trafego pago de todos os clientes em um so lugar, com sugestoes de otimizacao geradas por IA.

---

## Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML + CSS + JavaScript puro (GitHub Pages) |
| Backend | Supabase Edge Functions (Deno) |
| Banco de Dados | Supabase PostgreSQL |
| IA | Claude API (claude-sonnet-4-20250514) |
| Dados | Meta Marketing API + Instagram Graph API |

---

## Funcionalidades

- **Engajamento Organico**: seguidores, alcance, taxa de engajamento, evolucao temporal
- **Trafego Pago**: investimento, leads, CPL, CTR, frequencia por campanha/conjunto
- **Funil de Conversao**: Impressoes -> Cliques -> Mensagens -> Consultas -> Pacientes
- **Sugestoes IA**: analise automatica das metricas com Claude, priorizadas por impacto
- **Alertas Visuais**: indicadores de CPL > R$80, CTR < 1%, frequencia > 3.5, engajamento < 2%

---

## Estrutura do Repositorio

```
dashboards_unicom/
├── index.html                          # Dashboard principal
├── css/
│   └── style.css                       # Estilos (tema escuro)
├── js/
│   └── app.js                          # Logica do frontend
├── supabase/
│   └── functions/
│       ├── meta-metrics/index.ts       # Busca metricas de trafego pago
│       ├── organic-metrics/index.ts    # Busca metricas organicas
│       └── ai-suggestions/index.ts     # Gera sugestoes com Claude
├── sql/
│   └── schema.sql                      # Schema do banco de dados
├── .github/
│   └── workflows/
│       └── deploy.yml                  # Deploy automatico no GitHub Pages
└── README.md
```

---

## Configuracao Passo a Passo

### 1. Clonar o Repositorio

```bash
git clone https://github.com/zabuzadev/dashboards_unicom.git
cd dashboards_unicom
```

### 2. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. No Supabase Studio, va em **SQL Editor**
3. Cole e execute o conteudo de `sql/schema.sql`

### 3. Implantar as Edge Functions

Instale o Supabase CLI:
```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU-PROJECT-REF
```

Implante as funcoes:
```bash
supabase functions deploy meta-metrics
supabase functions deploy organic-metrics
supabase functions deploy ai-suggestions
```

### 4. Configurar Variaveis de Ambiente no Supabase

No Supabase Studio > **Edge Functions > Secrets**, adicione:

| Variavel | Descricao |
|----------|-----------|
| `META_ACCESS_TOKEN` | Token de acesso da Meta API (ver secao abaixo) |
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic (Claude) |

### 5. Configurar o Frontend

Edite o arquivo `js/app.js` e substitua:

```javascript
// CONFIGURAR: URL do seu projeto Supabase
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';

// CONFIGURAR: Chave anon publica do Supabase
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-AQUI';
```

Encontre esses valores em: Supabase Studio > **Settings > API**

### 6. Ativar GitHub Pages

1. Va em **Settings > Pages**
2. Em "Source", selecione **GitHub Actions**
3. O deploy sera automatico a cada push na branch `main`

### 7. Cadastrar Clientes

No Supabase Studio > **Table Editor > clients**, insira os clientes:

```sql
INSERT INTO clients (name, instagram_account_id, ads_account_id, specialty)
VALUES 
  ('Dr. Joao Silva', '17841234567890', '123456789', 'Cirurgia Plastica'),
  ('Clinica Bem Estar', '17841234567891', '987654321', 'Clinica Geral');
```

---

## Como Obter o Token da Meta

### Passo a Passo

1. Acesse o [Meta for Developers](https://developers.facebook.com)
2. Crie um App do tipo "Business"
3. Adicione os produtos: **Marketing API** e **Instagram Graph API**
4. Em **Tools > Graph API Explorer**, gere um token com as permissoes:
   - `ads_read`
   - `ads_management`
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_read_engagement`
5. Converta para um **token de longa duracao** (60 dias):

```
GET https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=SEU_APP_ID
  &client_secret=SEU_APP_SECRET
  &fb_exchange_token=SEU_TOKEN_CURTO
```

6. Para tokens permanentes, use o **System User Token** no Business Manager

### Conectar Contas via Business Manager

1. Acesse [business.facebook.com](https://business.facebook.com)
2. Va em **Configuracoes > Contas > Contas de Anuncio**
3. Adicione as contas dos clientes
4. Copie o **ID da Conta de Anuncio** (ex: `act_123456789`)
5. Em **Contas > Contas do Instagram**, vincule as contas
6. Copie o **Instagram Account ID**

---

## Variaveis de Alerta (Configuravel)

No arquivo `js/app.js`, funcao `THRESHOLDS`:

```javascript
const THRESHOLDS = {
  CPL_MAX: 80,          // CPL acima de R$80 = critico
  CTR_MIN: 1,           // CTR abaixo de 1% = critico
  FREQUENCY_MAX: 3.5,   // Frequencia acima de 3.5 = critico
  ENGAGEMENT_MIN: 2,    // Engajamento organico abaixo de 2% = critico
  BUDGET_MAX_PCT: 110,  // Orcamento acima de 110% do planejado = critico
};
```

---

## Suporte

Para duvidas sobre configuracao, entre em contato com a equipe da Unicom Digital.
