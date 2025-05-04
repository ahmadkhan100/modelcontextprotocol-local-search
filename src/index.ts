#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { pipeline, env } from "@xenova/transformers";
import hnsw from "hnswlib-node";
import { minimatch } from 'minimatch';
import { glob } from 'glob';

// Import pdf-parse dynamically to avoid errors
const pdfParse = async (buffer: Buffer) => {
  try {
    // Using dynamic import for compatibility
    const pdfParseModule = await import('pdf-parse');
    return pdfParseModule.default(buffer);
  } catch (error) {
    console.error("Error loading pdf-parse module:", error);
    throw error;
  }
};

// Set the Transformers.js cache and allocation
env.cacheDir = path.join(os.tmpdir(), 'transformers.js');
env.allowLocalModels = false;

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-vectorsearch <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map((dir: string) =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(args.map(async (dir: string) => {
  try {
    const stats = await fs.stat(expandHome(dir));
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some((dir: string) => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some((dir: string) => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some((dir: string) => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const IndexFileArgsSchema = z.object({
  path: z.string(),
});

const IndexDirectoryArgsSchema = z.object({
  path: z.string(),
  extensions: z.array(z.string()).optional().default(['.txt', '.pdf']),
  excludePatterns: z.array(z.string()).optional().default([])
});

const SearchArgsSchema = z.object({
  query: z.string(),
  numResults: z.number().optional().default(5),
  threshold: z.number().optional().default(0.7)
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Vector Store
interface Document {
  id: number;
  file: string;
  chunkId: number;
  text: string;
  vector?: number[];
}

class VectorStore {
  private embeddingModel: any;
  private documents: Document[] = [];
  private index: any = null;
  private initialized = false;
  private dimension = 384; // MiniLM dimension
  private fileTypes: Record<string, number> = {};
  
  constructor() {
    // Initialize asynchronously
    this.init();
  }
  
  private async init() {
    try {
      console.error('Initializing embedding model...');
      this.embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      
      // Initialize HNSWLib index
      this.index = new hnsw.HierarchicalNSW('l2', this.dimension);
      this.index.initIndex(1000); // Max elements, can be increased later
      
      this.initialized = true;
      console.error('Vector store initialized successfully.');
    } catch (error) {
      console.error('Error initializing vector store:', error);
      this.initialized = false;
    }
  }
  
  async waitForInitialization(): Promise<void> {
    if (this.initialized) return;
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.initialized) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  
  async addDocument(file: string, text: string): Promise<void> {
    await this.waitForInitialization();
    
    // Update file type stats
    const fileExt = path.extname(file).toLowerCase();
    this.fileTypes[fileExt] = (this.fileTypes[fileExt] || 0) + 1;
    
    // Split text into chunks (simple approach - improve as needed)
    const chunks = this.chunkText(text);
    
    for (let i = 0; i < chunks.length; i++) {
      const doc: Document = {
        id: this.documents.length,
        file,
        chunkId: i,
        text: chunks[i]
      };
      
      // Generate embedding
      const embedding = await this.generateEmbedding(chunks[i]);
      if (embedding) {
        doc.vector = embedding;
        
        // Add to HNSWLib index
        if (this.index) {
          this.index.addPoint(embedding, this.documents.length);
        }
        
        this.documents.push(doc);
      }
    }
  }
  
  private chunkText(text: string, maxChunkSize: number = 512): string[] {
    // Simple chunking by splitting on newlines and then combining
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length <= maxChunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = paragraph;
        } else {
          // Handle case where a single paragraph is > maxChunkSize
          chunks.push(paragraph.substring(0, maxChunkSize));
          currentChunk = '';
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingModel) return null;
    
    try {
      const result = await this.embeddingModel(text, {
        pooling: 'mean',
        normalize: true
      });
      
      return Array.from(result.data);
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }
  
  async search(query: string, numResults: number = 5, threshold: number = 0.7): Promise<{ score: number; document: Document }[]> {
    await this.waitForInitialization();
    
    if (!this.index || this.documents.length === 0) {
      return [];
    }
    
    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(query);
    if (!queryEmbedding) {
      throw new Error('Failed to generate embedding for query');
    }
    
    // Search the index
    const k = Math.min(numResults, this.documents.length);
    const searchResults = this.index.searchKnn(queryEmbedding, k);
    
    // Map results back to documents
    return searchResults.neighbors.map((idx: number, i: number) => {
      // Convert distance to similarity score
      const distance = searchResults.distances[i];
      const similarity = 1 / (1 + distance);
      
      return {
        score: similarity,
        document: this.documents[idx]
      };
    }).filter((result: any) => result.score >= threshold);
  }
  
  clear(): void {
    this.documents = [];
    if (this.initialized) {
      // Reinitialize the index
      this.index = new hnsw.HierarchicalNSW('l2', this.dimension);
      this.index.initIndex(1000);
    }
    this.fileTypes = {};
  }
  
  getStats(): { documentCount: number; fileTypes: Record<string, number> } {
    return {
      documentCount: this.documents.length,
      fileTypes: this.fileTypes
    };
  }
  
  getIndexedFiles(): string[] {
    const uniqueFiles = new Set<string>();
    for (const doc of this.documents) {
      uniqueFiles.add(doc.file);
    }
    return Array.from(uniqueFiles);
  }
}

// File processing functions
async function extractTextFromFile(filePath: string): Promise<string> {
  const fileExt = path.extname(filePath).toLowerCase();
  
  try {
    if (fileExt === '.pdf') {
      try {
        const dataBuffer = await fs.readFile(filePath);
        const pdfData = await pdfParse(dataBuffer);
        return pdfData.text || '';
      } catch (pdfError) {
        console.error(`Error parsing PDF ${filePath}:`, pdfError);
        return `[PDF file: ${path.basename(filePath)} - Error parsing content]`;
      }
    } else {
      // Handle text files
      return await fs.readFile(filePath, 'utf-8');
    }
  } catch (error: any) {
    console.error(`Error extracting text from ${filePath}:`, error?.message || error);
    return '';
  }
}

// Initialize vector store
const vectorStore = new VectorStore();

// Server setup
const server = new McpServer({
  name: "vector-search-server",
  version: "0.1.0",
});

// Tool definitions
server.tool("index_file",
  z.object({
    path: z.string().optional(),
    file_path: z.string().optional(), // Added for compatibility
  }).refine(data => data.path || data.file_path, {
    message: "Either path or file_path must be provided"
  }),
  async (params) => {
    try {
      // Use either path or file_path parameter
      const filePath = params.path || params.file_path;
      if (!filePath) {
        throw new Error("No file path provided");
      }
      
      const validPath = await validatePath(filePath);
      
      // Extract text and add to vector store
      const text = await extractTextFromFile(validPath);
      if (!text) {
        throw new Error(`Could not extract text from ${filePath}`);
      }
      
      await vectorStore.addDocument(validPath, text);
      
      return {
        content: [{ type: "text", text: `Successfully indexed ${filePath}` }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("index_directory",
  z.object({
    path: z.string().optional(),
    dir_path: z.string().optional(), // Added for compatibility
    directory: z.string().optional(), // Added for compatibility
    extensions: z.array(z.string()).optional().default(['.txt', '.pdf']),
    excludePatterns: z.array(z.string()).optional().default([])
  }).refine(data => data.path || data.dir_path || data.directory, {
    message: "Either path, dir_path, or directory must be provided"
  }),
  async (params) => {
    try {
      // Use any of the provided path parameters
      const dirPath = params.path || params.dir_path || params.directory;
      if (!dirPath) {
        throw new Error("No directory path provided");
      }
      
      const validPath = await validatePath(dirPath);
      
      // Find all files with matching extensions
      const pattern = `**/*@(${params.extensions.map((ext: string) => ext.replace(/^\./, '')).join('|')})`;
      const files = await glob(pattern, { 
        cwd: validPath,
        absolute: true
      });
      
      // Filter out excluded files
      const filteredFiles = files.filter((file: string) => {
        const relativePath = path.relative(validPath, file);
        return !params.excludePatterns.some((pattern: string) => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });
      });
      
      if (filteredFiles.length === 0) {
        return {
          content: [{ type: "text", text: `No matching files found in ${dirPath}` }]
        };
      }
      
      // Index each file
      const results = [];
      for (const file of filteredFiles) {
        try {
          const text = await extractTextFromFile(file);
          if (text) {
            await vectorStore.addDocument(file, text);
            results.push(`Successfully indexed ${file}`);
          } else {
            results.push(`No text extracted from ${file}`);
          }
        } catch (error: any) {
          results.push(`Error indexing ${file}: ${error?.message || error}`);
        }
      }
      
      return {
        content: [{ type: "text", text: `Indexed ${results.length} files:\n${results.join('\n')}` }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("search",
  z.object({
    query: z.string().optional(),
    q: z.string().optional(), // Added for compatibility
    search_query: z.string().optional(), // Added for compatibility
    text: z.string().optional(), // Added for compatibility
    numResults: z.number().optional().default(5),
    num_results: z.number().optional(), // Added for compatibility
    limit: z.number().optional(), // Added for compatibility
    threshold: z.number().optional().default(0.7)
  }).refine(data => data.query || data.q || data.search_query || data.text, {
    message: "A search query must be provided"
  }),
  async (params) => {
    try {
      // Use any of the provided query parameters
      const query = params.query || params.q || params.search_query || params.text;
      if (!query) {
        throw new Error("No search query provided");
      }
      
      // Use any of the provided result limit parameters
      const numResults = params.numResults || params.num_results || params.limit || 5;
      
      const results = await vectorStore.search(query, numResults, params.threshold);
      
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No matching documents found." }]
        };
      }
      
      const formattedResults = results.map((result, index) => {
        return `Result ${index + 1} (score: ${result.score.toFixed(4)})\nFile: ${result.document.file}\n---\n${result.document.text}\n`;
      });
      
      return {
        content: [{ type: "text", text: formattedResults.join('\n---\n\n') }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("clear_index",
  z.object({}),
  async () => {
    try {
      vectorStore.clear();
      return {
        content: [{ type: "text", text: "Vector index successfully cleared." }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("get_index_stats",
  z.object({}),
  async () => {
    try {
      const stats = vectorStore.getStats();
      const fileTypeInfo = Object.entries(stats.fileTypes)
        .map(([ext, count]) => `${ext}: ${count} files`)
        .join('\n');
        
      return {
        content: [{ 
          type: "text", 
          text: `Total document chunks: ${stats.documentCount}\n\nFile types:\n${fileTypeInfo || "No files indexed"}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("list_indexed_files",
  z.object({}),
  async () => {
    try {
      const files = vectorStore.getIndexedFiles();
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "No files have been indexed." }]
        };
      }
      
      return {
        content: [{ type: "text", text: files.join('\n') }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

server.tool("list_allowed_directories",
  z.object({}),
  async () => {
    try {
      return {
        content: [{
          type: "text",
          text: `Allowed directories:\n${allowedDirectories.join('\n')}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true
      };
    }
  }
);

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Vector Search Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
}); 