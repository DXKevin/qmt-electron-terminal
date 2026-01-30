import { Buffer } from 'buffer';

export class Protocol {
  /**
   * Encodes a message to a Buffer: [Length 4B LE][JSON String]
   */
  static encode(data: any): Buffer {
    // 1. Convert object to JSON string
    const jsonStr = JSON.stringify(data);
    const bodyBuffer = Buffer.from(jsonStr, 'utf8');

    // 2. Prepare Header (4 bytes, Little Endian)
    const header = Buffer.alloc(4);
    header.writeUInt32LE(bodyBuffer.length, 0);

    // 3. Concat
    return Buffer.concat([header, bodyBuffer]);
  }

  /**
   * Stateful parser for streaming data with Length-Prefix framing
   */
  static createParser(onMessage: (msg: any) => void) {
    let buffer = Buffer.alloc(0);
    
    return (chunk: Buffer) => {
      // Append new chunk to the buffer
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        // Phase 1: Check if we have enough bytes for the header (4 bytes)
        if (buffer.length < 4) {
          break; // Wait for more data
        }

        // Phase 2: Read the Body Length (Little Endian)
        const bodyLen = buffer.readUInt32LE(0);

        // Phase 3: Check if we have the full message (Header + Body)
        if (buffer.length < 4 + bodyLen) {
          break; // Wait for the rest of the body
        }

        // Phase 4: Extract Body
        const bodyRaw = buffer.subarray(4, 4 + bodyLen);
        
        try {
          const jsonStr = bodyRaw.toString('utf8');
          const msg = JSON.parse(jsonStr);
          onMessage(msg);
        } catch (e) {
          console.error("JSON Parse Error:", e);
        }

        // Phase 5: Advance Buffer (Remove processed message)
        buffer = buffer.subarray(4 + bodyLen);
      }
    };
  }
}