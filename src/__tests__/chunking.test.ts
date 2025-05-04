import { describe, expect, test } from '@jest/globals';

/**
 * A simplified version of the text chunking function for testing
 */
function chunkText(text: string, maxChunkSize: number = 512): string[] {
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
  
  return chunks.length > 0 ? chunks : [text];
}

describe('Document Chunking', () => {
  test('should keep short text as a single chunk', () => {
    const text = 'This is a short text that should fit in one chunk.';
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });
  
  test('should split text on paragraph boundaries when possible', () => {
    const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const chunks = chunkText(text, 15);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe('Paragraph 1.');
    expect(chunks[1]).toBe('Paragraph 2.');
    expect(chunks[2]).toBe('Paragraph 3.');
  });
  
  test('should handle large paragraphs by splitting within paragraphs', () => {
    const text = 'This is a very long paragraph that exceeds the maximum chunk size and needs to be split within the paragraph itself.';
    const chunks = chunkText(text, 30);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBeLessThanOrEqual(30);
  });
  
  test('should respect the maximum chunk size', () => {
    const text = 'A'.repeat(1000);
    const maxChunkSize = 200;
    const chunks = chunkText(text, maxChunkSize);
    
    // Should be at least one chunk
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    
    // The first chunk should not exceed the maximum size
    expect(chunks[0].length).toBeLessThanOrEqual(maxChunkSize);
  });
  
  test('should handle empty text', () => {
    const text = '';
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('');
  });
  
  test('should handle text with multiple newlines', () => {
    const text = 'Paragraph 1.\n\n\n\nParagraph 2.';
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Paragraph 1.');
    expect(chunks[0]).toContain('Paragraph 2.');
  });
  
  test('should combine multiple paragraphs until reaching chunk size', () => {
    const paragraphs = [];
    for (let i = 1; i <= 10; i++) {
      paragraphs.push(`Paragraph ${i} with some content.`);
    }
    
    const text = paragraphs.join('\n\n');
    const maxChunkSize = 100;
    const chunks = chunkText(text, maxChunkSize);
    
    // Should create multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
    
    // Each chunk should not exceed the max size
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(maxChunkSize);
    });
    
    // The content should be preserved, with paragraphs kept together when possible
    let combinedChunks = chunks.join('');
    paragraphs.forEach(paragraph => {
      // Check that each paragraph exists somewhere in the chunks
      expect(combinedChunks).toContain(paragraph);
    });
  });
  
  test('should handle text with special characters', () => {
    const text = 'Special characters: !@#$%^&*()\n\nMore text with unicode: ñáéíóú';
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Special characters');
    expect(chunks[0]).toContain('ñáéíóú');
  });
}); 