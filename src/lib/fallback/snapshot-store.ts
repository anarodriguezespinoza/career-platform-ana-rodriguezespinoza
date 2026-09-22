import { parseSnapshot, type PublishedSnapshot } from "./snapshot-schema";

export type SnapshotObjectCommand =
  | { operation: "get"; bucket: string; key: string }
  | { operation: "put"; bucket: string; key: string; body: string; contentType: "application/json" };

export type SnapshotObjectClient = {
  send(command: SnapshotObjectCommand): Promise<{ body?: string } | void>;
};

export type SnapshotStore = {
  read(): Promise<PublishedSnapshot | null>;
  write(snapshot: PublishedSnapshot): Promise<void>;
};

export function createS3SnapshotStore(options: {
  client: SnapshotObjectClient;
  bucket: string;
  key: string;
}): SnapshotStore {
  return {
    async read() {
      try {
        const response = await options.client.send({ operation: "get", bucket: options.bucket, key: options.key });
        if (!response || typeof response.body !== "string") throw new Error("Snapshot object has no body");
        return parseSnapshot(JSON.parse(response.body));
      } catch (error) {
        if (error instanceof Error && error.name === "NoSuchKey") return null;
        throw error;
      }
    },
    async write(snapshot) {
      const validated = parseSnapshot(snapshot);
      await options.client.send({
        operation: "put",
        bucket: options.bucket,
        key: options.key,
        body: JSON.stringify(validated),
        contentType: "application/json",
      });
    },
  };
}
