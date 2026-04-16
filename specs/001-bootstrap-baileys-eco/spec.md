# Spec: Bootstrap NestJS + Baileys eco

**Status:** ready
**Created:** 2026-04-16
**Owner:** Jonathan

## Contexto

Marcus todavía no existe como código. Antes de meter Claude, DB, tools y Google, necesito validar el canal de entrada/salida de forma aislada: WhatsApp ↔ Baileys ↔ NestJS. Baileys tiene quirks entre versiones, y no quiero debuggear dos cosas simultáneamente (mensajería + LLM) si algo rompe.

## Objetivo

Tener un proceso NestJS que se conecte a WhatsApp vía Baileys, reciba mis mensajes y me responda con un eco (`pong · <texto>`).

## Historias de usuario

- Como Jonathan, quiero escanear un QR una vez y que la sesión persista entre reinicios, para no re-parear cada vez que reinicio el proceso.
- Como Jonathan, quiero que cualquier persona que no sea yo sea ignorada, para evitar que un mensaje perdido dispare lógica no deseada (single-user by design).
- Como Jonathan, quiero ver logs claros cuando Baileys se conecta, desconecta o recibe un QR nuevo, para saber el estado sin adivinar.

## Criterios de aceptación

- [ ] `pnpm start:dev` arranca sin errores.
- [ ] Al primer arranque, la consola imprime un QR escaneable con WhatsApp → Dispositivos vinculados.
- [ ] Tras escanear, aparece en consola `WhatsApp conectado`.
- [ ] Si me envío a mí mismo el texto `hola`, recibo `pong · hola` en < 3 segundos.
- [ ] Reiniciar el proceso (`Ctrl+C`, `pnpm start:dev`) **no** pide QR de nuevo.
- [ ] Un mensaje enviado desde un JID distinto al `OWNER_WHATSAPP_JID` no genera respuesta ni error (se ignora en silencio).
- [ ] Una desconexión (matar Wi-Fi momentáneamente) dispara reconexión automática sin intervención.

## Fuera de alcance

- Claude / LLM / memoria conversacional (va en 002).
- Persistencia en DB (Prisma/SQLite). Todavía no hace falta.
- Mensajes multimedia (audio, imagen, video). Solo texto.
- Mensajes de grupos. Solo DMs del owner.
- Reconexión con backoff exponencial fancy — un `setTimeout` fijo de 3s alcanza; el hardening va en 005.

## Dependencias

Ninguna — es el primer spec.

## Riesgos / preguntas abiertas

- **Baileys cambia entre minors.** Las APIs que vamos a usar (`useMultiFileAuthState`, `messages.upsert` con `type: 'notify'`, `connection.update` con campos `connection`/`lastDisconnect`/`qr`) han sido estables, pero verificar contra los tipos de la versión instalada antes de codear.
- **`printQRInTerminal` está deprecated** en versiones recientes de Baileys. Lo manejamos manualmente con `qrcode-terminal` para tener control del formato y evitar warnings.
- **JID del owner** debe ser `<número_sin_plus>@s.whatsapp.net`. Si lo cargo mal en `.env`, el bot se conecta pero ignora todos mis mensajes — conviene loggear el JID configurado al arrancar para detectarlo rápido.
