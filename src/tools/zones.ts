/** @module tools/zones — `vex_zones` action-dispatch MCP tool for zone and country management. */

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
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_zones` MCP tool covering all zone and country operations. */
export function registerZoneTools(server: McpServer): void {
  actionTool(server, "vex_zones", "Manage Vendure zones and their country/region members.", {
    list: {
      summary: "List zones with optional pagination.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
      },
      handler: async (a) => jsonContent(await listZones(a as Parameters<typeof listZones>[0])),
    },
    get: {
      summary: "Get a single zone by ID with its country/region members.",
      shape: { id: z.string().describe("Zone ID") },
      handler: async (a) => jsonContent(await getZone(a.id as string)),
    },
    create: {
      summary: "Create a new zone, optionally assigning members immediately.",
      shape: {
        name: z.string().describe("Zone name (e.g. 'India', 'EU', 'North America')"),
        memberIds: z.array(z.string()).optional().describe("Country/region IDs to add to the zone"),
      },
      handler: async (a) => jsonContent(await createZone(a as unknown as Parameters<typeof createZone>[0])),
    },
    update: {
      summary: "Update an existing zone.",
      shape: {
        id: z.string().describe("Zone ID"),
        name: z.string().optional().describe("New zone name"),
      },
      handler: async (a) => jsonContent(await updateZone(a as unknown as Parameters<typeof updateZone>[0])),
    },
    delete: {
      summary: "Delete a zone by ID.",
      shape: { id: z.string().describe("Zone ID") },
      handler: async (a) => jsonContent(await deleteZone(a.id as string)),
    },
    add_members: {
      summary: "Add countries/regions to an existing zone.",
      shape: {
        zoneId: z.string().describe("Zone ID"),
        memberIds: z.array(z.string()).describe("Country/region IDs to add"),
      },
      handler: async (a) => jsonContent(await addMembersToZone(a as unknown as Parameters<typeof addMembersToZone>[0])),
    },
    remove_members: {
      summary: "Remove countries/regions from an existing zone.",
      shape: {
        zoneId: z.string().describe("Zone ID"),
        memberIds: z.array(z.string()).describe("Country/region IDs to remove"),
      },
      handler: async (a) => jsonContent(await removeMembersFromZone(a as unknown as Parameters<typeof removeMembersFromZone>[0])),
    },
    create_country: {
      summary: "Create a new country/region.",
      shape: {
        name: z.string().describe("Country name (e.g. 'India', 'United States')"),
        code: z.string().describe("ISO country code (e.g. 'IN', 'US', 'GB')"),
        enabled: z.boolean().optional().describe("Whether the country is enabled (default: true)"),
      },
      handler: async (a) => jsonContent(await createCountry(a as unknown as Parameters<typeof createCountry>[0])),
    },
    list_countries: {
      summary: "List available countries/regions with optional pagination.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
      },
      handler: async (a) => jsonContent(await listCountries(a as Parameters<typeof listCountries>[0])),
    },
  });
}
