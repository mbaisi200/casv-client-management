# 📋 Sistema de Gerenciamento de Clientes CASV

Sistema web para gerenciamento de clientes de **vistos** e **passaportes**, com controle de datas (CASV / Consulado), alertas de prazos, painel de indicadores (BI) e geração de relatórios em PDF.

## ✨ Funcionalidades

- **Gestão de clientes** — cadastro, edição inline direto na tabela, histórico de alterações e exclusão (lógica).
- **Alertas automáticos** — cards de alerta para:
  - Consulado (próximos 5 dias)
  - CASV (próximos 5 dias)
  - Mudar Consulado
  - Aguardando
- **BI / Dashboard** — KPIs, distribuição por situação, estatísticas por agência, cidade e evolução mensal, com filtros e exportação em PDF.
- **Relatórios** — exportação da lista em PDF e relatório personalizado por período, agência, tipo e cidade.
- **Filtros e busca** — por nome, agência, cidade, tipo, situação e período de datas.
- **Backup** — exportação da base completa em arquivo `.txt` (JSON).
- **Responsivo** — layout adaptado para celulares, empilhando os dados em cards sem afetar a visualização no desktop.

## 🛠️ Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Firebase** (Authentication + Firestore)
- **jsPDF / jspdf-autotable** (relatórios)
- **lucide-react** (ícones)

## 🚀 Como rodar

```bash
# Instalar dependências
npm install        # ou: bun install

# Ambiente de desenvolvimento
npm run dev        # ou: bun run dev  (http://localhost:3000)

# Build de produção
npm run build      # ou: bun run build

# Servidor de produção
npm start
```

## ⚙️ Configuração

As credenciais do Firebase estão configuradas diretamente em `src/lib/firebase.ts` (projeto **consulado-6ea4f**). O primeiro acesso cria a conta pelo botão *"Criar conta (primeiro acesso)"* na tela de login.

## 📁 Estrutura

```
src/
├── app/                  # Páginas (App Router)
├── components/
│   ├── Dashboard.tsx     # Tela principal (lista, alertas, BI, relatórios)
│   ├── LoginForm.tsx     # Tela de login
│   └── ui/               # Componentes shadcn/ui
├── contexts/             # Contexto de autenticação (AuthContext)
├── hooks/                # Hooks customizados
├── lib/                  # Firebase e utilitários
└── types/                # Tipos TypeScript (Cliente, etc.)
```

## 🔐 Acesso

O acesso é restrito: é necessário criar uma conta (e-mail e senha) no primeiro acesso. A exclusão de clientes é lógica (`deleted: true`), preservando o histórico.
