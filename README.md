# WorkLink

slide : https://docs.google.com/presentation/d/1DQjLOmNzjtdXaIMosOSyfrJdJM64f5M8p79ELytRVQs/edit?usp=sharing

Plataforma corporativa de gestão e comunicação remota (WCAG 2.1): login com e-mail/senha (Firebase Authentication) e verificação em duas etapas (MFA), abertura e administração de chamados com fila de atendimento priorizada (QoS), atividades por equipe, mural de comunicados, central de documentos e painel de monitoramento com auditoria assinada digitalmente (RSA-PSS).

Projeto Prático (2º Trabalho) de Desenvolvimento de Soluções Remotas.

## Estrutura dos arquivos

- `index.html`: estrutura semântica, acessibilidade e cabeçalho `Content-Security-Policy` (CSP).
- `style.css`: aparência, tema escuro, alto contraste e tabelas responsivas.
- `script.js`: lógica de telas, Firebase Auth + Firestore (com modo local de reserva), MFA, assinatura RSA-PSS e QoS.
- `firestore.rules`: regras de segurança do Cloud Firestore (firewall de aplicação por perfil).
- `.github/workflows/deploy.yml`: workflow do GitHub Actions que injeta os Secrets e publica no GitHub Pages.

## Recursos de Redes e Segurança implementados

- **Autenticação real (Firebase Authentication):** login por e-mail e senha, com sessão apenas em memória (`inMemoryPersistence`) e encerramento automático após 15 minutos de inatividade.
- **MFA (simulado):** código aleatório de 6 dígitos (`crypto.getRandomValues`) com validade de 60 segundos, máximo de 3 tentativas e 3 reenvios. Em produção, seria substituído por TOTP/SMS via Firebase Identity Platform.
- **Controle de acesso (RBAC) e Firewall de aplicação (`firestore.rules`):** permissões validadas no servidor do Firestore por perfil (`func`, `diamante`, `gestor`, `ti`), bloqueio de alteração do próprio perfil, auditoria somente para acréscimo (append-only) e limite de frequência de 1 chamado a cada 10 segundos por usuário (`/limites`).
- **Criptografia (TLS + RSA-PSS 2048):** tráfego criptografado via HTTPS/TLS; cada usuário gera no navegador (Web Crypto API) um par de chaves RSA-PSS 2048 bits com chave privada não exportável no IndexedDB. Todo evento de auditoria é assinado e verificado pela TI no painel de Monitoramento.
- **Proteção no navegador (CSP):** `<meta http-equiv="Content-Security-Policy">` restringe scripts e conexões ao próprio domínio e aos serviços do Firebase.
- **QoS e adaptação de rede:** fila de chamados ordenada por prioridade (`Alta` > `Média` > `Baixa`) com envelhecimento a cada 30 minutos para evitar espera infinita; monitoramento de rede (Network Information API) e ativação automática do Modo leve em conexões lentas (`2g`/`slow-2g` ou economia de dados).
- **Modelo de nuvem:** Front-end estático no GitHub Pages (CDN + HTTPS) e Back-end como serviço (PaaS/BaaS) no Firebase (Auth + Firestore gerenciado pelo Google Cloud, substituindo infraestrutura SAN/NAS própria).

## Como configurar o Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e abra (ou crie) seu projeto.
2. **Ativar autenticação:** vá em **Build > Authentication > Sign-in method**, habilite **E-mail/senha** e salve.
3. **Criar o Firestore:** em **Build > Firestore Database**, crie o banco de dados em modo produção (caso ainda não exista).
4. **Publicar as regras de segurança:** na aba **Regras** do Firestore, cole todo o conteúdo do arquivo `firestore.rules` deste repositório e clique em **Publicar**.
5. **Obter as credenciais do app Web:** em **Configurações do projeto (engrenagem) > Seus aplicativos**, registre o app Web (`</>`) e anote os 6 valores de `firebaseConfig`.
6. **Restringir a API Key (recomendado):** no [Google Cloud Console](https://console.cloud.google.com/apis/credentials), selecione a chave de API do projeto, em **Restrições de aplicativo** escolha **Sites** e libere apenas `https://SEU-USUARIO.github.io/*`. *(Importante: como a chave anterior esteve no histórico do Git, restrinja-a ao domínio do seu GitHub Pages.)*

## Como publicar no GitHub Pages com Secrets

> **Nota de segurança:** o GitHub Pages serve arquivos estáticos, portanto os valores dos Secrets são injetados no `script.js` durante o build. No Firebase, a `apiKey` é pública por design — o que protege o banco são o **Firebase Authentication** e as **Regras do Firestore (`firestore.rules`)**. Usar Secrets mantém o repositório desacoplado do ambiente.

1. No repositório do GitHub, vá em **Settings > Secrets and variables > Actions** e crie os 6 secrets com os valores do seu `firebaseConfig`:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
2. Vá em **Settings > Pages** e, em **Build and deployment > Source**, selecione **GitHub Actions**.
3. Faça push para a branch `main` (ou execute manualmente em **Actions > Deploy no GitHub Pages > Run workflow**).

## Primeiro acesso e definição do Gestor

Por segurança, toda conta criada pela tela de cadastro entra sempre como **Funcionário** (`func`). Para definir o primeiro **Gestor**:

1. Crie sua conta normalmente pela tela **Criar conta** do site publicado.
2. No **Firebase Console > Firestore Database > Dados**, abra a coleção `usuarios`, localize o documento da sua conta e altere o campo `perfil` de `func` para `gestor`.
3. Recarregue a página e faça login novamente. A partir daí, a aba **Equipe** aparece para o Gestor promover outros usuários para `diamante`, `gestor` ou `ti`.

## Perfis de acesso

- **Gestor:** administra chamados, cria e gerencia atividades para funcionários e representantes, publica comunicados, abre todos os documentos e gerencia os perfis na aba **Equipe**.
- **Representante Diamante:** administra chamados, publica comunicados e cria atividades somente para funcionários comuns, gerenciando apenas as que criou.
- **Funcionário:** abre chamados (vendo apenas os próprios e sua posição na fila), consulta as atividades em que foi indicado e lê o mural.
- **TI (monitoramento):** acesso somente leitura a tudo + painel de **Monitoramento** com métricas de rede/QoS, resumo de arquitetura e trilha de auditoria com verificação de assinatura RSA.

## Modo local (sem Firebase)

Se você abrir `index.html` direto do computador (sem passar pelo deploy do GitHub Actions), os marcadores `__FIREBASE_*__` não estarão preenchidos e o sistema entra automaticamente em **modo local em memória** (os dados ficam apenas na aba aberta e o cadastro permite escolher o perfil para facilitar testes).
