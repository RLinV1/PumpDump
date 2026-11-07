import { randomInt } from "node:crypto";

// Windows can assign port 6667 for listen(0), which fetch forbids as an IRC port.
// The dynamic/private range contains no fetch-forbidden ports.
export async function listenLoopback(server) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(randomInt(49152, 65536), "127.0.0.1", () => {
          server.off("error", onError);
          resolve();
        });
      });
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || attempt === 19) throw error;
    }
  }
}
