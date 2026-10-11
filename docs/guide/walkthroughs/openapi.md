# OpenAPI for Commoners Services

This walkthrough covers how to use the [OpenAPI standard](https://www.openapis.org/) to document your commoners services, generate type-safe clients, and integrate Swagger UI.

## Why OpenAPI?

Commoners services are HTTP servers that communicate with your frontend via REST APIs. OpenAPI provides:

- **Contract-first design:** Define your API before implementing it
- **Type-safe clients:** Generate TypeScript types from your spec
- **Interactive documentation:** Swagger UI for exploring and testing endpoints
- **Cross-language consistency:** Same spec works for Node, Python, and Rust services

## Creating an OpenAPI Spec

Place your spec alongside the service source:

```
src/services/api/
├── openapi.yaml
├── index.ts          # Node service
└── ...
```

**openapi.yaml:**
```yaml
openapi: 3.0.3
info:
  title: My Service API
  version: 1.0.0
paths:
  /echo:
    post:
      summary: Echo the input
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                message:
                  type: string
      responses:
        '200':
          description: Echoed message
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: Service is healthy
```

## Language-Specific Examples

### Node.js (Express + express-openapi-validator)

```ts
// src/services/api/index.ts
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import { join } from 'path'

const app = express()
app.use(express.json())

// Validate all requests/responses against the OpenAPI spec
app.use(
  OpenApiValidator.middleware({
    apiSpec: join(__dirname, 'openapi.yaml'),
    validateRequests: true,
    validateResponses: true,
  })
)

app.post('/echo', (req, res) => {
  res.json({ message: req.body.message })
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))
```

### Python (FastAPI)

FastAPI generates OpenAPI specs automatically:

```python
# src/services/api/main.py
from fastapi import FastAPI
import uvicorn
import os

app = FastAPI(title="My Service API", version="1.0.0")

@app.post("/echo")
def echo(body: dict):
    return {"message": body["message"]}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
```

FastAPI automatically serves the OpenAPI spec at `/openapi.json` and Swagger UI at `/docs`.

### Rust (utoipa)

```rust
use actix_web::{web, App, HttpServer, HttpResponse};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(paths(echo, health))]
struct ApiDoc;

#[utoipa::path(post, path = "/echo")]
async fn echo(body: web::Json<serde_json::Value>) -> HttpResponse {
    HttpResponse::Ok().json(body.into_inner())
}

#[utoipa::path(get, path = "/health")]
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT").unwrap_or("3000".into()).parse().unwrap();

    HttpServer::new(|| {
        App::new()
            .service(SwaggerUi::new("/docs/{_:.*}").url("/openapi.json", ApiDoc::openapi()))
            .route("/echo", web::post().to(echo))
            .route("/health", web::get().to(health))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
```

## Frontend Type-Safe Client

Use [openapi-typescript](https://openapi-ts.dev/) to generate TypeScript types from your spec:

```bash
npx openapi-typescript src/services/api/openapi.yaml -o src/types/api.d.ts
```

Then use the generated types with `openapi-fetch`:

```ts
import createClient from 'openapi-fetch'
import type { paths } from './types/api'

// Use the service URL from commoners
const client = createClient<paths>({
  baseUrl: commoners.SERVICES.api.url,
})

const { data } = await client.POST('/echo', {
  body: { message: 'Hello!' },
})
// data is fully typed: { message: string }
```

## Swagger UI Integration

Serve Swagger UI as a static asset alongside your service. For FastAPI, this is built-in at `/docs`. For Node.js, use `swagger-ui-express`:

```ts
import swaggerUi from 'swagger-ui-express'
import YAML from 'yamljs'

const spec = YAML.load(join(__dirname, 'openapi.yaml'))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec))
```

Access the docs at your service URL + `/docs` — in development, this is typically `http://localhost:<port>/docs`.
