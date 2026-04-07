FROM rust:1.86-slim AS builder
WORKDIR /app

COPY apps/api/Cargo.toml apps/api/Cargo.lock ./apps/api/
COPY apps/api/src ./apps/api/src
RUN cargo build --manifest-path apps/api/Cargo.toml --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/api /usr/local/bin/api

EXPOSE 8080
CMD ["api"]
