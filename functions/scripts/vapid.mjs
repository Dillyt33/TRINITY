// Generates the key pair that signs Trinity's notifications. Run once: npm run vapid
import { generateVAPIDKeys } from 'web-push';

const { publicKey, privateKey } = generateVAPIDKeys();
console.log(`
1) Add this line to functions/.env:

VAPID_PUBLIC_KEY=${publicKey}

2) Store the private key as a secret (paste it when asked):

firebase functions:secrets:set VAPID_PRIVATE_KEY

${privateKey}
`);
