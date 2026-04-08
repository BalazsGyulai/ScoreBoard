import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { createClient } from "@connectrpc/connect";
import { GameStream } from "./gen/homegame_pb";

// The gRPC server runs on port 8081 (API port + 1).
// In production this would be configured via env vars.
const GRPC_URL = process.env.NEXT_PUBLIC_GRPC_URL ?? "http://localhost:8081";

const transport = createGrpcWebTransport({
  baseUrl: GRPC_URL,
});

export const gameStreamClient = createClient(GameStream, transport);
