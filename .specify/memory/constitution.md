# Marcus — Constitución

Principios no negociables. Cualquier spec, plan o código que los viole debe ser rechazado antes de mergear.

## I. Lean, manual-first

Marcus es un asistente personal single-user. No es producto, no es SaaS, no es multi-tenant. Cualquier decisión que tenga sentido "si escaláramos a 10k usuarios" pero no para un usuario, **no aplica**.

- Nada de Kafka, microservicios, event sourcing, DDD táctico/estratégico.
- Nada de colas distribuidas cuando un `setTimeout` alcanza.
- Nada de frameworks de autorización cuando el único usuario soy yo.

## II. Código limpio > código inteligente

- TypeScript estricto (`strict: true`). Tipos explícitos donde agregan claridad, inferencia donde no.
- Nombres largos y claros sobre abreviaturas ingeniosas.
- Tres líneas duplicadas son mejores que una abstracción prematura. Abstrae cuando ya hay tres usos reales, no antes.
- Comentarios solo cuando el *por qué* no es obvio. Nunca para explicar el *qué*.

## III. Monolito modular bien hecho

- Una capacidad = un módulo NestJS con responsabilidad única (`whatsapp`, `llm`, `memory`, `tasks`, `calendar`, etc.).
- Los módulos se comunican por inyección de dependencias, no por event bus global.
- Agregar una capacidad nueva no debe requerir refactor de capacidades existentes.

## IV. Tool use antes que parsing manual

Toda capacidad que el agente pueda disparar debe exponerse como **tool de Claude** con `input_schema` JSON. Nada de regex sobre el mensaje del usuario, nada de "parsing de intents" artesanal.

## V. Configuración por entorno

- Secretos y endpoints en `.env`, **nunca** hardcodeados.
- `.env.example` actualizado con cada variable nueva.
- Fallar ruidosamente al arrancar si falta una variable obligatoria (`ConfigService.getOrThrow`).

## VI. Errores en todos los bordes externos

Cada integración con sistemas de terceros (Baileys, Anthropic, Google, DB) debe:
1. Tener un `try/catch` con log estructurado del error.
2. Degradar con un mensaje accionable al usuario final ("⚠️ Google rechazó el evento: conflicto de horario"), no con stack traces.
3. No tragarse silenciosamente excepciones.

## VII. Persistencia mínima viable

- SQLite + Prisma por default. Migrar a Postgres es cambiar una línea de `schema.prisma`.
- Nada de ORMs "custom" ni queries SQL crudas si Prisma resuelve.
- Migraciones versionadas en `prisma/migrations/`, nunca `db push` en nada que no sea sandbox local.

## VIII. Un spec, una feature, un PR

- Un directorio bajo `specs/` por feature, numerado secuencialmente.
- El PR que implementa el spec referencia el número (`feat(001): bootstrap baileys eco`).
- Nada de "de paso refactoreé X". Si hace falta, es un spec aparte.

## IX. Verificable antes de declarar done

Cada spec tiene criterios de aceptación testeables manualmente (o automáticamente cuando aplique). Si no puedo probar que funciona en <5 minutos, no está terminado.

## X. Honestidad con incertidumbre

Cuando un agente o yo mismo no estamos seguros del quirk actual de una lib (ej: API de Baileys entre versiones), lo decimos en el plan/spec. No inventamos. Preferible "verificar antes de codear" a debuggear una alucinación.
