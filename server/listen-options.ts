import type { ListenOptions } from "node:net";

type ReusePortListenOptions = ListenOptions & { reusePort?: boolean };

export function createListenOptions(port: number, platform = process.platform): ReusePortListenOptions {
  const options: ReusePortListenOptions = {
    port,
    host: "0.0.0.0",
  };

  if (platform !== "win32") {
    options.reusePort = true;
  }

  return options;
}
