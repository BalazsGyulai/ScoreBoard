FROM rust:1.88-slim AS builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev protobuf-compiler && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/api/Cargo.toml apps/api/Cargo.lock ./apps/api/
COPY apps/api/build.rs ./apps/api/build.rs
COPY apps/api/src ./apps/api/src
COPY apps/api/.sqlx ./apps/api/.sqlx
# migrations/0008 is compiled into the binary (applied on startup, see src/db/schema.rs)
COPY apps/api/migrations ./apps/api/migrations
COPY packages/proto ./packages/proto

ENV SQLX_OFFLINE=true
RUN cargo build --manifest-path apps/api/Cargo.toml --release --bin api --bin import_legacy_mysql

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/apps/api/target/release/api ./api
COPY --from=builder /app/apps/api/target/release/import_legacy_mysql ./import_legacy_mysql
COPY apps/api/migrations ./migrations

EXPOSE 8080
CMD ["./api"]
