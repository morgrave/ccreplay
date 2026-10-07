declare module "*.css";
interface Document {
  modelContext?: {
    registerTool(
      tool: {
        name: string;
        description: string;
        inputSchema: object;
        execute:
          | ((args: { seconds: number }) => unknown)
          | ((args: { query: string }) => unknown);
        annotations: object;
      },
      options: { signal: AbortSignal },
    ): void | Promise<void>;
  };
}
