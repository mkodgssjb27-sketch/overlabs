# 🚀 OVER LABS — Como Publicar e Atualizar o App

## Visão Geral

Seu app funciona como **PWA (Progressive Web App)** — os alunos instalam pelo navegador e ele vira um ícone na tela do celular, parecendo um app nativo. Funciona em **Android e iPhone**.

Quando você faz alterações e executa o deploy, o app no celular dos alunos **detecta automaticamente** e exibe:  
**"🔄 Nova versão disponível! — Atualizar"**

---

## PASSO 1 — Instalar Git (uma vez só)

1. Baixe em: https://git-scm.com/download/win
2. Instale com as opções padrão (Next, Next, Install)
3. Feche e reabra o VS Code

---

## PASSO 2 — Criar conta no GitHub (uma vez só)

1. Acesse https://github.com e crie uma conta gratuita
2. Crie um repositório novo:
   - Nome: `overlabs` (ou o que preferir)
   - Marque **Public**
   - NÃO marque "Add README"
   - Clique **Create repository**

---

## PASSO 3 — Conectar sua pasta ao GitHub (uma vez só)

Abra o terminal no VS Code (Ctrl+`) e execute estes comandos **um por vez**:

```powershell
cd "c:\Users\ESCRITORIO1\Meu Drive\PROGRAMAS\files"

git init
git branch -M main
git add -A
git commit -m "Versão inicial"
git remote add origin https://github.com/SEU_USUARIO/overlabs.git
git push -u origin main
```

> ⚠️ Substitua `SEU_USUARIO` pelo seu nome de usuário do GitHub.  
> Na primeira vez ele vai pedir para fazer login no GitHub.

---

## PASSO 4 — Ativar GitHub Pages (uma vez só)

1. No GitHub, vá ao seu repositório `overlabs`
2. Clique em **Settings** (aba lá em cima)
3. No menu da esquerda, clique em **Pages**
4. Em **Source**, selecione:
   - Branch: **main**
   - Folder: **/ (root)**
5. Clique **Save**
6. Aguarde 1-2 minutos. Seu app estará em:
   
   ```
   https://SEU_USUARIO.github.io/overlabs/aluno.html
   ```

**Este é o link que você envia para os alunos.**  
Eles abrem uma vez, clicam em "Instalar App" e pronto — ícone na tela.

---

## COMO ATUALIZAR O APP (dia a dia)

Sempre que implementar algo novo no VS Code:

### Opção A — Script automático (recomendado)
```powershell
.\deploy.ps1
```

Ou com mensagem descritiva:
```powershell
.\deploy.ps1 -Msg "Adicionei tela de torneios"
```

### Opção B — Manual
```powershell
git add -A
git commit -m "Descrição da mudança"
git push origin main
```
> ⚠️ Na opção B, lembre de mudar a versão no `sw.js` manualmente (ex: `overlabs-v1` → `overlabs-v2`)

---

## O QUE ACONTECE NO CELULAR DO ALUNO

1. Aluno abre o app
2. O Service Worker verifica se há nova versão (a cada 60 segundos)
3. Se há atualização, aparece um banner laranja:  
   **"🔄 Nova versão disponível! — Atualizar"**
4. Aluno toca em "Atualizar" → app recarrega com tudo novo

---

## COMO OS ALUNOS INSTALAM (primeira vez)

### Android (Chrome)
1. Aluno abre o link no Chrome
2. Aparece banner "Instalar App" OU usa menu ⋮ → "Adicionar à tela inicial"
3. Ícone aparece na tela como app real

### iPhone (Safari)
1. Aluno abre o link no **Safari** (obrigatório ser Safari)
2. Toca no botão de compartilhar ⬆️
3. Toca em "Adicionar à Tela de Início"
4. Ícone aparece na tela

---

## RESUMO DO FLUXO

```
Você edita no VS Code
        ↓
Executa: .\deploy.ps1
        ↓
GitHub Pages atualiza (1-2 min)
        ↓
Aluno abre o app → vê "Atualizar" → toca → app novo!
```

---

## DÚVIDAS

**P: Preciso pagar alguma coisa?**  
R: Não. GitHub Pages é 100% gratuito.

**P: Funciona offline?**  
R: Sim! O app é cacheado pelo Service Worker. Dados do Firebase precisam de internet.

**P: Quantos alunos podem usar?**  
R: Sem limite. GitHub Pages suporta bastante tráfego gratuitamente.

**P: E o app do professor?**  
R: O professor.html pode continuar sendo acessado direto pelo navegador no PC, ou também pode ser acessado pelo link do GitHub Pages: `https://SEU_USUARIO.github.io/overlabs/professor.html`
