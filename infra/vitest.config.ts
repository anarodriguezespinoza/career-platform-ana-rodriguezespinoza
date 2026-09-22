import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "aws-cdk-lib": path.resolve(__dirname, "node_modules/aws-cdk-lib"),
      constructs: path.resolve(__dirname, "node_modules/constructs"),
    },
  },
});
