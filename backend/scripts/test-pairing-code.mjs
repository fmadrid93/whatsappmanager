import http from "node:http";

const data = JSON.stringify({ phone: "+595972686891" });

const req = http.request(
  {
    hostname: "127.0.0.1",
    port: 3000,
    path: "/sessions/asuncion_movil_fmadridmovilizador_linea1/pairing-code",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`BODY: ${body}`);
    });
  }
);

req.on("error", (e) => console.error(e));
req.write(data);
req.end();
