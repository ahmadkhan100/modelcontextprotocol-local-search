declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export class McpServer {
    constructor(options: { name: string; version: string });
    
    tool(
      name: string,
      schema: any,
      handler: (args: any) => Promise<{
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      }>
    ): void;
    
    resource(
      name: string,
      template: any,
      handler: (uri: any, params: any) => Promise<any>
    ): void;
    
    connect(transport: any): Promise<void>;
  }
  
  export class ResourceTemplate {
    constructor(template: string, options: any);
  }
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  export const CallToolRequestSchema: any;
  export const ListToolsRequestSchema: any;
  export const ToolSchema: any;
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
  }
  
  function pdfParse(dataBuffer: Buffer, options?: any): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'faiss-node' {
  export class IndexFlatL2 {
    constructor(dimension: number);
    
    add(vector: number[]): void;
    search(vector: number[], k: number): { labels: number[]; distances: number[] };
    getDimension(): number;
    ntotal(): number;
    write(fname: string): void;
    static read(fname: string): IndexFlatL2;
  }
}

declare module '@xenova/transformers' {
  export function pipeline(
    task: string,
    model: string,
    options?: any
  ): Promise<any>;
  
  export const env: {
    cacheDir: string;
    allowLocalModels: boolean;
  };
}

declare module 'minimatch' {
  export function minimatch(path: string, pattern: string, options?: any): boolean;
}

declare module 'glob' {
  export function glob(
    pattern: string | string[],
    options?: any
  ): Promise<string[]>;
} 