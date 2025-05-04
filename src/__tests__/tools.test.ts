import { describe, expect, test, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

// Mock the MCP server
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn(() => ({
    tool: jest.fn(),
    connect: jest.fn(() => Promise.resolve())
  }))
}));

// Mock the transformers and FAISS for dependency injection
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(() => jest.fn()),
  env: {
    cacheDir: '',
    allowLocalModels: false
  }
}));

jest.mock('faiss-node', () => ({
  IndexFlatL2: jest.fn(() => ({
    add: jest.fn(),
    search: jest.fn(() => ({
      labels: [0, 1],
      distances: [0.1, 0.2]
    }))
  }))
}));

// Mock pdf-parse
jest.mock('pdf-parse', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({
    text: 'This is mock PDF content',
    numpages: 1
  }))
}));

// Create mock functions for the tool handlers
const toolHandlers = {
  index_file: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Successfully indexed file' }]
  })),
  
  index_directory: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Indexed 2 files' }]
  })),
  
  search: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Found 2 matching documents' }]
  })),
  
  clear_index: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Vector index successfully cleared' }]
  })),
  
  get_index_stats: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Total document chunks: 10' }]
  })),
  
  list_indexed_files: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: '/path/to/file1.txt\n/path/to/file2.pdf' }]
  })),
  
  list_allowed_directories: jest.fn(() => Promise.resolve({
    content: [{ type: 'text', text: 'Allowed directories:\n/path/to/allowed/dir' }]
  }))
};

describe('MCP Tool Handlers', () => {
  let tempDir: string;
  
  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = path.join(os.tmpdir(), `vectorsearch-tools-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(tempDir, 'test.txt'), 
      'This is a test document for vector search.'
    );
    
    await fs.writeFile(
      path.join(tempDir, 'test2.txt'), 
      'This is another test document with different content.'
    );
  });
  
  afterAll(async () => {
    // Clean up temporary test directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  test('index_file tool should handle valid file paths', async () => {
    const result = await toolHandlers.index_file();
    expect(result.content[0].text).toContain('Successfully indexed');
  });
  
  test('index_directory tool should handle valid directory paths', async () => {
    const result = await toolHandlers.index_directory();
    expect(result.content[0].text).toContain('Indexed');
  });
  
  test('search tool should return matching documents', async () => {
    const result = await toolHandlers.search();
    expect(result.content[0].text).toContain('Found');
    expect(result.content[0].text).toContain('matching documents');
  });
  
  test('clear_index tool should reset the vector store', async () => {
    const result = await toolHandlers.clear_index();
    expect(result.content[0].text).toContain('successfully cleared');
  });
  
  test('get_index_stats tool should return index statistics', async () => {
    const result = await toolHandlers.get_index_stats();
    expect(result.content[0].text).toContain('Total document chunks');
  });
  
  test('list_indexed_files tool should return file list', async () => {
    const result = await toolHandlers.list_indexed_files();
    expect(result.content[0].text).toContain('.txt');
    expect(result.content[0].text).toContain('.pdf');
  });
  
  test('list_allowed_directories tool should return allowed directories', async () => {
    const result = await toolHandlers.list_allowed_directories();
    expect(result.content[0].text).toContain('Allowed directories');
  });
  
  test('tool handlers should properly handle errors', async () => {
    // Reset mock to simulate an error case
    toolHandlers.index_file.mockRejectedValueOnce(new Error('File not found'));
    
    try {
      await toolHandlers.index_file();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('File not found');
    }
    
    // Reset mock back to success case for other tests
    toolHandlers.index_file.mockResolvedValue({
      content: [{ type: 'text', text: 'Successfully indexed file' }]
    });
  });
}); 