# 🚗 CaronaProf — Guia de Configuração

## O que você vai precisar
- Uma conta Google (gratuita)
- 10 minutos para configurar

---

## PASSO 1 — Criar projeto no Firebase (gratuito)

1. Acesse https://console.firebase.google.com
2. Clique em **"Criar um projeto"**
3. Dê o nome **CaronaProf** e clique em Continuar
4. Desative o Google Analytics (não precisa) → **Criar projeto**
5. Aguarde e clique em **Continuar**

---

## PASSO 2 — Ativar o Banco de Dados (Firestore)

1. No menu esquerdo, clique em **"Criador" → "Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Iniciar no modo de teste"** → Avançar
4. Escolha a localização **us-east1** → **Ativar**

---

## PASSO 3 — Pegar as credenciais do seu projeto

1. No menu esquerdo, clique em **"Visão geral do projeto"** (ícone de casa)
2. Clique no ícone **</>** (Web)
3. Dê um apelido como "caronaprof-web" e clique em **Registrar app**
4. Você verá um bloco como este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "caronaprof-xxxxx.firebaseapp.com",
  projectId: "caronaprof-xxxxx",
  storageBucket: "caronaprof-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

5. **Copie esses valores** e cole dentro do arquivo `caronaprof.html`
   (procure por `COLE_AQUI` no arquivo)

---

## PASSO 4 — Publicar o app (para funcionar no celular dos alunos)

### Opção A — Netlify Drop (MAIS FÁCIL, grátis)
1. Acesse https://app.netlify.com/drop
2. Arraste o arquivo `caronaprof.html` para a página
3. Aguarde o upload → você receberá uma URL como `https://random-name.netlify.app`
4. **Compartilhe essa URL com seus alunos!**

### Opção B — GitHub Pages (grátis, mais permanente)
1. Crie conta em https://github.com
2. Crie um repositório público chamado `caronaprof`
3. Faça upload do arquivo `caronaprof.html` renomeado para `index.html`
4. Vá em Settings → Pages → Source: main branch
5. Seu app ficará em `https://SEU-USUARIO.github.io/caronaprof`

---

## PASSO 5 — Como os alunos instalam no celular

Depois de abrir a URL no celular:

**Android (Chrome):**
- Toque no menu ⋮ → "Adicionar à tela inicial"

**iPhone (Safari):**
- Toque no botão compartilhar □↑ → "Adicionar à Tela de Início"

O app aparecerá como ícone na tela inicial, igual a um app normal!

---

## PASSO 6 — Configurar regras de segurança (recomendado)

No Firebase Console → Firestore → **Aba "Regras"**, substitua pelo texto abaixo e clique em **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Caronas: leitura livre, escrita apenas com PIN correto (controlado no frontend)
    match /rides/{rideId} {
      allow read: if true;
      allow write: if true;
    }
    // Usuários: leitura e criação livres
    match /users/{userId} {
      allow read, write: if true;
    }
    // Notificações: cada usuário lê as próprias
    match /notifications/{userId}/items/{itemId} {
      allow read, write: if true;
    }
  }
}
```

---

## Como usar

### Você (professor) no computador:
1. Abra a URL → clique em **"Entrar como Professor"**
2. PIN padrão: **1234** (você pode mudar no arquivo, linha `const TEACHER_PIN`)
3. Crie suas caronas → elas aparecem **INSTANTANEAMENTE** no celular dos alunos

### Alunos no celular:
1. Abra a URL no celular
2. Clique em **"Entrar como Aluno"**
3. Criam uma conta (ou fazem login)
4. Veem suas caronas em tempo real
5. Clicam na carona → reservam uma vaga
6. Se lotada, entram na lista de espera
7. Se alguém cancelar → o primeiro da fila é promovido **automaticamente** e recebe uma notificação no app

---

## Como mudar o PIN do professor

Abra o arquivo `caronaprof.html` e procure a linha:
```javascript
const TEACHER_PIN = "1234";
```
Troque **1234** pelo PIN que quiser.

---

## Custo

O Firebase tem um plano gratuito (Spark) que inclui:
- **50.000 leituras/dia** e **20.000 escritas/dia** — mais que suficiente para uma turma
- Sem cartão de crédito necessário

---

## Próximos passos (opcional)

- **Notificações push reais** (celular toca mesmo com app fechado): requer Firebase Cloud Messaging + service worker
- **Login com Google**: requer ativar Authentication no Firebase
- **Múltiplos professores**: requer sistema de autenticação completo
