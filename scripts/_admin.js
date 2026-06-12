// ============================================================
// Bootstrap admin reutilizável (Firebase Admin SDK)
// Uso:  const { admin, db } = require("./_admin");
//
// - firebase-admin é carregado da pasta functions/ (o node_modules da
//   raiz está quebrado; o de functions/ é o mesmo que vai pra produção).
// - A chave de serviço é lida de GOOGLE_APPLICATION_CREDENTIALS ou, como
//   fallback, de ~/.overlabs-secrets/carolampra-admin.json (FORA do Drive).
// - NUNCA coloque a chave dentro desta pasta (o Drive sincronizaria).
// ============================================================
const path = require("path");
const fs = require("fs");
const os = require("os");

const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(os.homedir(), ".overlabs-secrets", "carolampra-admin.json");

if (!fs.existsSync(KEY)) {
  console.error("[admin] Chave de serviço não encontrada em:", KEY);
  console.error("[admin] Gere a chave do projeto 'carolampra' e salve nesse caminho.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

module.exports = { admin, db, KEY };
