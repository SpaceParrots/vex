import { Command } from "commander";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  addCustomerNote,
} from "../services/customers.js";
import { printJson, printSuccess, handleError } from "../output.js";

export function createCustomerCommand(): Command {
  const customer = new Command("customer").description("Customer operations");

  customer
    .command("list")
    .description("List customers")
    .option("--take <n>", "Number of results", parseInt)
    .option("--skip <n>", "Offset", parseInt)
    .option("--email <filter>", "Filter by email")
    .option("--name <filter>", "Filter by name")
    .action(async (opts) => {
      try {
        const data = await listCustomers({
          take: opts.take,
          skip: opts.skip,
          filterByEmail: opts.email,
          filterByName: opts.name,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  customer
    .command("get <id>")
    .description("Get customer by ID")
    .action(async (id: string) => {
      try {
        printJson(await getCustomer(id));
      } catch (err) {
        handleError(err);
      }
    });

  customer
    .command("create")
    .description("Create a new customer")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--first-name <name>", "First name")
    .requiredOption("--last-name <name>", "Last name")
    .option("--phone <number>", "Phone number")
    .option("--title <title>", "Title (Mr, Mrs, etc.)")
    .action(async (opts) => {
      try {
        const data = await createCustomer({
          emailAddress: opts.email,
          firstName: opts.firstName,
          lastName: opts.lastName,
          phoneNumber: opts.phone,
          title: opts.title,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  customer
    .command("update <id>")
    .description("Update a customer")
    .option("--email <email>", "New email address")
    .option("--first-name <name>", "New first name")
    .option("--last-name <name>", "New last name")
    .option("--phone <number>", "New phone number")
    .action(async (id: string, opts) => {
      try {
        const data = await updateCustomer({
          id,
          emailAddress: opts.email,
          firstName: opts.firstName,
          lastName: opts.lastName,
          phoneNumber: opts.phone,
        });
        printJson(data);
      } catch (err) {
        handleError(err);
      }
    });

  customer
    .command("delete <id>")
    .description("Delete a customer")
    .action(async (id: string) => {
      try {
        await deleteCustomer(id);
        printSuccess(`Customer ${id} deleted.`);
      } catch (err) {
        handleError(err);
      }
    });

  customer
    .command("add-note <id>")
    .description("Add a note to a customer")
    .requiredOption("--note <text>", "Note content")
    .option("--public", "Make the note public")
    .action(async (id: string, opts) => {
      try {
        await addCustomerNote({ id, note: opts.note, isPublic: opts.public });
        printSuccess(`Note added to customer ${id}.`);
      } catch (err) {
        handleError(err);
      }
    });

  return customer;
}
