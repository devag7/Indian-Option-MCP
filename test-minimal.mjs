import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
console.error("IMPORTS OK");
const s = new McpServer({name:"test",version:"0.1"});
console.error("SERVER CREATED");
const t = new StdioServerTransport();
console.error("TRANSPORT CREATED");
await s.connect(t);
console.error("CONNECTED - READY");
