# WorkLink

Plataforma corporativa de gestão e comunicação remota (WCAG 2.1): login com MFA simulado,
abertura e administração de chamados com fila de atendimento, mural de comunicados e central de documentos em tempo real.

Projeto Prático (2º Trabalho) de Desenvolvimento de Soluções Remotas.

## Como configurar o Firebase

1. Acesse https://console.firebase.google.com e crie um projeto (pode desativar o Google Analytics).
2. No menu **Build > Firestore Database**, clique em **Criar banco de dados** (modo produção, região mais próxima).
3. Aba **Regras** do Firestore: cole as regras da seção abaixo e clique em **Publicar**.
4. Em **Configurações do projeto (engrenagem) > Seus aplicativos**, clique no ícone **Web (</>)**, registre o app e copie o objeto `firebaseConfig`.
5. Abra `index.html` e substitua os valores `COLE_AQUI` pelos seus.

## Regras do Firestore (somente demonstração)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{id} {
      allow read, write: if true;
    }
    match /auditoria/{id} {
      allow read, write: if true;
    }
    match /atividades/{id} {
      allow read, write: if true;
    }
    match /chamados/{id} {
      allow read, write: if true;
    }
    match /posts/{id} {
      allow read, write: if true;
    }
  }
}
```

Atenção: essas regras deixam o banco aberto. Use somente dados fictícios.
Em produção, a leitura do painel exigiria autenticação (Firebase Auth com MFA).

## Publicar no GitHub Pages

1. Suba `index.html` e este README para um repositório.
2. **Settings > Pages**: escolha a branch `main` e a pasta `/ (root)`.
3. Aguarde alguns minutos e acesse `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Demonstração

- Login: nome, perfil e senha quaisquer; código MFA `123456`.
- **Gestor** (nível máximo): administra chamados, cria atividades para funcionários e representantes, publica comunicados e abre todos os documentos.
- **Representante Diamante**: administra chamados, publica comunicados e cria atividades somente para funcionários comuns, gerenciando apenas as que criou.
- **Funcionário**: só pede ajuda (abre chamados) e vê as próprias atividades e o mural.
- **TI (monitoramento)**: vê tudo em modo leitura e tem o painel de monitoramento com o registro de auditoria.

## Limitação importante

No protótipo, as permissões são aplicadas pela interface. Em produção, elas precisam ser
aplicadas também no servidor (Firebase Authentication com MFA e regras do Firestore por perfil).
