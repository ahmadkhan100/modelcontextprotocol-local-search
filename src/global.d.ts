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