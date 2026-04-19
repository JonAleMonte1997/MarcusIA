import * as dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/oauth2callback';
const TOKENS_PATH = path.join(process.cwd(), 'tokens.google.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET deben estar en .env');
  process.exit(1);
}

async function main(): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });

  console.log('\nAbrí esta URL en el browser:\n');
  console.log(authUrl);
  console.log('\nEsperando callback en http://localhost:3000...\n');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Error: no se recibió código de autorización.');
        server.close();
        reject(new Error('No code in OAuth callback'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2>Autenticación exitosa. Podés cerrar esta pestaña.</h2>');
      server.close();
      resolve(code);
    });
    server.listen(3000);
    server.on('error', reject);
  });

  const { tokens } = await oauth2Client.getToken(code);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nTokens guardados en ${TOKENS_PATH}`);
  console.log('Ya podés iniciar Marcus normalmente.');
}

main().catch((err) => {
  console.error('Error durante la autenticación:', err);
  process.exit(1);
});
