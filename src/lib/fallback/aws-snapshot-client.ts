import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { SnapshotObjectClient, SnapshotObjectCommand } from "./snapshot-store";

type AwsSend = (command: GetObjectCommand | PutObjectCommand) => Promise<{ Body?: { transformToString?: () => Promise<string> } } | void>;

export function createAwsSnapshotObjectClient(options: { send?: AwsSend } = {}): SnapshotObjectClient {
  const send: AwsSend = options.send ?? ((command) => new S3Client({}).send(command) as Promise<{ Body?: { transformToString?: () => Promise<string> } } | void>);
  return {
    async send(command: SnapshotObjectCommand) {
      if (command.operation === "get") {
        try {
          const response = await send(new GetObjectCommand({ Bucket: command.bucket, Key: command.key }));
          const body = response?.Body?.transformToString ? await response.Body.transformToString() : undefined;
          return { body };
        } catch (error) {
          if (error instanceof Error && error.name === "NoSuchKey") throw error;
          throw error;
        }
      }
      await send(new PutObjectCommand({ Bucket: command.bucket, Key: command.key, Body: command.body, ContentType: command.contentType }));
      return {};
    },
  };
}
