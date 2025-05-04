declare namespace NodeJS {
  interface Global {
    process: Process;
  }

  interface Process {
    argv: string[];
    exit(code?: number): void;
    cwd(): string;
  }
}

declare const process: NodeJS.Process;

declare module 'pdf-parse' {
  export default function parse(buffer: Buffer): Promise<{
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }>;
}

// This addresses a TypeScript warning for import.meta
declare interface ImportMeta {
  url: string;
} 