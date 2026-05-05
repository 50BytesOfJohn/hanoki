import type { AppServices } from "../../services";
import type { TrustedSenderRegistry } from "../trusted-senders";

export interface IpcHandlerContext {
  services: AppServices;
  trustedSenders: TrustedSenderRegistry;
}
