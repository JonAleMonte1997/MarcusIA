# Tool Use — Tareas y Recordatorios (Fase 3 MVP)

## Objetivo

Agregar tool use a Marcus para que Claude pueda crear, listar, editar, completar y eliminar tareas/recordatorios persistidos en SQLite.

---

## Arquitectura

```
AppService (sin cambios)
    └─► ClaudeService.chat()  ← recibe tools del ToolRegistry
            └─► Anthropic SDK (con tools)
                    └─► si tool_use → ToolRegistry.execute(name, input)
                                └─► TasksService (handler concreto)
```

**Módulos nuevos:**
- `ToolRegistryModule` — servicio global, mapa `name → { definition, handler }`
- `TasksModule` — `TasksService` con CRUD de tareas + registra sus tools en el registry al init

**Cambios en existentes:**
- `ClaudeService.chat()` — acepta tools, maneja el loop agentic (máx 1 ronda)
- `prisma/schema.prisma` — nueva tabla `Task`

---

## Modelo de datos

```prisma
model Task {
  id        Int       @id @default(autoincrement())
  jid       String
  title     String
  dueAt     DateTime?
  done      Boolean   @default(false)
  createdAt DateTime  @default(now())

  @@index([jid])
}
```

`jid` incluido para extensibilidad multi-usuario futura.

---

## Tools registradas

| Tool | Input | Acción |
|------|-------|--------|
| `create_task` | `title: string`, `due_at?: string (ISO8601)` | Inserta Task, devuelve `{ id }` |
| `list_tasks` | `include_done?: boolean (default false)` | Devuelve tareas del jid filtradas |
| `complete_task` | `id: number` | Marca `done=true`, devuelve confirmación |
| `edit_task` | `id: number`, `title?: string`, `due_at?: string` | Actualiza campos provistos |
| `delete_task` | `id: number` | Elimina la tarea |

---

## Flujo agentic (loop en ClaudeService)

Máximo 1 ronda de tools:

```
1. user envía mensaje
2. Claude responde:
   a. texto directo → devolver inmediatamente (sin cambios vs hoy)
   b. tool_use blocks → continuar
3. ClaudeService ejecuta cada tool via ToolRegistry.execute()
4. Arma mensaje role=tool con los tool_result
5. Segunda llamada a Claude → responde en texto
6. Devolver texto final al usuario
```

Si Claude solicita una segunda ronda de tools (edge case), se corta y se devuelve la respuesta parcial disponible.

---

## ToolRegistry — interfaz

```ts
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object; // JSON Schema
}

interface RegisteredTool {
  definition: ToolDefinition;
  handler: (input: Record<string, unknown>, jid: string) => Promise<unknown>;
}
```

`ToolRegistryService` expone:
- `register(tool: RegisteredTool): void`
- `getDefinitions(): ToolDefinition[]`
- `execute(name: string, input: Record<string, unknown>, jid: string): Promise<unknown>`

---

## Error handling

- Si una tool falla, devolver `{ error: "mensaje descriptivo" }` como `tool_result` — Claude lo lee y responde en lenguaje natural al usuario
- Si Claude devuelve un tipo de bloque no esperado, loggear y lanzar Error hacia AppService
- Sin reintentos — fallo limpio

---

## Archivos a crear/modificar

```
src/
  tool-registry/
    tool-registry.module.ts   (global)
    tool-registry.service.ts
  tasks/
    tasks.module.ts
    tasks.service.ts
prisma/
  schema.prisma               (agregar model Task)
  migrations/...              (generada con prisma migrate dev)
src/claude/
  claude.service.ts           (modificar chat() para tool use)
src/app.module.ts             (importar TasksModule)
```
