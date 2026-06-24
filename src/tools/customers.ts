/** @module tools/customers — `vex_customers` action-dispatch MCP tool (list, get, create, update, delete, add_note). */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addCustomerNote,
  type CustomerListInput,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type AddCustomerNoteInput,
} from "../services/customers.js";
import { jsonContent } from "../output.js";
import { actionTool } from "./action-tool.js";

/** Registers the `vex_customers` MCP tool covering all customer operations. */
export function registerCustomerTools(server: McpServer): void {
  actionTool(server, "vex_customers", "Manage Vendure customers.", {
    list: {
      summary: "List customers with optional filters.",
      shape: {
        take: z.number().optional().describe("Number of results to return"),
        skip: z.number().optional().describe("Number of results to skip"),
        filterByEmail: z.string().optional().describe("Filter by email (contains)"),
        filterByName: z.string().optional().describe("Filter by first or last name (contains)"),
      },
      handler: async (a) => jsonContent(await listCustomers(a as CustomerListInput)),
    },
    get: {
      summary: "Get a single customer by ID with full details.",
      shape: { id: z.string().describe("Customer ID") },
      handler: async (a) => jsonContent(await getCustomer(a.id as string)),
    },
    create: {
      summary: "Create a new customer.",
      shape: {
        emailAddress: z.string().describe("Customer email address"),
        firstName: z.string().describe("First name"),
        lastName: z.string().describe("Last name"),
        phoneNumber: z.string().optional().describe("Phone number"),
        title: z.string().optional().describe("Title (Mr, Mrs, etc.)"),
      },
      handler: async (a) => jsonContent(await createCustomer(a as unknown as CreateCustomerInput)),
    },
    update: {
      summary: "Update an existing customer.",
      shape: {
        id: z.string().describe("Customer ID"),
        emailAddress: z.string().optional().describe("New email address"),
        firstName: z.string().optional().describe("New first name"),
        lastName: z.string().optional().describe("New last name"),
        phoneNumber: z.string().optional().describe("New phone number"),
      },
      handler: async (a) => jsonContent(await updateCustomer(a as unknown as UpdateCustomerInput)),
    },
    delete: {
      summary: "Delete a customer by ID.",
      shape: { id: z.string().describe("Customer ID") },
      handler: async (a) => jsonContent(await deleteCustomer(a.id as string)),
    },
    add_note: {
      summary: "Add a note to a customer.",
      shape: {
        id: z.string().describe("Customer ID"),
        note: z.string().describe("Note content"),
        isPublic: z.boolean().optional().describe("Whether the note is public (default: false)"),
      },
      handler: async (a) => jsonContent(await addCustomerNote(a as unknown as AddCustomerNoteInput)),
    },
  });
}
