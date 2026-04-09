/** @module tools/customers — MCP tools for customer management (list, get, create, update, delete, add-note). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addCustomerNote,
} from "../services/customers.js";
import { jsonContent } from "../output.js";

/** Registers all `vex_*_customer*` MCP tools for customer operations. */
export function registerCustomerTools(server: McpServer): void {
  server.tool(
    "vex_get_customers",
    "List customers with optional filters.",
    {
      take: z.number().optional().describe("Number of results to return"),
      skip: z.number().optional().describe("Number of results to skip"),
      filterByEmail: z.string().optional().describe("Filter by email (contains)"),
      filterByName: z.string().optional().describe("Filter by first or last name (contains)"),
    },
    async (input) => jsonContent(await listCustomers(input))
  );

  server.tool(
    "vex_get_customer",
    "Get a single customer by ID with full details.",
    { id: z.string().describe("Customer ID") },
    async (input) => jsonContent(await getCustomer(input.id))
  );

  server.tool(
    "vex_create_customer",
    "Create a new customer.",
    {
      emailAddress: z.string().describe("Customer email address"),
      firstName: z.string().describe("First name"),
      lastName: z.string().describe("Last name"),
      phoneNumber: z.string().optional().describe("Phone number"),
      title: z.string().optional().describe("Title (Mr, Mrs, etc.)"),
    },
    async (input) => jsonContent(await createCustomer(input))
  );

  server.tool(
    "vex_update_customer",
    "Update an existing customer.",
    {
      id: z.string().describe("Customer ID"),
      emailAddress: z.string().optional().describe("New email address"),
      firstName: z.string().optional().describe("New first name"),
      lastName: z.string().optional().describe("New last name"),
      phoneNumber: z.string().optional().describe("New phone number"),
    },
    async (input) => jsonContent(await updateCustomer(input))
  );

  server.tool(
    "vex_delete_customer",
    "Delete a customer by ID.",
    { id: z.string().describe("Customer ID") },
    async (input) => jsonContent(await deleteCustomer(input.id))
  );

  server.tool(
    "vex_add_customer_note",
    "Add a note to a customer.",
    {
      id: z.string().describe("Customer ID"),
      note: z.string().describe("Note content"),
      isPublic: z.boolean().optional().describe("Whether the note is public (default: false)"),
    },
    async (input) => jsonContent(await addCustomerNote(input))
  );
}
