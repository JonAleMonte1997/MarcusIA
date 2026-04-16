# Marcus — Roadmap de specs

Lista ordenada de features. Estado de cada una:
- `todo` — no hay spec todavía
- `draft` — spec escrito, sin plan aprobado
- `ready` — spec + plan + tasks, listo para ejecutar
- `in-progress` — código en marcha
- `done` — criterios de aceptación cumplidos

| # | Slug | Descripción corta | Status |
|---|------|-------------------|--------|
| 001 | `bootstrap-baileys-eco` | NestJS arranca, Baileys se conecta y hace eco | ready |
| 002 | `claude-memoria-conversacional` | Reemplaza eco por Claude Sonnet con historial persistente | todo |
| 003 | `tools-recordatorios-tareas` | Tool registry + tools de tasks (crear/listar/completar) | todo |
| 004 | `tools-google-calendar` | OAuth one-shot + tools de Google Calendar | todo |
| 005 | `hardening-minimo` | Errores uniformes, logs estructurados, reconexión robusta | todo |

## Backlog (post-MVP)

Ideas para después del MVP. No tienen número hasta que se priorizen.

- RAG sobre notas personales (Obsidian/Notion + embeddings).
- Voz bidireccional (Whisper STT → Agent → TTS PTT).
- Jobs proactivos (agente escribe primero: "son las 8, tenés standup en 15").
- Integraciones: Gmail, GitHub, Linear, banking webhooks.
- Harness de evaluación offline (replay de conversaciones vs agente actual).
- UI web (Next.js) leyendo la misma DB.
