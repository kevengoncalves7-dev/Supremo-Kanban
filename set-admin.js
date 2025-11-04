// Script para definir CLAIM de ADMIN para um usuário (custom claim)
// Uso: node set-admin.js email_do_admin@dominio.com
const admin = require('firebase-admin');

const email = process.argv[2];
if (!email) {
  console.error('Uso: node set-admin.js email@dominio.com');
  process.exit(1);
}

try {
  const serviceAccount = require('./serviceAccount.json'); // coloque sua chave aqui (NÃO comitar)
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (e) {
  console.error(
    'Erro carregando serviceAccount.json. Coloque o arquivo na raiz do projeto.\n',
    e
  );
  process.exit(1);
}

(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { role: 'ADMIN' });
    console.log('OK! role=ADMIN aplicado para', email, 'UID:', user.uid);
    console.log('Faça logout/login no app para atualizar o token.');
    process.exit(0);
  } catch (e) {
    console.error('Falhou:', e);
    process.exit(1);
  }
})();