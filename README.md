# 🏟️ Gerenciador de Pelada

Uma aplicação web moderna para gerenciar listas de jogadores em partidas de futebol informal (pelada). Com autenticação integrada, você pode criar, compartilhar e administrar suas peladas de forma fácil e intuitiva.

## 🌟 Funcionalidades

- **Autenticação de Usuários**: Sistema de login seguro com Supabase
- **Criar Peladas**: Organize suas partidas com detalhes personalizados
- **Gerenciamento de Jogadores**: Adicione, remova e organize jogadores nas peladas
- **Acesso Público**: Compartilhe links públicos para que outros vejam a pelada
- **Painel Administrativo**: Gerencie suas peladas criadas
- **Interface Responsiva**: Funciona perfeitamente em desktop e mobile

## 🚀 Como Começar

### Pré-requisitos

- Node.js (v18 ou superior)
- npm ou bun como gerenciador de pacotes

### Instalação

```bash
# Clone o repositório
git clone <YOUR_GIT_URL>

# Navegue até o diretório do projeto
cd gerenciador-pelada

# Instale as dependências
npm install
# ou
bun install
```

### Desenvolvimento

```bash
# Inicie o servidor de desenvolvimento
npm run dev
# ou
bun run dev
```

A aplicação estará disponível em `http://localhost:5173`

## 🛠️ Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Constrói a aplicação para produção
- `npm run build:dev` - Constrói em modo desenvolvimento
- `npm run lint` - Executa o linter do projeto
- `npm run preview` - Visualiza a build de produção localmente
- `npm run test` - Executa os testes
- `npm run test:watch` - Executa os testes em modo watch

## 📦 Tecnologias Utilizadas

### Frontend
- **React 18** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **TailwindCSS** - Estilização utilitária
- **Shadcn/ui** - Componentes UI reutilizáveis
- **React Router** - Roteamento

### Estado e Dados
- **TanStack React Query** - Gerenciamento de estado de servidor
- **Supabase** - Backend como serviço (autenticação e database)
- **React Hook Form** - Gerenciamento de formulários

### Testes
- **Vitest** - Framework de testes
- **Testing Library** - Testes de componentes

## 🗄️ Estrutura do Projeto

```
src/
├── components/        # Componentes reutilizáveis
│   └── ui/           # Componentes Shadcn/ui
├── contexts/         # Context API (autenticação)
├── hooks/            # Custom hooks
├── integrations/     # Integrações externas (Supabase)
├── lib/              # Funções utilitárias
├── pages/            # Páginas da aplicação
└── test/             # Testes
```

## 🔐 Configuração do Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Configure as variáveis de ambiente no arquivo `.env.local`:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Execute as migrações do banco de dados localizadas em `supabase/migrations/`

## 📱 Rotas da Aplicação

- `/` - Página inicial
- `/auth` - Página de autenticação
- `/admin/:id` - Painel administrativo da pelada
- `/pelada/:id` - Visualização pública da pelada

## 🤝 Como Contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas alterações (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está disponível sob a licença MIT.

## 📞 Suporte

Para questões e sugestões, abra uma issue no repositório.

---

**Bora jogar!** ⚽️
