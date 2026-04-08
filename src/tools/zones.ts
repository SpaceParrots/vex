import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listZones,
  getZone,
  createZone,
  updateZone,
  deleteZone,
  addMembersToZone,
  removeMembersFromZone,
  createCountry,
  listCountries,
} from "../services/zones.js";

function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerZoneTools(server: McpServer): void {
  server.tool(
    "vendure_get_zones",
    "List zones with optional pagination.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listZones(input))
  );

  server.tool(
    "vendure_get_zone",
    "Get a single zone by ID with its country/region members.",
    { id: z.string().describe("Zone ID") },
    async (input) => jsonContent(await getZone(input.id))
  );

  server.tool(
    "vendure_create_zone",
    "Create a new zone. Optionally assign country/region members immediately.",
    {
      name: z.string().describe("Zone name (e.g. 'India', 'EU', 'North America')"),
      memberIds: z.array(z.string()).optional().describe("Country/region IDs to add to the zone"),
    },
    async (input) => jsonContent(await createZone(input))
  );

  server.tool(
    "vendure_update_zone",
    "Update an existing zone.",
    {
      id: z.string().describe("Zone ID"),
      name: z.string().optional().describe("New zone name"),
    },
    async (input) => jsonContent(await updateZone(input))
  );

  server.tool(
    "vendure_delete_zone",
    "Delete a zone by ID.",
    { id: z.string().describe("Zone ID") },
    async (input) => jsonContent(await deleteZone(input.id))
  );

  server.tool(
    "vendure_add_members_to_zone",
    "Add countries/regions to an existing zone.",
    {
      zoneId: z.string().describe("Zone ID"),
      memberIds: z.array(z.string()).describe("Country/region IDs to add"),
    },
    async (input) => jsonContent(await addMembersToZone(input))
  );

  server.tool(
    "vendure_remove_members_from_zone",
    "Remove countries/regions from an existing zone.",
    {
      zoneId: z.string().describe("Zone ID"),
      memberIds: z.array(z.string()).describe("Country/region IDs to remove"),
    },
    async (input) => jsonContent(await removeMembersFromZone(input))
  );

  server.tool(
    "vendure_create_country",
    "Create a new country/region.",
    {
      name: z.string().describe("Country name (e.g. 'India', 'United States')"),
      code: z.string().describe("ISO country code (e.g. 'IN', 'US', 'GB')"),
      enabled: z.boolean().optional().describe("Whether the country is enabled (default: true)"),
    },
    async (input) => jsonContent(await createCountry(input))
  );

  server.tool(
    "vendure_get_countries",
    "List available countries/regions with optional pagination.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
    },
    async (input) => jsonContent(await listCountries(input))
  );
}
