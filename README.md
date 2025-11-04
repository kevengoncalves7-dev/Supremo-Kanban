# Supremo Kanban

Um quadro de tarefas semanal para a **Loja Supremo Açaí e Sorvetes** com login via Google, permissões de usuário (ADM/USER) e integração em tempo real com o Firestore.

## Principais funcionalidades

- **Login Google real**: usuários acessam com sua conta Google (Firebase Auth).  
- **Papéis (ADM/USER)**: as permissões são definidas via *custom claims* no token do usuário.  
  - *Admin* pode criar, editar e excluir tarefas.  
  - *User* só pode mover as tarefas que lhe foram atribuídas.  
- **Quadro Kanban por semana**: 7 colunas (Seg–Dom) com seções “A Fazer”, “Em andamento” e “Concluído”.  
- **Progresso pessoal**: barra que mostra quantas tarefas da semana você já concluiu.  
- **Notificações e lembretes**: pop‑ups 1h antes e 1 min depois do prazo (modo demo usa segundos).  
- **Termo de ciência**: o usuário escolhe se autoriza notificações e agendamento na agenda.  
- **Modo demo**: para testar lembretes rapidamente (use em desenvolvimento).  
- **Tema Supremo**: cores roxo, dourado e verde, cabeçalhos com degradé e padrão sutil, emojis nas seções.

## Rodar localmente

1. Clone este repositório e instale as dependências:

   ```bash
   git clone ...
   cd supremo-kanban
   npm i
   ```

2. Copie `.env.example` para `.env.local` e preencha com as variáveis do seu projeto Firebase (Web Config).  
   Você encontra esses valores em **Configurações do Projeto → Geral → Seus apps**.

   ```bash
   cp .env.example .env.local
   # edite .env.local com apiKey, authDomain, projectId, etc.
   ```

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Acesse `http://localhost:3000`. Você verá a tela de login com Google.

## Definir o primeiro Administrador

A aplicação usa *custom claims* do Firebase para definir o papel do usuário (`role = 'ADMIN'` ou `role = 'USER'`). Para marcar o seu usuário como **ADMIN**:

1. No console do Firebase, gere uma **chave de serviço** em *Configurações do Projeto → Contas de serviço*.  
   Baixe o arquivo JSON e salve na raiz do projeto como `serviceAccount.json`. **Não versionar!**
2. Instale o SDK Admin (caso ainda não tenha):

   ```bash
   npm i firebase-admin
   ```

3. Rode o script passando o e‑mail que deve se tornar ADMIN:

   ```bash
   node set-admin.js seu-email@gmail.com
   ```

4. Faça logout e login novamente no app para que o token seja atualizado.  
   Após isso, você terá acesso às funcionalidades de administrador.

## Deploy (Vercel)

1. Crie um repositório **privado** no GitHub (ex.: `supremo-kanban`).
2. Faça push do código:

   ```bash
   git init
   git add .
   git commit -m "deploy"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/supremo-kanban.git
   git push -u origin main
   ```

3. No Firebase Auth → **Domínios autorizados**, adicione o domínio da Vercel (`*.vercel.app`).
4. Na Vercel, importe o repositório e defina as variáveis de ambiente `NEXT_PUBLIC_FIREBASE_*` com os valores do Firebase.
5. Faça o deploy.  
   A aplicação ficará acessível no domínio gerado pela Vercel.

## Integração com Google Agenda (opcional)

O projeto inclui um modal de consentimento para agendar eventos no Google Agenda, mas a implementação do agendamento real não está ativada por padrão. Para habilitar:

1. Crie um projeto na [Google Cloud Console](https://console.cloud.google.com/) e habilite a API Google Calendar.
2. Gere um **OAuth Client ID** do tipo Web e adicione `https://SEU_DOMINIO` às URIs autorizadas.
3. Implemente a chamada à API do Google Calendar no momento da criação/edição de tarefas no frontend ou via Cloud Functions no backend.

## Licença

Este projeto é apenas um exemplo educacional e não possui licença específica. Adapte conforme suas necessidades.