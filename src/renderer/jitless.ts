import { configure } from "arktype/config";
import { config as configureZod } from "zod/v4";

configure({ jitless: true });
configureZod({ jitless: true });
