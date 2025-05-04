# Vector Search MCP Server

Node.js server implementing Model Context Protocol (MCP) for local vector search operations over your files and documents.

## Features

- PDF and text document processing
- Document chunking and vectorization
- Local embedding generation using transformers.js
- Vector similarity search with HNSWLib
- Operates entirely on the local machine (no data leaves your computer)
- ESM compatibility

**Note**: The server will only allow operations on files and directories specified via the command line arguments.

## API

### Resources

- `vector://search`: Vector search operations interface

### Tools

- **index_file**
  - Index a file for vector search
  - Input: `path` (string)
  - Handles PDF and text files

- **index_directory**
  - Index all files in a directory recursively
  - Input: 
    - `path` (string)
    - `extensions` (string[]): File extensions to index, defaults to ['.txt', '.pdf']
    - `excludePatterns` (string[]): Patterns to exclude

- **search**
  - Perform semantic search with a query
  - Input:
    - `query` (string): Search query
    - `numResults` (number): Number of results to return (default: 5)
    - `threshold` (number): Similarity threshold (default: 0.7)

- **clear_index**
  - Clear the current vector index
  - Input: None

- **get_index_stats**
  - Get statistics about the current index
  - Input: None
  - Returns:
    - Total documents indexed
    - File types
    - Index size

- **list_indexed_files**
  - List all files that have been indexed
  - Input: None

- **list_allowed_directories**
  - List the directories that the server is allowed to access
  - Input: None

## Usage with Cursor

Add this to your `~/.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "vector-search": {
      "command": "bunx",
      "args": [
        "mcp-server-vectorsearch@0.1.7",
        "/path/to/documents/directory",
        "/path/to/another/directory"
      ],
      "env": {}
    }
  }
}
```

## Usage with Claude Desktop
Add this to your `claude_desktop_config.json`:

### NPX

```json
{
  "mcpServers": {
    "vectorsearch": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-server-vectorsearch",
        "/path/to/documents/directory"
      ]
    }
  }
}
```

### Docker

```json
{
  "mcpServers": {
    "vectorsearch": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/path/to/documents/directory,dst=/data/documents",
        "mcp/vectorsearch",
        "/data/documents"
      ]
    }
  }
}
```

## Usage with VS Code

For quick installation, click the installation buttons below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=vectorsearch&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-server-vectorsearch%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=vectorsearch&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-server-vectorsearch%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=vectorsearch&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fdata%2Fdocuments%22%2C%22mcp%2Fvectorsearch%22%2C%22%2Fdata%2Fdocuments%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=vectorsearch&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fdata%2Fdocuments%22%2C%22mcp%2Fvectorsearch%22%2C%22%2Fdata%2Fdocuments%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

### NPX

```json
{
  "mcp": {
    "servers": {
      "vectorsearch": {
        "command": "npx",
        "args": [
          "-y",
          "mcp-server-vectorsearch",
          "${workspaceFolder}"
        ]
      }
    }
  }
}
```

### Docker

```json
{
  "mcp": {
    "servers": {
      "vectorsearch": {
        "command": "docker",
        "args": [
          "run",
          "-i",
          "--rm",
          "--mount", "type=bind,src=${workspaceFolder},dst=/data/documents",
          "mcp/vectorsearch",
          "/data/documents"
        ]
      }
    }
  }
}
```

## Technology

- **Embedding Model**: Xenova/all-MiniLM-L6-v2 (384-dimension vectors)
- **Vector Store**: HNSWLib for efficient approximate nearest neighbor search
- **PDF Processing**: pdf-parse for text extraction
- **Chunking**: Smart text chunking for optimal retrieval

## Build

Docker build:

```bash
docker build -t mcp/vectorsearch -f Dockerfile .
```

## NPM

The package is available on npm: https://www.npmjs.com/package/mcp-server-vectorsearch

```bash
npm install -g mcp-server-vectorsearch
```

## Release History

- **0.1.7** - Latest stable release with HNSWLib and improved PDF handling
- **0.1.6** - Experimental version with HNSWLib but limited PDF support
- **0.1.3** - Early version with HNSWLib but ESM compatibility issues
- **0.1.0** - Initial release with FAISS vector store

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository. 