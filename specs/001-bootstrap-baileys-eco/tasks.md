# Tasks: Bootstrap NestJS + Baileys eco

**Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)

## Tareas

### 1. Scaffold NestJS
- **Done when:** `pnpm start` arranca sin errores y loggea algo del AppModule default.
- **Cmd:** `nest new . -p pnpm --skip-git` (desde la raíz del repo).
- **Notas:** limpiar `app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` — no los vamos a usar.

### 2. [P] Configurar `.env.example` y `.gitignore`
- **Done when:** `.env.example` incluye `OWNER_WHATSAPP_JID`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `DATABASE_URL`. `.gitignore` cubre `auth_info_baileys/`, `marcus.db`, `*.db-journal`, `.env`.
- **Archivos:** `.env.example`, `.gitignore`.

### 3. Instalar dependencias de Baileys
- **Done when:** `pnpm install` termina sin errores y `package.json` refleja las versiones fijadas.
- **Cmd:** `pnpm add @nestjs/config @whiskeysockets/baileys @hapi/boom qrcode-terminal pino && pnpm add -D @types/qrcode-terminal`.

### 4. Bootstrap sin HTTP en `main.ts`
- **Done when:** `main.ts` usa `NestFactory.createApplicationContext`. `pnpm start` no abre puerto.
- **Archivos:** `src/main.ts`.

### 5. AppModule con ConfigModule global
- **Done when:** `AppModule` importa `ConfigModule.forRoot({ isGlobal: true })` y `WhatsappModule`.
- **Archivos:** `src/app.module.ts`.

### 6. WhatsappModule + WhatsappService (eco)
- **Done when:** al escanear QR se conecta, al recibir `hola` responde `pong · hola`.
- **Archivos:** `src/whatsapp/whatsapp.module.ts`, `src/whatsapp/whatsapp.service.ts`.
- **Notas:**
  - `setHandler(fn)` inyectable; default = eco.
  - Filtrar por `key.fromMe` y por `OWNER_WHATSAPP_JID`.
  - Soportar `conversation` y `extendedTextMessage.text` al extraer texto.

### 7. Reconexión y manejo de logout
- **Done when:** desconectar y reconectar Wi-Fi recupera la sesión sin intervención; logout desde el teléfono no entra en loop de reintentos.
- **Archivos:** `src/whatsapp/whatsapp.service.ts` (ya cubierto en tarea 6; confirmar con test manual).

## Verificación final

Mapear 1:1 contra los criterios del spec.

- [ ] `pnpm start:dev` arranca limpio
- [ ] QR aparece en el primer arranque
- [ ] Log `WhatsApp conectado` tras pairing
- [ ] `hola` → `pong · hola` en < 3s
- [ ] Restart no pide QR
- [ ] Mensaje de JID ajeno no genera respuesta ni error
- [ ] Corte de red → reconexión automática
- [ ] `pnpm build` limpio
