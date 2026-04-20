import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  useMultiFileAuthState,
  type WASocket,
  type proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import type { InboundMessage, MessageHandler } from '../messaging.types';

const AUTH_DIR = 'auth_info_baileys';
const RECONNECT_DELAY_MS = 3000;
const MAX_TRACKED_SENT_IDS = 500;

@Injectable()
export class WhatsappService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly configuredOwnerJid?: string;
  private readonly acceptedJids = new Set<string>();
  private readonly sentIds = new Set<string>();
  private sock?: WASocket;
  private shuttingDown = false;
  private handler: MessageHandler = ({ text }) => `pong · ${text}`;

  constructor(private readonly config: ConfigService) {
    const owner = this.config.get<string>('OWNER_WHATSAPP_JID');
    if (owner && owner.trim().length > 0) {
      this.configuredOwnerJid = jidNormalizedUser(owner.trim());
      this.acceptedJids.add(this.configuredOwnerJid);
    }
  }

  async onModuleInit(): Promise<void> {
    this.logger.log(
      this.configuredOwnerJid
        ? `Owner JID del .env: ${this.configuredOwnerJid}`
        : 'OWNER_WHATSAPP_JID vacío: acepto self-chat del JID que se detecte al conectar.',
    );
    await this.connect();
  }

  onApplicationShutdown(): void {
    this.shuttingDown = true;
    this.sock?.end(undefined);
  }

  setHandler(fn: MessageHandler): void {
    this.handler = fn;
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.logger.log(
      `Usando WhatsApp Web v${version.join('.')} (isLatest=${isLatest})`,
    );
    const baileysLogger = pino({ level: 'warn' });

    const sock = makeWASocket({
      auth: state,
      version,
      logger: baileysLogger,
      browser: ['Marcus', 'Desktop', '1.0.0'],
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger.log(
          'QR nuevo — escaneá desde WhatsApp → Dispositivos vinculados:',
        );
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        this.registerSelfJids(sock);
        this.logger.log(
          `WhatsApp conectado. Acepto self-chat en: ${[...this.acceptedJids].join(', ') || '(ninguno)'}`,
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        this.logger.warn(
          `Conexión cerrada (status=${statusCode ?? 'desconocido'}, loggedOut=${loggedOut})`,
        );

        if (loggedOut) {
          this.logger.error(
            'Sesión cerrada desde el teléfono. Borrá auth_info_baileys/ y volvé a escanear.',
          );
          return;
        }
        if (this.shuttingDown) return;

        setTimeout(() => {
          void this.connect();
        }, RECONNECT_DELAY_MS);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        await this.handleIncoming(msg, sock);
      }
    });
  }

  private registerSelfJids(sock: WASocket): void {
    const user = sock.user;
    const candidates = [user?.id, user?.lid, user?.phoneNumber];
    for (const raw of candidates) {
      if (!raw) continue;
      this.acceptedJids.add(jidNormalizedUser(raw));
    }
  }

  private async handleIncoming(
    msg: proto.IWebMessageInfo,
    sock: WASocket,
  ): Promise<void> {
    // Self-chat mode: aceptamos mensajes originados por esta cuenta
    // (fromMe=true) cuyo remoteJid es alguno de los JIDs conocidos del dueño
    // (configurado + detectados desde sock.user: id/lid/phoneNumber).
    if (!msg.key?.fromMe) return;

    const rawJid = msg.key?.remoteJid;
    if (!rawJid) return;
    const jid = jidNormalizedUser(rawJid);

    if (!this.acceptedJids.has(jid)) {
      this.logger.debug(`Ignorado fromMe en JID no aceptado: ${jid}`);
      return;
    }

    // Si el mensaje lo envió Marcus mismo, no loopear.
    const id = msg.key.id;
    if (id && this.sentIds.has(id)) return;

    const text =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      null;
    if (!text) return;

    try {
      await sock.sendPresenceUpdate('composing', jid);
      const reply = await this.handler({ text, jid });
      await sock.sendPresenceUpdate('paused', jid);
      if (reply) {
        const sent = await sock.sendMessage(jid, { text: reply });
        const sentId = sent?.key?.id;
        if (sentId) this.rememberSentId(sentId);
      }
    } catch (err) {
      await sock.sendPresenceUpdate('paused', jid).catch(() => undefined);
      const error = err as Error;
      this.logger.error(
        `Handler falló para "${text}": ${error.message}`,
        error.stack,
      );
      await sock
        .sendMessage(jid, {
          text: '⚠️ Marcus tuvo un error procesando tu mensaje.',
        })
        .catch(() => undefined);
    }
  }

  private rememberSentId(id: string): void {
    this.sentIds.add(id);
    if (this.sentIds.size > MAX_TRACKED_SENT_IDS) {
      const oldest = this.sentIds.values().next().value;
      if (oldest) this.sentIds.delete(oldest);
    }
  }
}
