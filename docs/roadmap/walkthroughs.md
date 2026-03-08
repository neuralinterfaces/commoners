# Walkthrough Roadmap

## Completed

### OpenAPI for Services
Guide for using the OpenAPI standard to document commoners services, with language-specific examples (Node/Express, Python/FastAPI, Rust/utoipa) and frontend type-safe client generation.

See: [OpenAPI Walkthrough](/guide/walkthroughs/openapi)

### Local Service Networks
Guide for using `@commoners/local-services` to discover and share services across devices on the local network via Bonjour/mDNS.

See: [Local Services Walkthrough](/guide/walkthroughs/local-services)

## Planned

### `commoners share` CLI Command

A streamlined CLI interface for sharing services on the local network:

```bash
# Advertise all services
commoners share

# Advertise specific services
commoners share --services api,data

# Include metadata
commoners share --meta "version=1.0"
```

**Design goals:**
- Start specified services and advertise them via Bonjour
- Display a QR code for mobile device connections
- Show a TUI with connected clients and service status
- Support OpenAPI spec discovery for auto-generated Swagger UI

**Implementation notes:**
- Builds on `@commoners/local-services` plugin infrastructure
- The `share` command would be a new CLI subcommand in `packages/cli/`
- Bonjour TXT records can include metadata like OpenAPI spec URLs
- Since we don't anticipate that all services will be documented using OpenAPI, spec discovery should be optional and non-blocking

**Status:** Design phase. The `@commoners/local-services` plugin provides the foundation; the CLI command is the convenience layer on top.
