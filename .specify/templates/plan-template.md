# Plan: <título del spec>

**Spec:** [spec.md](./spec.md)
**Status:** draft | approved | superseded

## Resumen técnico

3-5 líneas: cómo vamos a resolver lo que pide el spec, a grandes rasgos. Sin código.

## Decisiones de arquitectura

Formato de una línea por decisión, con trade-off explícito cuando lo hay.

| # | Decisión | Alternativa descartada | Por qué |
|---|----------|-----------------------|---------|
| 1 | ... | ... | ... |

## Módulos afectados

- `src/<modulo>/` — qué cambia y por qué.
- `src/<modulo>/` — ...

## Cambios en data model

Diff conceptual sobre `prisma/schema.prisma`. Si no toca DB, escribir "Ninguno" y seguir.

```prisma
model NuevoModelo {
  ...
}
```

## Dependencias nuevas

- `paquete@version` — para qué.

## Variables de entorno nuevas

- `FOO_API_KEY` — ...

## Riesgos y mitigaciones

- **Riesgo:** ... **Mitigación:** ...

## Plan de rollback

¿Cómo volvemos atrás si esto rompe? Aunque sea single-user, tener una línea escrita fuerza a pensarlo.

## Verificación antes de declarar done

Mapeo 1:1 con los "Criterios de aceptación" del spec. Cómo vamos a probar cada uno.

- Criterio 1 → cómo lo probamos.
- Criterio 2 → ...
