# NestJS Observe SDK setup

> Superseded: MyGame replaced this vendor integration with the in-house system documented in `docs/backend-observability.md`. Retained only as cached research.

Source: https://docs.nestjs.com/observability/sdk
Fetched: 2026-10-08

The official NestJS observability package is `@nestjs/observe` (not `@nestjs/observability`). It requires `@nestjs/core` 11.1.4 or newer.

Setup requires a matched module/instrument pair from `createObserveModule()`:

```ts
export const { ObserveModule, ObserveInstrument } = createObserveModule();
```

Import `ObserveModule.forRoot()` or `forRootAsync()` into the root module with `appKey`, `appSecret`, and `serviceId`, then pass the instrument during bootstrap:

```ts
NestFactory.create(AppModule, { instrument: ObserveInstrument });
```

Credentials come from the NestJS Observe project's API Keys page and must remain outside source control. `serviceVersion` is optional but recommended for release comparisons.
